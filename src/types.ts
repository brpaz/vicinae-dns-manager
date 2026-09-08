export interface DnsPreset {
  id: string;
  name: string;
  servers: string[];
}

export interface ActiveConnection {
  name: string;
  device: string;
}

export interface DnsProbeResult {
  servers: string[];
  /** Milliseconds to resolve a test hostname against the first server, or null if it timed out/failed. */
  latencyMs: number | null;
}

export interface UpstreamCandidate {
  server: string;
  latencyMs: number | null;
}

export type DnsSource = 'dnsmasq' | 'networkmanager';
