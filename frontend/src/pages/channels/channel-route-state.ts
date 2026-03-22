export type ChannelPanel = 'overview' | 'settings' | 'instances';

const CHANNEL_PANELS: ChannelPanel[] = ['overview', 'settings', 'instances'];

export function getValidChannelPanel(value: string | null | undefined): ChannelPanel {
  return CHANNEL_PANELS.find((panel) => panel === value) ?? 'overview';
}

export function buildChannelsPath({
  channel,
  panel,
}: {
  channel: string | null;
  panel: ChannelPanel;
}) {
  const path = channel ? `/gateway/${encodeURIComponent(channel)}` : '/gateway';
  if (panel === 'overview') {
    return path;
  }

  const params = new URLSearchParams();
  params.set('panel', panel);
  return `${path}?${params.toString()}`;
}
