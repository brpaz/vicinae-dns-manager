import { Resolver } from 'node:dns/promises';

const PROBE_HOSTNAME = 'cloudflare.com';
const TIMEOUT_MS = 2000;

/** Measures round-trip time for a real DNS query against `server`, in ms. Null if it timed out or errored. */
export async function measureDnsLatency(
  server: string
): Promise<number | null> {
  const resolver = new Resolver();
  resolver.setServers([server]);

  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), TIMEOUT_MS);
  });

  const start = performance.now();
  const query = resolver
    .resolve4(PROBE_HOSTNAME)
    .then(() => performance.now() - start);

  try {
    const result = await Promise.race([query, timeout]);
    return result === null ? null : Math.round(result);
  } catch {
    return null;
  }
}

export async function measureLatencies(
  servers: string[]
): Promise<(number | null)[]> {
  return Promise.all(servers.map(measureDnsLatency));
}
