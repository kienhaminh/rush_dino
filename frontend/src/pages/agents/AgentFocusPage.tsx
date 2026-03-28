// AgentFocusPage — /agents/:id — focused orbital view for a single agent.
//
// Layout:
//   - Compact sticky tab bar (← All agents | agent tabs | metadata + Edit)
//   - Orbital ReactFlow canvas filling remaining height
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeftIcon, PencilIcon } from 'lucide-react';

import type { AgentRecord, AgentRuntimeData, AgentSkillRecord, AgentToolRecord } from './agent-types';
import type { SkillNode } from '../skills/skill-graph-types';
import { fetchAgents, fetchAgentRuntime } from '@/lib/api';
import { AgentOrbitalCanvas } from './agent-orbital-canvas';
import { AgentPoolPalette } from './agent-pool-palette';

// ── Max tabs shown before +N overflow indicator ───────────────────────────────
const MAX_VISIBLE_TABS = 6;

// ── Model badge — shows the model from sandbox policy or a default fallback ───
function ModelBadge({ model }: { model: string }) {
  // Shorten long model strings to a compact badge (e.g. "claude-opus-4" → "opus-4")
  const shortModel = model.replace(/^(claude-|anthropic\/claude-)/i, '').slice(0, 16);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-wider"
      style={{
        background: 'rgba(99,102,241,0.14)',
        border: '1px solid rgba(99,102,241,0.3)',
        color: 'rgba(165,180,252,0.9)',
      }}
    >
      {shortModel}
    </span>
  );
}

// ── Compact tab bar ───────────────────────────────────────────────────────────

interface TabBarProps {
  agents: AgentRecord[];
  activeId: string;
  runtime: AgentRuntimeData | null;
  onEdit: () => void;
}

function AgentTabBar({ agents, activeId, runtime, onEdit }: TabBarProps) {
  const visibleAgents = agents.slice(0, MAX_VISIBLE_TABS);
  const overflowCount = agents.length - MAX_VISIBLE_TABS;

  // Derive counts from runtime
  const skillCount = runtime ? runtime.skills.filter((s) => s.enabled).length : 0;
  const toolCount = runtime
    ? runtime.toolSections.reduce((acc, s) => acc + s.tools.filter((t) => t.enabled).length, 0)
    : 0;

  const activeAgent = agents.find((a) => a.id === activeId);
  // Model from inference.route_via in the sandbox policy; falls back to a default
  const modelName =
    activeAgent?.sandboxPolicy?.sandbox?.inference?.route_via ?? 'claude-sonnet';

  return (
    <div
      className="flex items-center gap-1 px-3 border-b flex-shrink-0"
      style={{
        height: '40px',
        background: 'hsl(var(--background))',
        borderColor: 'hsl(var(--border))',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      {/* ← All agents link */}
      <Link
        to="/agents"
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors duration-100 flex-shrink-0 mr-2 pr-2"
        style={{ borderRight: '1px solid hsl(var(--border))' }}
      >
        <ChevronLeftIcon className="w-3 h-3" />
        <span className="hidden sm:inline">All agents</span>
      </Link>

      {/* Agent tabs */}
      <div className="flex items-center gap-0.5 flex-1 overflow-hidden">
        {visibleAgents.map((agent) => {
          const isActive = agent.id === activeId;
          return (
            <Link
              key={agent.id}
              to={`/agents/${agent.id}`}
              className="flex items-center gap-1.5 px-2.5 h-full text-[11px] font-medium whitespace-nowrap transition-colors duration-100 cursor-pointer relative flex-shrink-0"
              style={{
                color: isActive ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
              }}
            >
              <span>{agent.emoji}</span>
              <span className="hidden sm:inline max-w-[100px] truncate">{agent.name}</span>
            </Link>
          );
        })}

        {/* +N overflow indicator if > MAX_VISIBLE_TABS agents */}
        {overflowCount > 0 && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground flex-shrink-0"
            style={{
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.2)',
            }}
          >
            +{overflowCount}
          </span>
        )}
      </div>

      {/* Right side: metadata + Edit button */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-2 pl-2" style={{ borderLeft: '1px solid hsl(var(--border))' }}>
        {runtime && (
          <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden md:inline">
            {skillCount} skill{skillCount !== 1 ? 's' : ''} · {toolCount} tool{toolCount !== 1 ? 's' : ''}
          </span>
        )}

        <ModelBadge model={modelName} />

        <button
          onClick={onEdit}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors duration-100 cursor-pointer"
          style={{
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.25)',
            color: 'rgba(165,180,252,0.9)',
          }}
          title="Edit agent"
        >
          <PencilIcon className="w-3 h-3" />
          <span className="hidden sm:inline">Edit</span>
        </button>
      </div>
    </div>
  );
}

// ── AgentFocusPage ────────────────────────────────────────────────────────────

export function AgentFocusPage() {
  const { id } = useParams<{ id: string }>();
  const agentId = id ?? '';

  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [runtime, setRuntime] = useState<AgentRuntimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Locally-added skills/tools from the palette — persisted to canvas immediately,
  // actual API call is a known gap (TODO below).
  const [extraSkills, setExtraSkills] = useState<AgentSkillRecord[]>([]);
  const [extraTools, setExtraTools] = useState<AgentToolRecord[]>([]);

  // Reset locally-added extras when navigating to a different agent
  useEffect(() => {
    setExtraSkills([]);
    setExtraTools([]);
  }, [agentId]);

  // Load agents list (for tab bar) + current agent runtime in parallel
  const load = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    try {
      const [agentList, runtimeData] = await Promise.all([
        fetchAgents(),
        fetchAgentRuntime(agentId),
      ]);
      setAgents(agentList);
      setRuntime(runtimeData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Find the current agent record from the list
  const currentAgent = agents.find((a) => a.id === agentId);

  const handleOpenPalette = useCallback(() => setPaletteOpen(true), []);

  // Skill assignment stub — add node to orbital canvas + close palette.
  // TODO: call real API to persist skill assignment.
  const handleAssignSkill = useCallback((skill: SkillNode) => {
    console.log('[AgentFocusPage] TODO: call API — assign skill', skill.name, 'to agent', agentId);
    // Convert SkillNode (graph type) to AgentSkillRecord (canvas type) and add to local state
    const record: AgentSkillRecord = {
      name: skill.name,
      description: skill.description ?? '',
      group: skill.tags.includes('workspace') ? 'workspace' : 'built-in',
      source: 'graph',
      enabled: true,
    };
    setExtraSkills((prev) => [...prev, record]);
    setPaletteOpen(false);
  }, [agentId]);

  // Tool assignment stub — add node to orbital canvas + close palette.
  // TODO: call real API to persist tool assignment.
  const handleAssignTool = useCallback((tool: AgentToolRecord) => {
    console.log('[AgentFocusPage] TODO: call API — assign tool', tool.id, 'to agent', agentId);
    setExtraTools((prev) => [...prev, tool]);
    setPaletteOpen(false);
  }, [agentId]);

  const handleEdit = useCallback(() => {
    // Edit stub — to be wired in a later phase
  }, []);

  // Loading state — full-screen spinner before we have any data
  if (loading && !runtime) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <div
          className="w-7 h-7 rounded-full animate-spin"
          style={{
            border: '2px solid rgba(99,102,241,0.2)',
            borderTopColor: 'rgba(99,102,241,0.8)',
          }}
        />
        <span className="text-[10px] tracking-[0.2em] text-muted-foreground">
          LOADING AGENT…
        </span>
      </div>
    );
  }

  // Error state
  if (error && !runtime) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive">{error}</p>
        <Link to="/agents" className="text-xs underline text-muted-foreground hover:text-foreground">
          Back to agents
        </Link>
      </div>
    );
  }

  // If agent not found in list (edge case: direct URL for unknown ID)
  // Fall back to a synthetic agent record so the canvas still renders
  const agent: AgentRecord = currentAgent ?? {
    id: agentId,
    name: agentId,
    emoji: '🤖',
    isDefault: false,
    workspace: '',
    description: '',
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Compact sticky tab bar */}
      <AgentTabBar
        agents={agents}
        activeId={agentId}
        runtime={runtime}
        onEdit={handleEdit}
      />

      {/* Orbital canvas — fills remaining height */}
      <div className="relative flex-1 overflow-hidden">
        {runtime ? (
          <AgentOrbitalCanvas
            agent={agent}
            runtimeData={runtime}
            onOpenPalette={handleOpenPalette}
            extraSkills={extraSkills}
            extraTools={extraTools}
          />
        ) : (
          // Skeleton while runtime loads after agent list arrives
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-6 h-6 rounded-full animate-spin"
              style={{
                border: '2px solid rgba(99,102,241,0.2)',
                borderTopColor: 'rgba(99,102,241,0.7)',
              }}
            />
          </div>
        )}
      </div>

      {/* Pool palette — floating + panel for assigning skills / tools */}
      {paletteOpen && runtime && (
        <AgentPoolPalette
          agentId={agentId}
          agentName={agent.name}
          assignedSkills={runtime.skills.filter((s) => s.enabled)}
          assignedTools={runtime.toolSections}
          onAssignSkill={handleAssignSkill}
          onAssignTool={handleAssignTool}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}

export default AgentFocusPage;
