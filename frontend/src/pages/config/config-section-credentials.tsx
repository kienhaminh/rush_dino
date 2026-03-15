import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CredentialsView } from '@/lib/types';

interface Props {
  credentials: CredentialsView;
  onChange: (patch: Partial<CredentialsView>) => void;
}

type CredentialKey = Exclude<keyof CredentialsView, 'profiles'>;

/** Fields in display order with labels.
 *  openai_api_key / anthropic_api_key are intentionally excluded — provider API
 *  keys are managed per-profile in the Model Profiles section instead.
 */
const FIELDS: { key: CredentialKey; label: string; placeholder: string }[] = [
  { key: 'brave_api_key', label: 'Brave Search API Key', placeholder: 'BSA...' },
  { key: 'gemini_api_key', label: 'Gemini API Key', placeholder: 'AIza...' },
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
          <Label htmlFor={key} className="text-xs">
            {label}
          </Label>
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
