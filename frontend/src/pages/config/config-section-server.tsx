import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { AppConfigView } from '@/lib/types';

interface Props {
  config: AppConfigView;
  onChange: (patch: Partial<AppConfigView>) => void;
}

export function ConfigSectionServer({ config, onChange }: Props) {
  const sandbox = config.execution?.shell_exec_sandbox;

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

      {sandbox ? (
        <div className="space-y-4 rounded-md border border-border/50 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Shell Sandbox Broker</Label>
              <p className="text-xs text-muted-foreground">
                Route `shell_exec` through the mirrored workspace broker under `~/.rushdino/workspaces`.
              </p>
            </div>
            <Switch
              checked={sandbox.enabled}
              onCheckedChange={(checked) =>
                onChange({
                  execution: {
                    ...config.execution,
                    shell_exec_sandbox: {
                      ...sandbox,
                      enabled: checked,
                    },
                  },
                })
              }
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="sandbox-workspace-root" className="text-xs">Workspace Root</Label>
            <Input
              id="sandbox-workspace-root"
              value={sandbox.workspace_root}
              onChange={(e) =>
                onChange({
                  execution: {
                    ...config.execution,
                    shell_exec_sandbox: {
                      ...sandbox,
                      workspace_root: e.target.value,
                    },
                  },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/40 p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Allow Network</Label>
              <p className="text-xs text-muted-foreground">
                Permit outbound network access for sandboxed shell commands.
              </p>
            </div>
            <Switch
              checked={sandbox.allow_network}
              onCheckedChange={(checked) =>
                onChange({
                  execution: {
                    ...config.execution,
                    shell_exec_sandbox: {
                      ...sandbox,
                      allow_network: checked,
                    },
                  },
                })
              }
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="sandbox-extra-write-roots" className="text-xs">
              Extra Write Roots
            </Label>
            <Textarea
              id="sandbox-extra-write-roots"
              className="min-h-24 font-mono text-xs"
              value={sandbox.extra_write_roots.join('\n')}
              onChange={(e) =>
                onChange({
                  execution: {
                    ...config.execution,
                    shell_exec_sandbox: {
                      ...sandbox,
                      extra_write_roots: e.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean),
                    },
                  },
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              One absolute or RushDino-home-relative path per line.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
