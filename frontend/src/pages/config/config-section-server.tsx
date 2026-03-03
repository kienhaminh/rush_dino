import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { AppConfigView } from '@/lib/types';

interface Props {
  config: AppConfigView;
  onChange: (patch: Partial<AppConfigView>) => void;
}

export function ConfigSectionServer({ config, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="server-host" className="text-xs">Host</Label>
        <Input
          id="server-host"
          value={config.host}
          onChange={(e) => onChange({ host: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="server-port" className="text-xs">Port</Label>
        <Input
          id="server-port"
          type="number"
          min={1}
          max={65535}
          value={config.port}
          onChange={(e) => onChange({ port: parseInt(e.target.value, 10) || config.port })}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border border-border/50 p-4">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">HMAC Auth</Label>
          <p className="text-xs text-muted-foreground">
            Require HMAC-SHA256 authentication on all API requests.
          </p>
        </div>
        <Switch
          checked={config.security.hmac_auth_enabled}
          onCheckedChange={(checked) =>
            onChange({ security: { ...config.security, hmac_auth_enabled: checked } })
          }
        />
      </div>
    </div>
  );
}
