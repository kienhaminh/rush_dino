import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import type { AppConfigView, CredentialsView, GatewayConfig } from '@/lib/types';

interface Props {
  config: AppConfigView;
  onChange: (patch: Partial<AppConfigView>) => void;
  credentials: CredentialsView;
  onCredentialsChange: (patch: Partial<CredentialsView>) => void;
}

const CHANNELS: { key: keyof GatewayConfig; label: string; description: string }[] = [
  { key: 'telegram', label: 'Telegram', description: 'Enable the Telegram bot gateway.' },
  { key: 'discord', label: 'Discord', description: 'Enable the Discord bot gateway.' },
  { key: 'slack', label: 'Slack', description: 'Enable the Slack bot gateway (requires both bot + app token).' },
  { key: 'webchat', label: 'WebChat', description: 'Enable the built-in WebSocket chat UI.' },
];

type TelegramPanelProps = Props;

// Extracted into its own component so chatIdInput gets its own mount/unmount
// lifecycle — stale input is cleared automatically when Telegram is toggled off.
function TelegramPanel({ config, onChange, credentials, onCredentialsChange }: TelegramPanelProps) {
  const [chatIdInput, setChatIdInput] = useState('');

  function addChatId() {
    if (!/^-?\d+$/.test(chatIdInput.trim())) return;
    const id = parseInt(chatIdInput.trim(), 10);
    if ((config.allowed_chat_ids ?? []).includes(id)) {
      setChatIdInput('');
      return;
    }
    onChange({ allowed_chat_ids: [...(config.allowed_chat_ids ?? []), id] });
    setChatIdInput('');
  }

  function removeChatId(id: number) {
    onChange({ allowed_chat_ids: (config.allowed_chat_ids ?? []).filter((x) => x !== id) });
  }

  const chatIdValid = /^-?\d+$/.test(chatIdInput.trim());

  return (
    <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-4">
      {/* Bot token */}
      <div className="space-y-1">
        <Label htmlFor="telegram-token" className="text-xs">Bot Token</Label>
        <Input
          id="telegram-token"
          type="password"
          autoComplete="off"
          placeholder={credentials.telegram_bot_token ? '***' : 'Enter bot token'}
          value={credentials.telegram_bot_token ?? ''}
          onChange={(e) => onCredentialsChange({ telegram_bot_token: e.target.value })}
        />
      </div>

      {/* Allowed chat IDs */}
      <div className="space-y-2">
        <Label htmlFor="telegram-chat-id" className="text-xs">Allowed Chat IDs</Label>
        <p className="text-xs text-muted-foreground">
          Leave empty to allow all chats. Add numeric Telegram chat IDs to restrict access.
        </p>

        {/* Chip list — guarded against null/undefined from backend */}
        {(config.allowed_chat_ids ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {(config.allowed_chat_ids ?? []).map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-2.5 py-0.5 text-xs font-mono"
              >
                {id}
                <button
                  type="button"
                  onClick={() => removeChatId(id)}
                  className="text-muted-foreground hover:text-foreground leading-none"
                  aria-label={`Remove chat ID ${id}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Add input */}
        <div className="flex gap-2">
          <Input
            id="telegram-chat-id"
            className="w-48 font-mono text-sm"
            placeholder="e.g. 123456789"
            value={chatIdInput}
            onChange={(e) => setChatIdInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && chatIdValid && addChatId()}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!chatIdValid}
            onClick={addChatId}
          >
            Add
          </Button>
        </div>
        {chatIdInput.trim() !== '' && !chatIdValid && (
          <p className="text-xs text-destructive">Must be a valid integer.</p>
        )}
      </div>
    </div>
  );
}

export function ConfigSectionGateway({ config, onChange, credentials, onCredentialsChange }: Props) {
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
        <div key={key} className="rounded-md border border-border/50">
          {/* Toggle row */}
          <div className="flex items-center justify-between p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">{label}</Label>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <Switch
              checked={config.gateway[key].enabled}
              onCheckedChange={(checked) => setChannel(key, checked)}
            />
          </div>

          {/* Telegram detail panel — rendered as its own component so local state
              (chatIdInput) is destroyed when Telegram is disabled and recreated fresh
              when it is re-enabled. */}
          {key === 'telegram' && config.gateway.telegram.enabled && (
            <TelegramPanel
              config={config}
              onChange={onChange}
              credentials={credentials}
              onCredentialsChange={onCredentialsChange}
            />
          )}
        </div>
      ))}
    </div>
  );
}
