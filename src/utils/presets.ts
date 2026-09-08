import type { DnsPreset } from '../types';

export const DNS_PRESETS: DnsPreset[] = [
  { id: 'cloudflare', name: 'Cloudflare', servers: ['1.1.1.1', '1.0.0.1'] },
  { id: 'google', name: 'Google', servers: ['8.8.8.8', '8.8.4.4'] },
  {
    id: 'quad9',
    name: 'Quad9',
    servers: ['9.9.9.9', '149.112.112.112'],
  },
  {
    id: 'opendns',
    name: 'OpenDNS',
    servers: ['208.67.222.222', '208.67.220.220'],
  },
];
