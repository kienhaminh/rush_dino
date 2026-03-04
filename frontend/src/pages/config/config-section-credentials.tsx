import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CredentialsView } from '@/lib/types';

interface Props {
  credentials: CredentialsView;
  onChange: (patch: Partial<CredentialsView>) => void;
}

/** Fields in display order with labels. */
const FIELDS: { key: keyof CredentialsView; label: string; placeholder: string }[] = [
  { key: 'openai_api_key', label: 'OpenAI API Key', placeholder: 'sk-...' },
  { key: 'anthropic_api_key', label: 'Anthropic API Key', placeholder: 'sk-ant-...' },
  { key: 'brave_api_key', label: 'Brave Search API Key', placeholder: 'BSA...' },
  { key: 'telegram_bot_token', label: 'Telegram Bot Token', placeholder: '123456:ABC...' },
  { key: 'discord_bot_token', label: 'Discord Bot Token', placeholder: 'Bot token' },
  { key: 'slack_bot_token', label: 'Slack Bot Token', placeholder: 'xoxb-...' },
  { key: 'slack_app_token', label: 'Slack App Token (Socket Mode)', placeholder: 'xapp-...' },
];

export function ConfigSectionCredentials({ credentials, onChange }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Existing secrets are shown as <span className="font-mono">***</span>. Leave them unchanged
        to keep the current value. Clear a field to remove the secret.
      </p>
      {FIELDS.map(({ key, label, placeholder }) => (
        <div key={key} className="space-y-1">
          <Label htmlFor={key} className="text-xs">{label}</Label>
          <Input
            id={key}
            type="password"
            autoComplete="off"
            placeholder={credentials[key] ? '***' : placeholder}
            value={credentials[key] ?? ''}
            onChange={(e) => onChange({ [key]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}
