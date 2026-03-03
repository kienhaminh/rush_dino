import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { AppConfigView, GatewayConfig } from '@/lib/types';

interface Props {
  config: AppConfigView;
  onChange: (patch: Partial<AppConfigView>) => void;
}

const CHANNELS: { key: keyof GatewayConfig; label: string; description: string }[] = [
  { key: 'telegram', label: 'Telegram', description: 'Enable the Telegram bot gateway.' },
  { key: 'discord', label: 'Discord', description: 'Enable the Discord bot gateway.' },
  { key: 'slack', label: 'Slack', description: 'Enable the Slack bot gateway (requires both bot + app token).' },
  { key: 'webchat', label: 'WebChat', description: 'Enable the built-in WebSocket chat UI.' },
];

export function ConfigSectionGateway({ config, onChange }: Props) {
  function setChannel(key: keyof GatewayConfig, enabled: boolean) {
    onChange({
      gateway: {
        ...config.gateway,
        [key]: { enabled },
      },
    });
  }

  return (
    <div className="space-y-4">
      {CHANNELS.map(({ key, label, description }) => (
        <div key={key} className="flex items-center justify-between rounded-md border border-border/50 p-4">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">{label}</Label>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <Switch
            checked={config.gateway[key].enabled}
            onCheckedChange={(checked) => setChannel(key, checked)}
          />
        </div>
      ))}
    </div>
  );
}
