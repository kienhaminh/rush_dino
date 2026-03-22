import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  approveSessionRequest,
  denySessionRequest,
  fetchAgents,
  fetchConfig,
  fetchSessions,
  fetchSystemSummary,
  getSessionAuditLog,
  patchSessionNetworkPolicy,
} from '@/lib/api';
import type {
  AppConfigView,
  AuditEntry,
  NetworkRule,
  SandboxNetworkPolicy,
  SessionSummary,
  SystemSummaryResponse,
} from '@/lib/types';
import type { AgentRecord } from '@/pages/agents/agent-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  CheckCircle,
  FolderLock,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const REFRESH_INTERVAL_MS = 5_000;

function DecisionBadge({ decision }: { decision: AuditEntry['decision'] }) {
  const variants: Record<AuditEntry['decision'], string> = {
    allow: 'bg-success/15 text-success border-success/20',
    deny: 'bg-destructive/15 text-destructive border-destructive/20',
    pending: 'bg-warning/15 text-warning border-warning/20',
    route: 'bg-primary/15 text-primary border-primary/20',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium ${variants[decision] ?? ''}`}
    >
      {decision}
    </span>
  );
}

function CategoryBadge({ category }: { category: AuditEntry['category'] }) {
  return (
    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
      {category}
    </Badge>
  );
}

function policyTone(enabled: boolean) {
  return enabled
    ? 'bg-success/10 text-success border-success/20'
    : 'bg-muted text-muted-foreground border-border';
}

function formatSessionTime(value?: string | null) {
  if (!value) return 'No recent audit events';
  return new Date(value).toLocaleString();
}

function latestAuditTimestamp(entries: AuditEntry[]) {
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())[0]?.ts ?? null;
}

function summarizeAgentPolicy(agent: AgentRecord) {
  const policy = agent.sandboxPolicy;
  if (!policy) return null;

  return {
    filesystemDefault: policy.sandbox.filesystem.default,
    filesystemAllowCount: policy.sandbox.filesystem.allow.length,
    filesystemDenyCount: policy.sandbox.filesystem.deny.length,
    networkDefault: policy.sandbox.network.default,
    networkOnBlock: policy.sandbox.network.on_block,
    networkAllowCount: policy.sandbox.network.allow.length,
    processPrivileged: policy.sandbox.process.allow_privileged,
    denyCommandCount: policy.sandbox.process.deny_commands.length,
    providerCount: policy.providers.length,
  };
}

function NetworkPolicyEditor({
  sessionId,
  initialRules,
  onApply,
}: {
  sessionId: string;
  initialRules: NetworkRule[];
  onApply: (sessionId: string, policy: SandboxNetworkPolicy) => Promise<void>;
}) {
  const [rules, setRules] = useState<NetworkRule[]>(initialRules);
  const [defaultAction, setDefaultAction] = useState<'allow' | 'deny'>('deny');
  const [onBlock, setOnBlock] = useState<'prompt' | 'deny' | 'hard-stop'>('prompt');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setRules(initialRules);
  }, [initialRules]);

  const addRule = () =>
    setRules((prev) => [...prev, { host: '', port: 443, methods: ['GET'], paths: ['/*'] }]);

  const updateRule = (index: number, patch: Partial<NetworkRule>) =>
    setRules((prev) => prev.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));

  const removeRule = (index: number) =>
    setRules((prev) => prev.filter((_, i) => i !== index));

  const handleApply = async () => {
    setApplying(true);
    try {
      await onApply(sessionId, {
        default: defaultAction,
        on_block: onBlock,
        allow: rules,
      });
      toast.success('Network policy applied to session.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply network policy.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Default:</span>
          <Select value={defaultAction} onValueChange={(v) => setDefaultAction(v as 'allow' | 'deny')}>
            <SelectTrigger className="h-7 w-[84px] text-xs">
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
          <Select value={onBlock} onValueChange={(v) => setOnBlock(v as 'prompt' | 'deny' | 'hard-stop')}>
            <SelectTrigger className="h-7 w-[108px] text-xs">
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

      <div className="space-y-1.5">
        {rules.length === 0 ? <p className="text-xs italic text-muted-foreground">No allow rules.</p> : null}
        {rules.map((rule, index) => (
          <div key={`${rule.host}-${index}`} className="flex flex-wrap items-center gap-2">
            <Input
              value={rule.host}
              onChange={(e) => updateRule(index, { host: e.target.value })}
              placeholder="api.example.com"
              className="h-7 w-[180px] text-xs font-mono"
            />
            <Input
              type="number"
              value={rule.port}
              onChange={(e) => updateRule(index, { port: Number(e.target.value) })}
              className="h-7 w-[64px] text-xs font-mono"
            />
            <Input
              value={rule.methods.join(',')}
              onChange={(e) => updateRule(index, { methods: e.target.value.split(',').map((part) => part.trim()) })}
              className="h-7 w-[110px] text-xs font-mono"
            />
            <Input
              value={rule.paths.join(',')}
              onChange={(e) => updateRule(index, { paths: e.target.value.split(',').map((part) => part.trim()) })}
              className="h-7 flex-1 text-xs font-mono"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeRule(index)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addRule}>
          <Plus className="h-3 w-3" />
          Add Rule
        </Button>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleApply} disabled={applying} className="gap-1.5">
          {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Network className="h-3.5 w-3.5" />}
          Apply
        </Button>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

export type SandboxOverviewContentProps = {
  summary: SystemSummaryResponse | null;
  config: AppConfigView | null;
  agents: AgentRecord[];
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  selectedAgentId: string | null;
  auditEntries: AuditEntry[];
  loadingOverview: boolean;
  loadingEntries: boolean;
  fetchError: string | null;
  actionInProgress: number | null;
  onSelectSession: (sessionId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onRefreshOverview: () => void;
  onRefreshEntries: () => void;
  onApprove: (entry: AuditEntry) => void;
  onDeny: (entry: AuditEntry) => void;
  onApplyNetworkPolicy: (sessionId: string, policy: SandboxNetworkPolicy) => Promise<void>;
};

export function SandboxOverviewContent({
  summary,
  config,
  agents,
  sessions,
  selectedSessionId,
  selectedAgentId,
  auditEntries,
  loadingOverview,
  loadingEntries,
  fetchError,
  actionInProgress,
  onSelectSession,
  onSelectAgent,
  onRefreshOverview,
  onRefreshEntries,
  onApprove,
  onDeny,
  onApplyNetworkPolicy,
}: SandboxOverviewContentProps) {
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const selectedPolicy = selectedAgent?.sandboxPolicy ?? null;
  const pendingCount = auditEntries.filter((entry) => entry.decision === 'pending').length;
  const extraWriteRoots = config?.execution?.shell_exec_sandbox?.extra_write_roots ?? [];

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-background px-6 py-6 md:px-8 md:py-8">
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight">Sandbox</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Full sandbox posture, permissions, and live enforcement across RushDino.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={loadingOverview} onClick={onRefreshOverview}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingOverview ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {fetchError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {fetchError}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border/60 bg-card/80">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Shell sandbox</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge className={policyTone(summary?.security.sandboxEnabled ?? false)}>
                  {summary?.security.sandboxEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  {summary?.security.sandboxAllowNetwork ? 'Network allowed' : 'Network blocked'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Workspace root</p>
              <p className="mt-3 break-all font-mono text-sm text-foreground">
                {summary?.security.sandboxWorkspaceRoot ?? 'Unavailable'}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Extra write roots</p>
              <p className="mt-3 text-2xl font-semibold">{extraWriteRoots.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Writable outside the workspace root.</p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Agents with policy</p>
              <p className="mt-3 text-2xl font-semibold">
                {agents.filter((agent) => Boolean(agent.sandboxPolicy)).length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{agents.length} total agents discovered.</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Shell sandbox posture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Execution mode</p>
                  <p className="mt-2 font-medium">
                    {summary?.security.sandboxEnabled ? 'Sandboxed broker execution' : 'Host execution'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {summary?.security.sandboxAllowNetwork
                      ? 'Outbound network egress is allowed for shell commands.'
                      : 'Outbound network egress is blocked by default.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Workspace root</p>
                  <p className="mt-2 break-all font-mono text-xs text-foreground">
                    {summary?.security.sandboxWorkspaceRoot ?? 'Unavailable'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Extra write roots</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {extraWriteRoots.length > 0 ? (
                    extraWriteRoots.map((root) => (
                      <Badge key={root} variant="outline" className="max-w-full break-all font-mono text-[10px]">
                        {root}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No additional write roots configured.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Live sessions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-8 text-sm text-muted-foreground">
                  No sessions available.
                </div>
              ) : (
                sessions.map((session) => {
                  const active = session.id === selectedSessionId;
                  const isSelected = selectedSession?.id === session.id;
                  const lastAudit = isSelected ? latestAuditTimestamp(auditEntries) : null;

                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onSelectSession(session.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                        active
                          ? 'border-primary/30 bg-primary/5'
                          : 'border-border/50 bg-background/50 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{session.title || session.id}</p>
                          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{session.id}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                          {session.status}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span>{session.pendingApprovalCount} pending approvals</span>
                        <span>{session.activeRunCount} active runs</span>
                        <span>{session.queuedRunCount} queued runs</span>
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Last audit: {formatSessionTime(lastAudit)}
                      </p>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>
        </section>

        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Agent policies</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-3">
              {agents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-8 text-sm text-muted-foreground">
                  No agents found.
                </div>
              ) : (
                agents.map((agent) => {
                  const summary = summarizeAgentPolicy(agent);
                  const active = agent.id === selectedAgentId;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => onSelectAgent(agent.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                        active
                          ? 'border-primary/30 bg-primary/5'
                          : 'border-border/50 bg-background/50 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{agent.emoji}</span>
                            <p className="truncate text-sm font-medium">{agent.name}</p>
                          </div>
                          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{agent.id}</p>
                        </div>
                        <Badge className={policyTone(Boolean(summary))}>{summary ? 'Policy loaded' : 'No policy'}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                        <span>FS {summary?.filesystemAllowCount ?? 0}/{summary?.filesystemDenyCount ?? 0}</span>
                        <span>Net {summary?.networkAllowCount ?? 0}</span>
                        <span>Cmd deny {summary?.denyCommandCount ?? 0}</span>
                        <span>Env sets {summary?.providerCount ?? 0}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="min-w-0">
              <Card className="border-border/50 bg-background/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Selected agent policy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!selectedAgent ? (
                    <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
                      Select an agent to inspect its sandbox policy.
                    </div>
                  ) : !selectedPolicy ? (
                    <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <FolderLock className="h-4 w-4" />
                        No `sandbox.yaml` policy found for {selectedAgent.name}.
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{selectedAgent.emoji}</span>
                            <p className="text-base font-semibold">{selectedAgent.name}</p>
                            <Badge className={policyTone(true)}>Policy loaded</Badge>
                          </div>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">{selectedAgent.id}</p>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <p className="break-all">Workspace: {selectedAgent.workspace}</p>
                        </div>
                      </div>

                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold">Filesystem</h3>
                        <div className="grid gap-3 md:grid-cols-3">
                          <DetailItem label="Default action" value={selectedPolicy.sandbox.filesystem.default} />
                          <DetailItem label="Allowed paths" value={selectedPolicy.sandbox.filesystem.allow.length} />
                          <DetailItem label="Denied paths" value={selectedPolicy.sandbox.filesystem.deny.length} />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl border border-border/40 p-4">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Allowed paths</p>
                            <div className="mt-3 space-y-2">
                              {selectedPolicy.sandbox.filesystem.allow.length > 0 ? (
                                selectedPolicy.sandbox.filesystem.allow.map((rule) => (
                                  <div key={`${rule.path}-${rule.mode}`} className="rounded-xl border border-border/30 px-3 py-2">
                                    <p className="break-all font-mono text-xs text-foreground">{rule.path}</p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">{rule.mode}</p>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-muted-foreground">No filesystem allow rules.</p>
                              )}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-border/40 p-4">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Denied paths</p>
                            <div className="mt-3 space-y-2">
                              {selectedPolicy.sandbox.filesystem.deny.length > 0 ? (
                                selectedPolicy.sandbox.filesystem.deny.map((path) => (
                                  <div key={path} className="rounded-xl border border-border/30 px-3 py-2">
                                    <p className="break-all font-mono text-xs text-foreground">{path}</p>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-muted-foreground">No filesystem deny rules.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </section>

                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold">Network</h3>
                        <div className="grid gap-3 md:grid-cols-3">
                          <DetailItem label="Default action" value={selectedPolicy.sandbox.network.default} />
                          <DetailItem label="On block" value={selectedPolicy.sandbox.network.on_block} />
                          <DetailItem label="Allow rules" value={selectedPolicy.sandbox.network.allow.length} />
                        </div>
                        <div className="rounded-2xl border border-border/40 p-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Allowed network rules</p>
                          <div className="mt-3 space-y-2">
                            {selectedPolicy.sandbox.network.allow.length > 0 ? (
                              selectedPolicy.sandbox.network.allow.map((rule) => (
                                <div key={`${rule.host}-${rule.port}-${rule.methods.join(',')}-${rule.paths.join(',')}`} className="rounded-xl border border-border/30 px-3 py-2">
                                  <p className="font-mono text-xs text-foreground">{rule.host}:{rule.port}</p>
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    Methods: {rule.methods.length ? rule.methods.join(', ') : 'all'}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    Paths: {rule.paths.length ? rule.paths.join(', ') : 'all'}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground">No network allow rules.</p>
                            )}
                          </div>
                        </div>
                      </section>

                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold">Process</h3>
                        <div className="grid gap-3 md:grid-cols-3">
                          <DetailItem
                            label="Privileged execution"
                            value={selectedPolicy.sandbox.process.allow_privileged ? 'allowed' : 'denied'}
                          />
                          <DetailItem label="Max concurrent" value={selectedPolicy.sandbox.process.max_concurrent} />
                          <DetailItem label="Denied commands" value={selectedPolicy.sandbox.process.deny_commands.length} />
                        </div>
                        <div className="rounded-2xl border border-border/40 p-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Denied commands</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedPolicy.sandbox.process.deny_commands.length > 0 ? (
                              selectedPolicy.sandbox.process.deny_commands.map((command) => (
                                <Badge key={command} variant="outline" className="font-mono text-[10px]">
                                  {command}
                                </Badge>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground">No process deny list.</p>
                            )}
                          </div>
                        </div>
                      </section>

                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold">Inference</h3>
                        <div className="grid gap-3 md:grid-cols-4">
                          <DetailItem label="Enabled" value={selectedPolicy.sandbox.inference.enabled ? 'yes' : 'no'} />
                          <DetailItem
                            label="Strip agent credentials"
                            value={selectedPolicy.sandbox.inference.strip_agent_credentials ? 'yes' : 'no'}
                          />
                          <DetailItem label="Route via" value={selectedPolicy.sandbox.inference.route_via || 'n/a'} />
                          <DetailItem
                            label="Inject provider"
                            value={selectedPolicy.sandbox.inference.inject_provider || 'n/a'}
                          />
                        </div>
                      </section>

                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold">Providers</h3>
                        <div className="space-y-3">
                          {selectedPolicy.providers.length > 0 ? (
                            selectedPolicy.providers.map((provider) => (
                              <div key={provider.name} className="rounded-2xl border border-border/40 p-4">
                                <p className="text-sm font-medium">{provider.name}</p>
                                <div className="mt-3 space-y-2">
                                  {Object.entries(provider.inject).length > 0 ? (
                                    Object.entries(provider.inject).map(([envKey, envValue]) => (
                                      <div key={envKey} className="rounded-xl border border-border/30 px-3 py-2">
                                        <p className="font-mono text-xs text-foreground">{envKey}</p>
                                        <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{envValue}</p>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-xs text-muted-foreground">No env injection mapping.</p>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-8 text-sm text-muted-foreground">
                              No credential providers configured.
                            </div>
                          )}
                        </div>
                      </section>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base">Audit log</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedSession
                    ? `Detailed sandbox decisions for ${selectedSession.title || selectedSession.id}.`
                    : 'Select a live session to inspect sandbox decisions.'}
                </p>
              </div>
              {selectedSessionId ? (
                <div className="flex items-center gap-2">
                  {pendingCount > 0 ? (
                    <Badge className="border-warning/20 bg-warning/20 text-warning">
                      <ShieldAlert className="mr-1 h-3 w-3" />
                      {pendingCount} pending
                    </Badge>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={onRefreshEntries} disabled={loadingEntries}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loadingEntries ? 'animate-spin' : ''}`} />
                    Refresh audit
                  </Button>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedSessionId ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
                No session selected.
              </div>
            ) : auditEntries.length === 0 && !loadingEntries ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
                No audit entries recorded for this session.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border/40">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Time</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Category</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Decision</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Destination</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Reason</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className={`border-b border-border/20 last:border-0 ${entry.decision === 'pending' ? 'bg-warning/5' : ''}`}
                      >
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-muted-foreground">
                          {new Date(entry.ts).toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-2">
                          <CategoryBadge category={entry.category} />
                        </td>
                        <td className="px-3 py-2">
                          <DecisionBadge decision={entry.decision} />
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 font-mono text-muted-foreground">
                          {entry.destination ?? entry.path ?? entry.binary ?? '—'}
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2 text-muted-foreground">{entry.reason ?? '—'}</td>
                        <td className="px-3 py-2">
                          {entry.decision === 'pending' ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-success hover:bg-success/10"
                                disabled={actionInProgress === entry.id}
                                onClick={() => onApprove(entry)}
                                title="Approve"
                              >
                                {actionInProgress === entry.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:bg-destructive/10"
                                disabled={actionInProgress === entry.id}
                                onClick={() => onDeny(entry)}
                                title="Deny"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedSessionId ? (
              <div className="rounded-2xl border border-border/40 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Network className="h-4 w-4 text-primary" />
                  Hot-reload Network Policy
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Existing write actions stay here. The rest of this page is read-only.
                </p>
                <div className="mt-4">
                  <NetworkPolicyEditor
                    sessionId={selectedSessionId}
                    initialRules={selectedPolicy?.sandbox.network.allow ?? []}
                    onApply={onApplyNetworkPolicy}
                  />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function SandboxMonitorPage() {
  const [summary, setSummary] = useState<SystemSummaryResponse | null>(null);
  const [config, setConfig] = useState<AppConfigView | null>(null);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const [nextSummary, nextConfig, nextAgents, nextSessions] = await Promise.all([
        fetchSystemSummary(),
        fetchConfig(),
        fetchAgents(),
        fetchSessions(),
      ]);

      setSummary(nextSummary);
      setConfig(nextConfig);
      setAgents(nextAgents);
      setSessions(nextSessions);
      setSelectedSessionId((current) => {
        if (current && nextSessions.some((session) => session.id === current)) {
          return current;
        }
        return nextSessions[0]?.id ?? null;
      });
      setSelectedAgentId((current) => {
        if (current && nextAgents.some((agent) => agent.id === current)) return current;
        return nextAgents[0]?.id ?? null;
      });
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load sandbox overview.');
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const fetchEntries = useCallback(async (sessionId: string) => {
    try {
      const entries = await getSessionAuditLog(sessionId);
      setAuditEntries(entries);
      setFetchError(null);
    } catch (err) {
      setAuditEntries([]);
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch audit log.');
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedSessionId) {
      setAuditEntries([]);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    setLoadingEntries(true);
    void fetchEntries(selectedSessionId).finally(() => setLoadingEntries(false));

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      void fetchEntries(selectedSessionId);
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchEntries, selectedSessionId]);

  const handleApprove = useCallback(
    async (entry: AuditEntry) => {
      if (!selectedSessionId) return;
      setActionInProgress(entry.id);
      try {
        await approveSessionRequest(selectedSessionId, String(entry.id));
        toast.success('Request approved.');
        await fetchEntries(selectedSessionId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to approve request.');
      } finally {
        setActionInProgress(null);
      }
    },
    [fetchEntries, selectedSessionId],
  );

  const handleDeny = useCallback(
    async (entry: AuditEntry) => {
      if (!selectedSessionId) return;
      setActionInProgress(entry.id);
      try {
        await denySessionRequest(selectedSessionId, String(entry.id));
        toast.success('Request denied.');
        await fetchEntries(selectedSessionId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to deny request.');
      } finally {
        setActionInProgress(null);
      }
    },
    [fetchEntries, selectedSessionId],
  );

  const handleApplyNetworkPolicy = useCallback(
    async (sessionId: string, policy: SandboxNetworkPolicy) => {
      await patchSessionNetworkPolicy(sessionId, policy);
      await fetchEntries(sessionId);
    },
    [fetchEntries],
  );

  return (
    <SandboxOverviewContent
      summary={summary}
      config={config}
      agents={agents}
      sessions={sessions}
      selectedSessionId={selectedSessionId}
      selectedAgentId={selectedAgentId}
      auditEntries={auditEntries}
      loadingOverview={loadingOverview}
      loadingEntries={loadingEntries}
      fetchError={fetchError}
      actionInProgress={actionInProgress}
      onSelectSession={setSelectedSessionId}
      onSelectAgent={setSelectedAgentId}
      onRefreshOverview={() => void loadOverview()}
      onRefreshEntries={() => {
        if (selectedSessionId) {
          void fetchEntries(selectedSessionId);
        }
      }}
      onApprove={(entry) => void handleApprove(entry)}
      onDeny={(entry) => void handleDeny(entry)}
      onApplyNetworkPolicy={handleApplyNetworkPolicy}
    />
  );
}
