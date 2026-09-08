import { readFile } from 'node:fs/promises';
import { execa } from 'execa';
import type { ActiveConnection } from '../types';

/**
 * Reads the kernel routing table directly instead of shelling out to `ip route`,
 * since NetworkManager doesn't expose "which device owns the default route" itself.
 */
async function getDefaultRouteDevice(): Promise<string> {
  const content = await readFile('/proc/net/route', 'utf8');
  const lines = content.trim().split('\n').slice(1);

  let bestDevice: string | null = null;
  let bestMetric = Number.POSITIVE_INFINITY;

  for (const line of lines) {
    const fields = line.trim().split(/\s+/);
    const iface = fields[0];
    const destination = fields[1];
    const metric = Number.parseInt(fields[6], 10);

    if (destination !== '00000000') {
      continue;
    }

    if (metric < bestMetric) {
      bestMetric = metric;
      bestDevice = iface;
    }
  }

  if (!bestDevice) {
    throw new Error('No default route found on this machine');
  }

  return bestDevice;
}

export async function getActiveConnection(): Promise<ActiveConnection> {
  const device = await getDefaultRouteDevice();
  const { stdout } = await execa('nmcli', [
    '-g',
    'GENERAL.CONNECTION',
    'device',
    'show',
    device,
  ]);
  const name = stdout.trim();

  if (!name || name === '--') {
    throw new Error(
      `No active NetworkManager connection on device "${device}"`
    );
  }

  return { name, device };
}

export async function getActiveDnsServers(device: string): Promise<string[]> {
  const { stdout } = await execa('nmcli', [
    '-g',
    'IP4.DNS',
    'device',
    'show',
    device,
  ]);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function setDnsServers(
  connection: ActiveConnection,
  servers: string[]
): Promise<void> {
  await execa('nmcli', [
    'connection',
    'modify',
    connection.name,
    'ipv4.dns',
    servers.join(' '),
    'ipv4.ignore-auto-dns',
    'yes',
  ]);
  await execa('nmcli', ['device', 'reapply', connection.device]);
}

export async function resetDnsToAutomatic(
  connection: ActiveConnection
): Promise<void> {
  await execa('nmcli', [
    'connection',
    'modify',
    connection.name,
    'ipv4.dns',
    '',
    'ipv4.ignore-auto-dns',
    'no',
  ]);
  await execa('nmcli', ['device', 'reapply', connection.device]);
}
