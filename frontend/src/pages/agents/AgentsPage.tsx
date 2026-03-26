import { useCallback, useEffect, useState } from 'react';
import { AgentSidebar } from './AgentSidebar';
import { AgentFilesPanel } from './AgentFilesPanel';
import { AgentToolsPanel } from './AgentToolsPanel';
import { AgentSkillsPanel } from './AgentSkillsPanel';
import { AgentChannelsPanel } from './AgentChannelsPanel';
import { AgentCronPanel } from './AgentCronPanel';
import { AgentProgressBoardPanel } from './AgentProgressBoardPanel';
import type { AgentRecord, AgentRuntimeData } from './agent-types';
import { fetchAgentRuntime, fetchAgents } from '@/lib/api';
import { useAgentProgressBoard } from './use-agent-progress-board';

const PANELS = ['overview', 'progress', 'files', 'tools', 'skills', 'channels', 'cron'] as const;
type PagePanel = (typeof PANELS)[number];

const PANEL_LABELS: Record<PagePanel, string> = {
  overview: 'Overview',
  progress: 'Progress',
  files: 'Files',
  tools: 'Tools',
  skills: 'Skills',
  channels: 'Channels',
  cron: 'Cron',
};

const EMPTY_RUNTIME: AgentRuntimeData = {
  files: [],
  toolsProfile: 'runtime',
  toolSections: [],
  skills: [],
  channels: [],
  cronStatus: { enabled: false, jobs: 0, nextWake: 'n/a' },
  cronJobs: [],
  soul: {
    persona: '',
    tone: '',
    coreValues: [],
    traits: [],
    systemPrompt: '',
  },
  memory: [],
};

// ── Main Page ────────────────────────────────────────────────────────────────

// ── Satellite node card ──────────────────────────────────────────────────────

function SatelliteNode({
  label,
  icon,
  subtitle,
  accentColor,
}: {
  label: string;
  icon: string;
  subtitle: string;
  accentColor: string;
}) {
  return (
    <div
      className="rounded-xl p-3.5 flex items-center gap-3"
      style={{
        background: 'rgba(13,18,30,0.94)',
        border: `1px solid ${accentColor}30`,
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-base"
        style={{
          background: `${accentColor}18`,
          border: `1px solid ${accentColor}40`,
        }}
      >
        {icon}
      </div>
      <div>
        <div className="text-[10px] font-bold tracking-[0.16em] text-white/85">{label}</div>
        <div className="text-[9px] text-white/35 mt-0.5">{subtitle}</div>
      </div>
    </div>
  );
}

// ── Agent Overview Panel ─────────────────────────────────────────────────────

function AgentOverviewPanel({
  agent,
  runtime,
}: {
  agent: AgentRecord;
  runtime: AgentRuntimeData;
}) {
  const [pingDots, setPingDots] = useState('');

  const skillCount = runtime.skills.filter((s) => s.enabled).length;
  const toolCount = runtime.toolSections.reduce(
    (acc, s) => acc + s.tools.filter((t) => t.enabled).length,
    0,
  );
  const knowledgeCount = runtime.memory.length;

  useEffect(() => {
    const interval = setInterval(() => {
      setPingDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const agentId = agent.id.slice(0, 16).toUpperCase();
  const workspaceShort = agent.workspace?.split('/').pop() ?? agent.workspace ?? 'default';

  return (
    <div
      className="flex rounded-xl overflow-hidden"
      style={{
        minHeight: '520px',
        background: '#080c14',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* ── Left: Network Visualization ───────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden" style={{ minHeight: '520px' }}>
        {/* Ambient radial glow */}
        <div
          className="absolute pointer-events-none"
          style={{
            inset: 0,
            background:
              'radial-gradient(ellipse 55% 55% at 50% 50%, rgba(99,102,241,0.1) 0%, transparent 70%)',
          }}
        />
        {/* Dot grid */}
        <div
          className="absolute pointer-events-none opacity-25"
          style={{
            inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.4) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* SVG connection lines */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <style>{`
              @keyframes agentDash { to { stroke-dashoffset: -20; } }
              .agent-flow {
                stroke-dasharray: 3 2;
                animation: agentDash 1s linear infinite;
              }
            `}</style>
          </defs>
          {/* SKILLS → CORE */}
          <line
            x1="33" y1="20" x2="44" y2="43"
            stroke="rgba(99,102,241,0.45)" strokeWidth="0.35"
            className="agent-flow"
          />
          {/* TOOLS → CORE */}
          <line
            x1="67" y1="20" x2="56" y2="43"
            stroke="rgba(99,102,241,0.45)" strokeWidth="0.35"
            className="agent-flow"
          />
          {/* KNOWLEDGE → CORE */}
          <line
            x1="50" y1="76" x2="50" y2="58"
            stroke="rgba(99,102,241,0.45)" strokeWidth="0.35"
            className="agent-flow"
          />
        </svg>

        {/* SKILLS — top-left */}
        <div
          className="absolute"
          style={{ top: '44px', left: '5%', width: '28%', minWidth: '158px' }}
        >
          <SatelliteNode
            label="SKILLS"
            icon="◑"
            subtitle={`${skillCount} Active Capacities`}
            accentColor="rgb(99,102,241)"
          />
        </div>

        {/* TOOLS — top-right */}
        <div
          className="absolute"
          style={{ top: '44px', right: '5%', width: '28%', minWidth: '158px' }}
        >
          <SatelliteNode
            label="TOOLS"
            icon="🔧"
            subtitle={`${toolCount} Integrated APIs`}
            accentColor="rgb(139,92,246)"
          />
        </div>

        {/* KNOWLEDGE — bottom-center */}
        <div
          className="absolute"
          style={{
            bottom: '44px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '28%',
            minWidth: '158px',
          }}
        >
          <SatelliteNode
            label="KNOWLEDGE"
            icon="🗄"
            subtitle={`${knowledgeCount} Indexed Entries`}
            accentColor="rgb(20,184,166)"
          />
        </div>

        {/* Central core node */}
        <div
          className="absolute flex flex-col items-center"
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          {/* CORE badge */}
          <div
            className="text-[8px] font-bold tracking-[0.22em] px-2 py-0.5 rounded-full mb-2"
            style={{
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.38)',
              color: 'rgba(167,139,250,0.92)',
            }}
          >
            CORE
          </div>

          {/* Orbital ring + inner circle */}
          <div className="relative" style={{ width: '96px', height: '96px' }}>
            {/* Spinning conic ring */}
            <div
              className="absolute inset-0 rounded-full animate-spin"
              style={{
                animationDuration: '5s',
                background:
                  'conic-gradient(from 0deg, rgba(99,102,241,0.9) 0deg, rgba(139,92,246,0.55) 90deg, rgba(99,102,241,0.08) 200deg, transparent 270deg)',
              }}
            />
            {/* Mask */}
            <div
              className="absolute rounded-full"
              style={{ inset: '3px', background: '#080c14' }}
            />
            {/* Inner glowing circle */}
            <div
              className="absolute rounded-full"
              style={{
                inset: '8px',
                background:
                  'radial-gradient(circle at 40% 35%, rgba(99,102,241,0.22), rgba(13,18,30,0.95))',
                border: '1px solid rgba(99,102,241,0.22)',
                boxShadow: '0 0 18px rgba(99,102,241,0.2)',
              }}
            />
            {/* Agent emoji */}
            <div
              className="absolute inset-0 flex items-center justify-center text-2xl"
              style={{ zIndex: 10 }}
            >
              {agent.emoji || '🤖'}
            </div>
          </div>

          {/* Name + subtitle */}
          <div className="text-center mt-3">
            <div className="font-bold tracking-[0.1em] text-sm text-white">
              {agent.name.toUpperCase()}
            </div>
            <div
              className="text-[8px] tracking-[0.22em] mt-0.5"
              style={{ color: 'rgba(99,102,241,0.72)' }}
            >
              NEURAL COORDINATOR
            </div>
          </div>
        </div>

        {/* Ping status — bottom-left */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: '#10b981' }}
          />
          <span className="text-[9px] text-white/30 font-mono">
            Pinging Sub-Nodes{pingDots}
          </span>
        </div>
      </div>

      {/* ── Right: Properties Panel ───────────────────────────────────── */}
      <div
        className="flex flex-col flex-shrink-0"
        style={{
          width: '292px',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(8,11,19,0.98)',
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="font-semibold text-sm text-white">{agent.name} Intelligence</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: '#10b981' }}
            />
            <span className="text-[9px] text-green-400 tracking-[0.14em]">OPERATIONAL</span>
            <span className="text-[9px] text-white/20 mx-0.5">·</span>
            <span className="text-[9px] text-white/35 tracking-[0.1em]">LOW LATENCY</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* PROPERTIES */}
          <section>
            <div
              className="text-[8px] font-bold tracking-[0.22em] mb-3"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              PROPERTIES
            </div>
            <div className="space-y-2.5">
              {[
                { label: 'Agent ID', value: agentId, color: 'rgb(99,179,237)' },
                { label: 'Workspace', value: workspaceShort, color: null },
                { label: 'Latency', value: '24ms', color: null },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {label}
                  </span>
                  <span
                    className="text-[10px] font-mono truncate"
                    style={{ color: color ?? 'rgba(255,255,255,0.65)' }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* PERFORMANCE */}
          <section>
            <div
              className="text-[8px] font-bold tracking-[0.22em] mb-3"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              PERFORMANCE
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div
                className="rounded-lg p-3"
                style={{
                  background: 'rgba(13,18,30,0.85)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="text-[8px] mb-1.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
                  Efficiency
                </div>
                <div className="text-lg font-bold" style={{ color: 'rgb(99,179,237)' }}>
                  98.2%
                </div>
              </div>
              <div
                className="rounded-lg p-3"
                style={{
                  background: 'rgba(13,18,30,0.85)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="text-[8px] mb-1.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
                  {skillCount > 0 ? 'Active Skills' : 'Tools'}
                </div>
                <div className="text-lg font-bold" style={{ color: 'rgb(167,139,250)' }}>
                  {skillCount > 0 ? skillCount : toolCount > 0 ? toolCount : '—'}
                </div>
              </div>
            </div>
          </section>

          {/* DOCUMENTATION */}
          <section>
            <div
              className="text-[8px] font-bold tracking-[0.22em] mb-3"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              DOCUMENTATION
            </div>
            <p
              className="text-[10px] leading-relaxed mb-3"
              style={{ color: 'rgba(255,255,255,0.42)' }}
            >
              {agent.description ||
                `${agent.name} is a neural agent designed for multi-modal orchestration across distributed nodes. Specializes in task delegation and real-time logic synthesis.`}
            </p>

            <div
              className="text-[8px] font-bold tracking-[0.14em] mb-2"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              CORE CAPABILITIES
            </div>
            <ul className="space-y-1.5 mb-4">
              {[
                'Autonomous task orchestration and delegation.',
                'Dynamic tool-use selection with semantic routing.',
                'Persistent memory and context management.',
              ].map((cap) => (
                <li
                  key={cap}
                  className="flex items-start gap-1.5 text-[10px]"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.2)', marginTop: '1px' }}>•</span>
                  {cap}
                </li>
              ))}
            </ul>

            <div
              className="text-[8px] font-bold tracking-[0.14em] mb-2"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              SYSTEM CONSTRAINTS
            </div>
            <p
              className="text-[10px] leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              {agent.isDefault
                ? 'Default agent — cannot be deleted. Serves as primary fallback for all unassigned tasks and routing failures.'
                : 'Requires a minimum of 1 active workspace for full semantic consistency. Threshold for re-calibration is 0.4 latency variance.'}
            </p>
          </section>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-4 flex justify-end"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <button
            className="text-[10px] font-medium transition-colors"
            style={{ color: 'rgba(255,255,255,0.38)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.38)')}
          >
            View Full Logs
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runtimeByAgent, setRuntimeByAgent] = useState<Record<string, AgentRuntimeData>>({});
  const [loading, setLoading] = useState(false);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PagePanel>('overview');

  const {
    board: progressBoard,
    loading: progressLoading,
    refreshing: progressRefreshing,
    error: progressError,
    refresh: refreshProgressBoard,
  } = useAgentProgressBoard(activePanel === 'progress');

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextAgents = await fetchAgents();
      setAgents(nextAgents);
      setSelectedId((current) => {
        if (current && nextAgents.some((agent) => agent.id === current)) {
          return current;
        }
        return nextAgents[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    if (!selectedId) return;
    if (runtimeByAgent[selectedId]) return;

    let cancelled = false;
    const loadRuntime = async () => {
      setRuntimeLoading(true);
      try {
        const runtime = await fetchAgentRuntime(selectedId);
        if (!cancelled) {
          setRuntimeByAgent((prev) => ({ ...prev, [selectedId]: runtime }));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : `Failed to load runtime for ${selectedId}`);
        }
      } finally {
        if (!cancelled) setRuntimeLoading(false);
      }
    };

    void loadRuntime();
    return () => {
      cancelled = true;
    };
  }, [selectedId, runtimeByAgent]);

  useEffect(() => {
    setActivePanel('overview');
  }, [selectedId]);

  const selectedAgent = agents.find((agent) => agent.id === selectedId) ?? null;
  const runtime = (selectedId && runtimeByAgent[selectedId]) || EMPTY_RUNTIME;

  return (
    <div className="flex h-full w-full bg-background overflow-hidden">
      <AgentSidebar
        agents={agents}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        onRefresh={() => {
          setRuntimeByAgent({});
          void loadAgents();
        }}
        loading={loading}
      />

      <div className="flex-1 overflow-hidden">
        {error ? (
          <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {runtimeLoading ? (
          <p className="text-sm text-muted-foreground p-4">Loading agent runtime…</p>
        ) : null}

        {/* Panel Navigation Tabs */}
        <div className="flex items-center overflow-x-auto border-b border-border bg-card/30 px-6 flex-shrink-0">
          {PANELS.map((panel) => (
            <button
              key={panel}
              onClick={() => setActivePanel(panel)}
              className={`relative py-3 px-1 mr-6 text-sm font-medium transition-colors whitespace-nowrap
                ${
                  activePanel === panel
                    ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary after:rounded-t'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {PANEL_LABELS[panel]}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive mb-6">
              {error}
            </div>
          ) : null}
          {runtimeLoading ? (
            <p className="text-sm text-muted-foreground mb-4">Loading agent runtime…</p>
          ) : null}

          {activePanel === 'progress' ? (
            <AgentProgressBoardPanel
              board={progressBoard}
              loading={progressLoading}
              refreshing={progressRefreshing}
              error={progressError}
              onRefresh={() => {
                void refreshProgressBoard();
              }}
            />
          ) : !selectedAgent ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <p className="text-muted-foreground text-sm">Select an agent from the directory.</p>
            </div>
          ) : (
            <>
              {activePanel === 'overview' && (
                <AgentOverviewPanel agent={selectedAgent} runtime={runtime} />
              )}
              {activePanel === 'files' && (
                <AgentFilesPanel agentId={selectedAgent.id} runtime={runtime} />
              )}
              {activePanel === 'tools' && <AgentToolsPanel runtime={runtime} />}
              {activePanel === 'skills' && <AgentSkillsPanel runtime={runtime} />}
              {activePanel === 'channels' && <AgentChannelsPanel runtime={runtime} />}
              {activePanel === 'cron' && <AgentCronPanel runtime={runtime} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AgentsPage;
