import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  fetchAgents,
  fetchAgentSessions,
  fetchMcpStatus,
  getSessionAuditLog,
  patchSessionBashPolicy,
  patchSessionMcpPolicy,
  patchSessionNetworkPolicy,
  putAgentSandbox,
} from '@/lib/api';
import type {
  AuditEntry,
  McpServerStatus,
  SandboxMcpPolicy,
  SandboxNetworkPolicy,
  SandboxProcessPolicy,
  SessionSummary,
} from '@/lib/types';
import type { AgentRecord } from '@/pages/agents/agent-types';
import { SandboxAgentSection } from './components/sandbox-agent-section';
import { Shield } from 'lucide-react';

const REFRESH_INTERVAL_MS = 5_000;

function mergeAuditEntries(entriesBySession: AuditEntry[][]): AuditEntry[] {
  const seen = new Set<number>();
  const merged: AuditEntry[] = [];
  for (const entries of entriesBySession) {
    for (const entry of entries) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }
  }
  return merged.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

export function SandboxMonitorPage() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerStatus[]>([]);
  const [teamAgentId, setTeamAgentId] = useState<string | null>(null);
  const [mainAuditEntries, setMainAuditEntries] = useState<AuditEntry[]>([]);
  const [teamAuditEntries, setTeamAuditEntries] = useState<AuditEntry[]>([]);
  const [loadingMainAudit, setLoadingMainAudit] = useState(false);
  const [loadingTeamAudit, setLoadingTeamAudit] = useState(false);
  const [agentSessions, setAgentSessions] = useState<SessionSummary[]>([]);

  const mainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const teamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [nextAgents, nextMcpServers, nextAgentSessions] = await Promise.all([
        fetchAgents().catch(() => [] as AgentRecord[]),
        fetchMcpStatus().catch(() => [] as McpServerStatus[]),
        fetchAgentSessions().catch(() => [] as SessionSummary[]),
      ]);
      setAgents(nextAgents);
      setMcpServers(nextMcpServers);
      setAgentSessions(nextAgentSessions);
      setTeamAgentId((current) => {
        if (current && nextAgents.some((a) => a.id === current)) return current;
        return nextAgents[0]?.id ?? null;
      });
    }
    void init();
  }, []);

  // ── Main session audit polling ────────────────────────────────────────────
  const fetchMainAudit = useCallback(async () => {
    try {
      const entries = await getSessionAuditLog('main');
      setMainAuditEntries(entries);
    } catch {
      // silent — main session may not have audit entries yet
    }
  }, []);

  useEffect(() => {
    setLoadingMainAudit(true);
    void fetchMainAudit().finally(() => setLoadingMainAudit(false));
    mainIntervalRef.current = setInterval(() => void fetchMainAudit(), REFRESH_INTERVAL_MS);
    return () => {
      if (mainIntervalRef.current) clearInterval(mainIntervalRef.current);
    };
  }, [fetchMainAudit]);

  // ── Team agent audit polling ──────────────────────────────────────────────
  const fetchTeamAudit = useCallback(
    async (agentId: string, sessions: SessionSummary[]) => {
      const selectedAgent = agents.find((a) => a.id === agentId);
      const matchingSessions = selectedAgent
        ? sessions.filter(
            (s) =>
              s.title.toLowerCase().includes(selectedAgent.name.toLowerCase()) ||
              s.id.toLowerCase().includes(agentId.toLowerCase()),
          )
        : [];

      if (matchingSessions.length === 0) {
        setTeamAuditEntries([]);
        return;
      }

      const results = await Promise.allSettled(
        matchingSessions.map((s) => getSessionAuditLog(s.id)),
      );
      const all = results
        .filter((r): r is PromiseFulfilledResult<AuditEntry[]> => r.status === 'fulfilled')
        .map((r) => r.value);
      setTeamAuditEntries(mergeAuditEntries(all));
    },
    [agents],
  );

  useEffect(() => {
    if (!teamAgentId) return;
    setLoadingTeamAudit(true);
    void fetchTeamAudit(teamAgentId, agentSessions).finally(() => setLoadingTeamAudit(false));
    if (teamIntervalRef.current) clearInterval(teamIntervalRef.current);
    teamIntervalRef.current = setInterval(
      () => void fetchTeamAudit(teamAgentId, agentSessions),
      REFRESH_INTERVAL_MS,
    );
    return () => {
      if (teamIntervalRef.current) clearInterval(teamIntervalRef.current);
    };
  }, [teamAgentId, agentSessions, fetchTeamAudit]);

  // ── Policy helpers ────────────────────────────────────────────────────────
  function updateAgentPolicy(
    agentId: string,
    patch: Partial<NonNullable<AgentRecord['sandboxPolicy']>['sandbox']>,
  ) {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId && a.sandboxPolicy
          ? {
              ...a,
              sandboxPolicy: {
                ...a.sandboxPolicy,
                sandbox: { ...a.sandboxPolicy.sandbox, ...patch },
              },
            }
          : a,
      ),
    );
  }

  // Main section — session-level hot-reload (no agent template)
  const handleApplyMainMcp = useCallback(async (mcp: SandboxMcpPolicy) => {
    try {
      await patchSessionMcpPolicy('main', mcp);
      toast.success('MCP policy applied to main session.');
    } catch {
      toast.error('Failed to apply MCP policy.');
    }
  }, []);

  const handleApplyMainNetwork = useCallback(async (network: SandboxNetworkPolicy) => {
    try {
      await patchSessionNetworkPolicy('main', network);
      toast.success('Network policy applied to main session.');
    } catch {
      toast.error('Failed to apply network policy.');
    }
  }, []);

  const handleApplyMainBash = useCallback(async (process: SandboxProcessPolicy) => {
    try {
      await patchSessionBashPolicy('main', process);
      toast.success('Bash policy applied to main session.');
    } catch {
      toast.error('Failed to apply bash policy.');
    }
  }, []);

  // Team section — agent template policy
  const handleTeamMcpChange = useCallback(
    (mcp: SandboxMcpPolicy) => {
      if (teamAgentId) updateAgentPolicy(teamAgentId, { mcp });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamAgentId],
  );

  const handleApplyTeamMcp = useCallback(
    async (mcp: SandboxMcpPolicy) => {
      if (!teamAgentId) return;
      try {
        const agent = agents.find((a) => a.id === teamAgentId);
        if (!agent?.sandboxPolicy) {
          toast.error('This agent has no policy file configured.');
          return;
        }
        await putAgentSandbox(teamAgentId, {
          ...agent.sandboxPolicy,
          sandbox: { ...agent.sandboxPolicy.sandbox, mcp },
        });
        toast.success('MCP policy applied.');
      } catch {
        toast.error('Failed to apply MCP policy.');
      }
    },
    [teamAgentId, agents],
  );

  const handleTeamNetworkChange = useCallback(
    (network: SandboxNetworkPolicy) => {
      if (teamAgentId) updateAgentPolicy(teamAgentId, { network });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamAgentId],
  );

  const handleApplyTeamNetwork = useCallback(
    async (network: SandboxNetworkPolicy) => {
      if (!teamAgentId) return;
      try {
        const agent = agents.find((a) => a.id === teamAgentId);
        if (!agent?.sandboxPolicy) {
          toast.error('This agent has no policy file configured.');
          return;
        }
        await putAgentSandbox(teamAgentId, {
          ...agent.sandboxPolicy,
          sandbox: { ...agent.sandboxPolicy.sandbox, network },
        });
        toast.success('Network policy applied.');
      } catch {
        toast.error('Failed to apply network policy.');
      }
    },
    [teamAgentId, agents],
  );

  const handleTeamBashChange = useCallback(
    (process: SandboxProcessPolicy) => {
      if (teamAgentId) updateAgentPolicy(teamAgentId, { process });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamAgentId],
  );

  const handleApplyTeamBash = useCallback(
    async (process: SandboxProcessPolicy) => {
      if (!teamAgentId) return;
      try {
        const agent = agents.find((a) => a.id === teamAgentId);
        if (!agent?.sandboxPolicy) {
          toast.error('This agent has no policy file configured.');
          return;
        }
        await putAgentSandbox(teamAgentId, {
          ...agent.sandboxPolicy,
          sandbox: { ...agent.sandboxPolicy.sandbox, process },
        });
        toast.success('Bash policy applied.');
      } catch {
        toast.error('Failed to apply bash policy.');
      }
    },
    [teamAgentId, agents],
  );

  const teamAgent = agents.find((a) => a.id === teamAgentId) ?? null;

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-background px-6 py-6 md:px-8 md:py-8">
      <div className="flex w-full flex-col gap-6">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">Sandbox</h1>
        </div>

        {/* Section 1: Main agent */}
        <SandboxAgentSection
          label="★ Main agent"
          badge={
            <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">
              main session
            </span>
          }
          auditEntries={mainAuditEntries}
          loadingAudit={loadingMainAudit}
          mcpServers={mcpServers}
          mcpPolicy={null}
          networkPolicy={null}
          bashPolicy={null}
          onMcpPolicyChange={() => {}}
          onApplyMcp={handleApplyMainMcp}
          onNetworkPolicyChange={() => {}}
          onApplyNetwork={handleApplyMainNetwork}
          onBashPolicyChange={() => {}}
          onApplyBash={handleApplyMainBash}
        />

        {/* Section 2: Team agents */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground">Team agents</span>
            <select
              value={teamAgentId ?? ''}
              onChange={(e) => setTeamAgentId(e.target.value)}
              className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji} {a.name}
                </option>
              ))}
            </select>
          </div>
          {teamAgentId ? (
            <SandboxAgentSection
              label={`${teamAgent?.emoji ?? ''} ${teamAgent?.name ?? teamAgentId}`}
              auditEntries={teamAuditEntries}
              loadingAudit={loadingTeamAudit}
              mcpServers={mcpServers}
              mcpPolicy={teamAgent?.sandboxPolicy?.sandbox.mcp ?? null}
              networkPolicy={teamAgent?.sandboxPolicy?.sandbox.network ?? null}
              bashPolicy={teamAgent?.sandboxPolicy?.sandbox.process ?? null}
              onMcpPolicyChange={handleTeamMcpChange}
              onApplyMcp={handleApplyTeamMcp}
              onNetworkPolicyChange={handleTeamNetworkChange}
              onApplyNetwork={handleApplyTeamNetwork}
              onBashPolicyChange={handleTeamBashChange}
              onApplyBash={handleApplyTeamBash}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-center text-sm text-muted-foreground">
              No agents found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
