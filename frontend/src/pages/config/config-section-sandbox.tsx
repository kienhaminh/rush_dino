/**
 * ConfigSectionSandbox — per-agent sandbox policy editor.
 *
 * Displays filesystem, network, and process rules from the agent's sandbox.yaml.
 * When no policy exists, shows an empty state with a "Create Policy" button.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getAgentSandbox, putAgentSandbox } from '@/lib/api';
import type {
  CredentialProvider,
  NetworkRule,
  PathRule,
  SandboxPolicy,
} from '@/lib/types';
import {
  Loader2,
  Plus,
  Save,
  Shield,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// The default policy applied when an agent has no sandbox.yaml yet.
const DEFAULT_POLICY: SandboxPolicy = {
  version: '1',
  sandbox: {
    filesystem: { default: 'deny', allow: [], deny: [] },
    process: {
      allow_privileged: false,
      max_concurrent: 5,
      deny_commands: ['sudo', 'rm -rf'],
    },
    network: { default: 'deny', on_block: 'prompt', allow: [] },
  },
  providers: [],
};

interface Props {
  agentId: string;
}

// ---------------------------------------------------------------------------
// Sub-components for each policy section
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
      {children}
    </p>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <p className="text-xs text-muted-foreground italic py-1">{label}</p>
  );
}

// Filesystem allow rules table
function FilesystemAllowTable({
  rules,
  onChange,
}: {
  rules: PathRule[];
  onChange: (rules: PathRule[]) => void;
}) {
  const addRow = () =>
    onChange([...rules, { path: '', mode: 'read-only' }]);

  const updateRow = (i: number, patch: Partial<PathRule>) =>
    onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const removeRow = (i: number) => onChange(rules.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-1.5">
      {rules.length === 0 && <EmptyRow label="No allow paths configured." />}
      {rules.map((rule, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={rule.path}
            onChange={(e) => updateRow(i, { path: e.target.value })}
            placeholder="/workspace"
            className="flex-1 h-8 text-xs font-mono"
          />
          <Select
            value={rule.mode}
            onValueChange={(v) => updateRow(i, { mode: v as PathRule['mode'] })}
          >
            <SelectTrigger className="w-[110px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="read-only">read-only</SelectItem>
              <SelectItem value="read-write">read-write</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeRow(i)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={addRow}>
        <Plus className="w-3 h-3" /> Add Path
      </Button>
    </div>
  );
}

// Filesystem deny paths list
function FilesystemDenyList({
  paths,
  onChange,
}: {
  paths: string[];
  onChange: (paths: string[]) => void;
}) {
  const addRow = () => onChange([...paths, '']);
  const updateRow = (i: number, v: string) =>
    onChange(paths.map((p, idx) => (idx === i ? v : p)));
  const removeRow = (i: number) => onChange(paths.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-1.5">
      {paths.length === 0 && <EmptyRow label="No deny paths configured." />}
      {paths.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={p}
            onChange={(e) => updateRow(i, e.target.value)}
            placeholder="/etc/passwd"
            className="flex-1 h-8 text-xs font-mono"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeRow(i)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={addRow}>
        <Plus className="w-3 h-3" /> Add Deny Path
      </Button>
    </div>
  );
}

// Network allow rules table
function NetworkAllowTable({
  rules,
  onChange,
}: {
  rules: NetworkRule[];
  onChange: (rules: NetworkRule[]) => void;
}) {
  const addRow = () =>
    onChange([...rules, { host: '', port: 443, methods: ['GET'], paths: ['/*'] }]);

  const updateRow = (i: number, patch: Partial<NetworkRule>) =>
    onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const removeRow = (i: number) => onChange(rules.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-1.5">
      {rules.length === 0 && <EmptyRow label="No allow rules configured." />}
      {rules.map((rule, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Input
            value={rule.host}
            onChange={(e) => updateRow(i, { host: e.target.value })}
            placeholder="api.example.com"
            className="w-[200px] h-8 text-xs font-mono"
          />
          <Input
            type="number"
            value={rule.port}
            onChange={(e) => updateRow(i, { port: Number(e.target.value) })}
            placeholder="443"
            className="w-[70px] h-8 text-xs font-mono"
          />
          <Input
            value={rule.methods.join(',')}
            onChange={(e) =>
              updateRow(i, { methods: e.target.value.split(',').map((m) => m.trim()) })
            }
            placeholder="GET,POST"
            className="w-[110px] h-8 text-xs font-mono"
          />
          <Input
            value={rule.paths.join(',')}
            onChange={(e) =>
              updateRow(i, { paths: e.target.value.split(',').map((p) => p.trim()) })
            }
            placeholder="/*"
            className="flex-1 h-8 text-xs font-mono"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeRow(i)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      {rules.length === 0 && (
        <div className="text-[10px] text-muted-foreground/60 font-mono">
          Columns: host · port · methods (CSV) · paths (CSV)
        </div>
      )}
      <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={addRow}>
        <Plus className="w-3 h-3" /> Add Rule
      </Button>
    </div>
  );
}

// Process deny commands list
function DenyCommandsList({
  commands,
  onChange,
}: {
  commands: string[];
  onChange: (commands: string[]) => void;
}) {
  const addRow = () => onChange([...commands, '']);
  const updateRow = (i: number, v: string) =>
    onChange(commands.map((c, idx) => (idx === i ? v : c)));
  const removeRow = (i: number) => onChange(commands.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-1.5">
      {commands.length === 0 && <EmptyRow label="No denied commands." />}
      {commands.map((cmd, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={cmd}
            onChange={(e) => updateRow(i, e.target.value)}
            placeholder="sudo"
            className="flex-1 h-8 text-xs font-mono"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeRow(i)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={addRow}>
        <Plus className="w-3 h-3" /> Add Command
      </Button>
    </div>
  );
}

// Credential providers table (env var values shown masked)
function CredentialProvidersTable({
  providers,
  onChange,
}: {
  providers: CredentialProvider[];
  onChange: (providers: CredentialProvider[]) => void;
}) {
  const addProvider = () => onChange([...providers, { name: '', inject: {} }]);
  const removeProvider = (i: number) => onChange(providers.filter((_, idx) => idx !== i));
  const updateProviderName = (i: number, name: string) =>
    onChange(providers.map((p, idx) => (idx === i ? { ...p, name } : p)));

  const addEnvVar = (pi: number) => {
    const p = providers[pi];
    const inject = { ...p.inject, '': '' };
    onChange(providers.map((pv, idx) => (idx === pi ? { ...pv, inject } : pv)));
  };

  const updateEnvVar = (pi: number, oldKey: string, newKey: string, newVal: string) => {
    const p = providers[pi];
    const inject: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.inject)) {
      if (k === oldKey) {
        inject[newKey] = newVal;
      } else {
        inject[k] = v;
      }
    }
    onChange(providers.map((pv, idx) => (idx === pi ? { ...pv, inject } : pv)));
  };

  const removeEnvVar = (pi: number, key: string) => {
    const p = providers[pi];
    const inject = { ...p.inject };
    delete inject[key];
    onChange(providers.map((pv, idx) => (idx === pi ? { ...pv, inject } : pv)));
  };

  return (
    <div className="space-y-3">
      {providers.length === 0 && <EmptyRow label="No credential providers configured." />}
      {providers.map((prov, pi) => (
        <div key={pi} className="border border-border/40 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={prov.name}
              onChange={(e) => updateProviderName(pi, e.target.value)}
              placeholder="Provider name (e.g. github)"
              className="flex-1 h-8 text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeProvider(pi)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="space-y-1.5 pl-2">
            {Object.entries(prov.inject).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                <Input
                  value={key}
                  onChange={(e) => updateEnvVar(pi, key, e.target.value, val)}
                  placeholder="ENV_VAR"
                  className="w-[140px] h-7 text-xs font-mono"
                />
                <span className="text-muted-foreground text-xs">=</span>
                {/* Values are masked — show placeholder to avoid leaking secrets in the UI */}
                <Input
                  value="***"
                  readOnly
                  placeholder="***"
                  className="flex-1 h-7 text-xs font-mono text-muted-foreground"
                  title="Secret value is stored server-side and not returned to the UI"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeEnvVar(pi, key)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-1 h-6 text-[10px]"
              onClick={() => addEnvVar(pi)}
            >
              <Plus className="w-2.5 h-2.5" /> Add Env Var
            </Button>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={addProvider}>
        <Plus className="w-3 h-3" /> Add Provider
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConfigSectionSandbox({ agentId }: Props) {
  const [policy, setPolicy] = useState<SandboxPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const p = await getAgentSandbox(agentId);
      setPolicy(p);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load sandbox policy.');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreatePolicy = () => {
    setPolicy(JSON.parse(JSON.stringify(DEFAULT_POLICY)));
  };

  const handleSave = async () => {
    if (!policy) return;
    setSaving(true);
    try {
      await putAgentSandbox(agentId, policy);
      toast.success('Sandbox policy saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save sandbox policy.');
    } finally {
      setSaving(false);
    }
  };

  // Convenience updater helpers that keep the deep policy tree immutable
  const updateFilesystemAllow = (allow: PathRule[]) =>
    setPolicy((p) => p && { ...p, sandbox: { ...p.sandbox, filesystem: { ...p.sandbox.filesystem, allow } } });

  const updateFilesystemDeny = (deny: string[]) =>
    setPolicy((p) => p && { ...p, sandbox: { ...p.sandbox, filesystem: { ...p.sandbox.filesystem, deny } } });

  const updateNetworkAllow = (allow: NetworkRule[]) =>
    setPolicy((p) => p && { ...p, sandbox: { ...p.sandbox, network: { ...p.sandbox.network, allow } } });

  const updateProviders = (providers: CredentialProvider[]) =>
    setPolicy((p) => p && { ...p, providers });

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading sandbox policy…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
        {loadError}
      </div>
    );
  }

  // No policy configured — show empty state
  if (!policy) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-3">
        <ShieldOff className="w-8 h-8 mx-auto text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium text-foreground">No sandbox policy configured</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a policy to restrict filesystem, network, and process access.
          </p>
        </div>
        <Button size="sm" onClick={handleCreatePolicy} className="gap-1.5">
          <Shield className="w-3.5 h-3.5" /> Create Policy
        </Button>
      </div>
    );
  }

  const { sandbox, providers } = policy;

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Sandbox Policy</span>
          <Badge variant="outline" className="text-[10px]">v{policy.version}</Badge>
        </div>
      </div>

      {/* Filesystem */}
      <div className="space-y-4 rounded-lg border border-border/40 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Filesystem</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Default:</span>
            <Select
              value={sandbox.filesystem.default}
              onValueChange={(v) =>
                setPolicy((p) =>
                  p && {
                    ...p,
                    sandbox: {
                      ...p.sandbox,
                      filesystem: {
                        ...p.sandbox.filesystem,
                        default: v as 'allow' | 'deny',
                      },
                    },
                  },
                )
              }
            >
              <SelectTrigger className="h-7 w-[80px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">allow</SelectItem>
                <SelectItem value="deny">deny</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <SectionLabel>Allow Paths</SectionLabel>
          <FilesystemAllowTable rules={sandbox.filesystem.allow} onChange={updateFilesystemAllow} />
        </div>
        <div>
          <SectionLabel>Deny Paths</SectionLabel>
          <FilesystemDenyList paths={sandbox.filesystem.deny} onChange={updateFilesystemDeny} />
        </div>
      </div>

      {/* Network */}
      <div className="space-y-4 rounded-lg border border-border/40 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-semibold">Network</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Default:</span>
              <Select
                value={sandbox.network.default}
                onValueChange={(v) =>
                  setPolicy((p) =>
                    p && {
                      ...p,
                      sandbox: {
                        ...p.sandbox,
                        network: { ...p.sandbox.network, default: v as 'allow' | 'deny' },
                      },
                    },
                  )
                }
              >
                <SelectTrigger className="h-7 w-[80px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">allow</SelectItem>
                  <SelectItem value="deny">deny</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">On block:</span>
              <Select
                value={sandbox.network.on_block}
                onValueChange={(v) =>
                  setPolicy((p) =>
                    p && {
                      ...p,
                      sandbox: {
                        ...p.sandbox,
                        network: {
                          ...p.sandbox.network,
                          on_block: v as 'prompt' | 'deny' | 'hard-stop',
                        },
                      },
                    },
                  )
                }
              >
                <SelectTrigger className="h-7 w-[100px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prompt">prompt</SelectItem>
                  <SelectItem value="deny">deny</SelectItem>
                  <SelectItem value="hard-stop">hard-stop</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div>
          <SectionLabel>Allow Rules (host · port · methods · paths)</SectionLabel>
          <NetworkAllowTable rules={sandbox.network.allow} onChange={updateNetworkAllow} />
        </div>
      </div>

      {/* Process */}
      <div className="space-y-4 rounded-lg border border-border/40 p-4">
        <p className="text-sm font-semibold">Process</p>
        <div className="flex items-center gap-6 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sandbox.process.allow_privileged}
              onChange={(e) =>
                setPolicy((p) =>
                  p && {
                    ...p,
                    sandbox: {
                      ...p.sandbox,
                      process: { ...p.sandbox.process, allow_privileged: e.target.checked },
                    },
                  },
                )
              }
              className="rounded"
            />
            <span className="text-xs">Allow privileged processes</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Max concurrent:</span>
            <Input
              type="number"
              min={1}
              max={100}
              value={sandbox.process.max_concurrent}
              onChange={(e) =>
                setPolicy((p) =>
                  p && {
                    ...p,
                    sandbox: {
                      ...p.sandbox,
                      process: {
                        ...p.sandbox.process,
                        max_concurrent: Number(e.target.value),
                      },
                    },
                  },
                )
              }
              className="w-[70px] h-7 text-xs"
            />
          </div>
        </div>
        <div>
          <SectionLabel>Denied Commands</SectionLabel>
          <DenyCommandsList
            commands={sandbox.process.deny_commands}
            onChange={(deny_commands) =>
              setPolicy((p) =>
                p && {
                  ...p,
                  sandbox: {
                    ...p.sandbox,
                    process: { ...p.sandbox.process, deny_commands },
                  },
                },
              )
            }
          />
        </div>
      </div>

      {/* Credential Providers */}
      <div className="space-y-3 rounded-lg border border-border/40 p-4">
        <p className="text-sm font-semibold">Credential Providers</p>
        <CredentialProvidersTable providers={providers} onChange={updateProviders} />
      </div>

      {/* Save */}
      <div className="flex justify-end pt-2 border-t border-border/50">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Save Policy
        </Button>
      </div>
    </div>
  );
}
