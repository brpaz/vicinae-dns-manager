import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Keyboard,
  List,
  showToast,
  Toast,
} from '@vicinae/api';
import { useCallback, useEffect, useState } from 'react';
import type {
  ActiveConnection,
  DnsPreset,
  DnsProbeResult,
  DnsSource,
  UpstreamCandidate,
} from './types';
import {
  getDnsmasqUpstreamServers,
  isDnsmasqModeActive,
} from './utils/dnsmasq';
import { measureLatencies } from './utils/latency';
import {
  getActiveConnection,
  getActiveDnsServers,
  resetDnsToAutomatic,
  setDnsServers,
} from './utils/network-manager';
import { DNS_PRESETS } from './utils/presets';

function latencyAccessory(latencyMs: number | null): List.Item.Accessory {
  if (latencyMs === null) {
    return { text: { value: 'timeout', color: Color.Red }, icon: Icon.Signal0 };
  }
  if (latencyMs < 50) {
    return {
      text: { value: `${latencyMs} ms`, color: Color.Green },
      icon: Icon.FullSignal,
    };
  }
  if (latencyMs < 150) {
    return {
      text: { value: `${latencyMs} ms`, color: Color.Yellow },
      icon: Icon.Signal2,
    };
  }
  return {
    text: { value: `${latencyMs} ms`, color: Color.Red },
    icon: Icon.Signal1,
  };
}

/**
 * The configured upstream servers, in priority order, plus where they came from.
 *
 * In dns=dnsmasq mode, dnsmasq forwards to whatever the active connection's own
 * DNS is set to (DHCP-provided, or manually set by switching a preset here) FIRST,
 * falling back to the static server= entries in dnsmasq.d/*.conf only if that
 * fails — the static entries alone would never reflect a preset switch, since
 * switching only ever touches the connection's DNS, not those files.
 */
async function resolveUpstreamCandidates(
  device: string
): Promise<{ source: DnsSource; servers: string[] }> {
  if (await isDnsmasqModeActive()) {
    const connectionServers = await getActiveDnsServers(device);
    const staticFallback = await getDnsmasqUpstreamServers();
    const servers = [
      ...connectionServers,
      ...staticFallback.filter((server) => !connectionServers.includes(server)),
    ];

    if (servers.length > 0) {
      return { source: 'dnsmasq', servers };
    }
  }

  return {
    source: 'networkmanager',
    servers: await getActiveDnsServers(device),
  };
}

export default function Command() {
  const [isLoading, setIsLoading] = useState(true);
  const [connection, setConnection] = useState<ActiveConnection | null>(null);
  const [dnsSource, setDnsSource] = useState<DnsSource | null>(null);
  const [upstreamCandidates, setUpstreamCandidates] = useState<
    UpstreamCandidate[]
  >([]);
  const [presetResults, setPresetResults] = useState<
    Map<string, DnsProbeResult>
  >(new Map());

  const load = useCallback(async () => {
    setIsLoading(true);

    try {
      const conn = await getActiveConnection();
      setConnection(conn);

      const { source, servers } = await resolveUpstreamCandidates(conn.device);
      setDnsSource(source);

      const presetServerLists = DNS_PRESETS.map((preset) =>
        preset.servers.slice(0, 1)
      );

      const [upstreamLatencies, ...presetLatencies] = await Promise.all([
        measureLatencies(servers),
        ...presetServerLists.map((s) => measureLatencies(s)),
      ]);

      setUpstreamCandidates(
        servers.map((server, index) => ({
          server,
          latencyMs: upstreamLatencies[index] ?? null,
        }))
      );

      const results = new Map<string, DnsProbeResult>();
      DNS_PRESETS.forEach((preset, index) => {
        results.set(preset.id, {
          servers: preset.servers,
          latencyMs: presetLatencies[index][0] ?? null,
        });
      });
      setPresetResults(results);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: 'Failed to read DNS configuration',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only run on mount
  useEffect(() => {
    load();
  }, []);

  const applyPreset = useCallback(
    async (preset: DnsPreset) => {
      if (!connection) return;

      setIsLoading(true);
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: `Switching to ${preset.name}...`,
      });

      try {
        await setDnsServers(connection, preset.servers);
        toast.style = Toast.Style.Success;
        toast.title = `DNS switched to ${preset.name}`;
        toast.message = preset.servers.join(', ');
      } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.title = 'Failed to switch DNS';
        toast.message = error instanceof Error ? error.message : String(error);
      } finally {
        await load();
      }
    },
    [connection, load]
  );

  const resetToAutomatic = useCallback(async () => {
    if (!connection) return;

    setIsLoading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: 'Switching to automatic DNS...',
    });

    try {
      await resetDnsToAutomatic(connection);
      toast.style = Toast.Style.Success;
      toast.title = 'DNS set to automatic (DHCP)';
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = 'Failed to reset DNS';
      toast.message = error instanceof Error ? error.message : String(error);
    } finally {
      await load();
    }
  }, [connection, load]);

  const refreshAction = (
    <Action
      title="Refresh"
      icon={Icon.RotateClockwise}
      shortcut={Keyboard.Shortcut.Common.Refresh}
      onAction={load}
    />
  );

  // dnsmasq applies strict-order + fallback, trying candidates in configured order
  // and skipping unreachable ones — the first one that actually answers here is
  // the best available approximation of "the server currently in use".
  const activeCandidate =
    upstreamCandidates.find((candidate) => candidate.latencyMs !== null) ??
    upstreamCandidates[0];

  return (
    <List isLoading={isLoading}>
      <List.Section title="Active">
        <List.Item
          title={connection ? connection.name : 'No active connection'}
          subtitle={activeCandidate ? activeCandidate.server : undefined}
          icon={{ source: Icon.Network, tintColor: Color.Blue }}
          accessories={[
            ...(activeCandidate
              ? [latencyAccessory(activeCandidate.latencyMs)]
              : []),
            ...(dnsSource
              ? [
                  {
                    tag: dnsSource === 'dnsmasq' ? 'dnsmasq' : 'NetworkManager',
                  },
                ]
              : []),
          ]}
          actions={<ActionPanel>{refreshAction}</ActionPanel>}
        />
      </List.Section>

      {dnsSource === 'dnsmasq' && upstreamCandidates.length > 1 && (
        <List.Section title="Configured Upstream (dnsmasq, in priority order)">
          {upstreamCandidates.map((candidate) => (
            <List.Item
              key={candidate.server}
              title={candidate.server}
              icon={
                candidate.server === activeCandidate?.server
                  ? { source: Icon.CheckCircle, tintColor: Color.Green }
                  : Icon.Plug
              }
              accessories={[latencyAccessory(candidate.latencyMs)]}
              actions={<ActionPanel>{refreshAction}</ActionPanel>}
            />
          ))}
        </List.Section>
      )}

      <List.Section title="Presets">
        {DNS_PRESETS.map((preset) => {
          const result = presetResults.get(preset.id);
          const isActive =
            activeCandidate !== undefined &&
            preset.servers.includes(activeCandidate.server);

          return (
            <List.Item
              key={preset.id}
              title={preset.name}
              subtitle={preset.servers.join(', ')}
              icon={
                isActive
                  ? { source: Icon.CheckCircle, tintColor: Color.Green }
                  : Icon.Globe01
              }
              accessories={result ? [latencyAccessory(result.latencyMs)] : []}
              actions={
                <ActionPanel>
                  <Action
                    title={`Switch to ${preset.name}`}
                    icon={Icon.Repeat}
                    onAction={() => applyPreset(preset)}
                  />
                  {refreshAction}
                </ActionPanel>
              }
            />
          );
        })}
        <List.Item
          title="Automatic (DHCP)"
          subtitle="Use the DNS server assigned by your network"
          icon={Icon.Plug}
          actions={
            <ActionPanel>
              <Action
                title="Use Automatic DNS"
                icon={Icon.Repeat}
                onAction={resetToAutomatic}
              />
              {refreshAction}
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
