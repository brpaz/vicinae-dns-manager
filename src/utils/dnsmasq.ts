import { readdir, readFile } from 'node:fs/promises';

const NM_CONF_DIRS = [
  '/etc/NetworkManager/conf.d',
  '/usr/lib/NetworkManager/conf.d',
];
const NM_MAIN_CONF = '/etc/NetworkManager/NetworkManager.conf';
const DNSMASQ_CONF_DIR = '/etc/NetworkManager/dnsmasq.d';

/** True general-purpose upstream server line, e.g. "server=1.1.1.1" or "server=1.1.1.1#5353". */
const UPSTREAM_SERVER_LINE = /^server=([0-9.]+)(?:#\d+)?$/;

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

function confHasDnsmasqPlugin(content: string): boolean {
  // A [main] section with dns=dnsmasq, ignoring which other keys/sections surround it.
  return /^\s*dns\s*=\s*dnsmasq\s*$/m.test(content);
}

/**
 * NetworkManager can proxy all DNS resolution through its own embedded dnsmasq
 * (NetworkManager.conf [main] dns=dnsmasq). When that's active, `nmcli ...
 * IP4.DNS` only reports the DHCP-received upstream, not what dnsmasq is
 * actually configured to forward to via /etc/NetworkManager/dnsmasq.d/*.conf.
 */
export async function isDnsmasqModeActive(): Promise<boolean> {
  const mainConf = await readFileSafe(NM_MAIN_CONF);
  if (mainConf && confHasDnsmasqPlugin(mainConf)) {
    return true;
  }

  for (const dir of NM_CONF_DIRS) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }

    for (const entry of entries
      .filter((name) => name.endsWith('.conf'))
      .sort()) {
      const content = await readFileSafe(`${dir}/${entry}`);
      if (content && confHasDnsmasqPlugin(content)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Reads the general-purpose upstream servers NetworkManager's embedded dnsmasq
 * forwards to, in the priority order dnsmasq itself applies them (conf-dir
 * files load in filename order, "server=" lines within a file load in order;
 * dnsmasq's own strict-order then tries them in that sequence, skipping
 * unreachable ones). Domain-scoped split-DNS lines (`server=/example.com/ip`)
 * are excluded — those are conditional forwards, not general upstream servers.
 */
export async function getDnsmasqUpstreamServers(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(DNSMASQ_CONF_DIR);
  } catch {
    return [];
  }

  const servers: string[] = [];

  for (const entry of entries.filter((name) => name.endsWith('.conf')).sort()) {
    const content = await readFileSafe(`${DNSMASQ_CONF_DIR}/${entry}`);
    if (!content) continue;

    for (const line of content.split('\n')) {
      const match = UPSTREAM_SERVER_LINE.exec(line.trim());
      if (match && !servers.includes(match[1])) {
        servers.push(match[1]);
      }
    }
  }

  return servers;
}
