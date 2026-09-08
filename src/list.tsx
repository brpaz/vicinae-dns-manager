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
import type { ActiveConnection, DnsPreset, DnsProbeResult } from './types';
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

export default function Command() {
  const [isLoading, setIsLoading] = useState(true);
  const [connection, setConnection] = useState<ActiveConnection | null>(null);
  const [active, setActive] = useState<DnsProbeResult | null>(null);
  const [presetResults, setPresetResults] = useState<
    Map<string, DnsProbeResult>
  >(new Map());

  const load = useCallback(async () => {
    setIsLoading(true);

    try {
      const conn = await getActiveConnection();
      setConnection(conn);

      const activeServers = await getActiveDnsServers(conn.device);
      const presetServerLists = DNS_PRESETS.map((preset) => preset.servers);

      const [activeLatencies, ...presetLatencies] = await Promise.all([
        measureLatencies(activeServers.slice(0, 1)),
        ...presetServerLists.map((servers) =>
          measureLatencies(servers.slice(0, 1))
        ),
      ]);

      setActive({
        servers: activeServers,
        latencyMs: activeLatencies[0] ?? null,
      });

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

  return (
    <List isLoading={isLoading}>
      <List.Section title="Active">
        <List.Item
          title={connection ? connection.name : 'No active connection'}
          subtitle={active ? active.servers.join(', ') : undefined}
          icon={{ source: Icon.Network, tintColor: Color.Blue }}
          accessories={active ? [latencyAccessory(active.latencyMs)] : []}
          actions={<ActionPanel>{refreshAction}</ActionPanel>}
        />
      </List.Section>

      <List.Section title="Presets">
        {DNS_PRESETS.map((preset) => {
          const result = presetResults.get(preset.id);
          const isActive =
            active !== null &&
            active.servers.length > 0 &&
            preset.servers.includes(active.servers[0]);

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
