// AgentPoolPalette — floating + panel for assigning skills and tools to an agent.
//
// Anchored bottom-right via fixed positioning. Renders a semi-transparent overlay
// behind the panel that closes on click. Two tabs: Skills (indigo) / Tools (cyan).
//
// Skills: fetched from skill graph, split into CORE and CUSTOM sections.
// Tools: derived from runtime toolSections — only disabled (unassigned) tools shown as available.

import { useEffect, useRef, useState } from 'react';
import { XIcon, PlusIcon, SearchIcon, Loader2Icon } from 'lucide-react';

import type { AgentSkillRecord, AgentToolRecord, AgentToolSection } from './agent-types';
import type { SkillNode } from '../skills/skill-graph-types';
import { fetchSkillGraph, querySkillGraph } from '../skills/skill-graph-api';
import { fetchAgentRuntime } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentPoolPaletteProps {
  agentId: string;
  agentName: string;
  assignedSkills: AgentSkillRecord[];
  assignedTools: AgentToolSection[];
  onAssignSkill: (skill: SkillNode) => void;
  onAssignTool: (tool: AgentToolRecord) => void;
  onClose: () => void;
}

type ActiveTab = 'skills' | 'tools';

// ── Colour tokens ──────────────────────────────────────────────────────────────

const SKILL_ACCENT = '#4f46e5';
const SKILL_LIGHT = '#a5b4fc';
const TOOL_ACCENT = '#0891b2';
const TOOL_LIGHT = '#67e8f9';

// ── Skills tab ────────────────────────────────────────────────────────────────

interface SkillsTabProps {
  assignedSkills: AgentSkillRecord[];
  /** Skills added optimistically this session (before palette close) */
  locallyAssigned: Set<string>;
  onAssign: (skill: SkillNode) => void;
}

function SkillsTab({ assignedSkills, locallyAssigned, onAssign }: SkillsTabProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [allSkills, setAllSkills] = useState<SkillNode[]>([]);
  const [searchResults, setSearchResults] = useState<SkillNode[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load full skill graph on mount
  useEffect(() => {
    setLoading(true);
    fetchSkillGraph()
      .then((snapshot) => {
        // Filter to skill nodes only (exclude category nodes)
        setAllSkills(snapshot.nodes.filter((n) => n.nodeType === 'skill'));
      })
      .catch(() => {
        setAllSkills([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Debounced search — 250 ms after typing stops
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      querySkillGraph(query.trim(), 20)
        .then((scored) => {
          // Map scored results back to full SkillNode objects by name
          const nameSet = new Set(scored.map((s) => s.name));
          const matched = allSkills.filter((n) => nameSet.has(n.name));
          setSearchResults(matched);
        })
        .catch(() => setSearchResults([]));
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, allSkills]);

  // Build set of names already assigned (from prop + optimistic local set)
  const assignedNames = new Set([
    ...assignedSkills.map((s) => s.name),
    ...locallyAssigned,
  ]);

  // Skills to display — search results override full list
  const displaySkills = searchResults ?? allSkills;

  // Split displayed skills into CORE (non-workspace) and CUSTOM (workspace-sourced)
  // Note: SkillNode has no "group" field, so we use tags to guess: if tag includes
  // 'workspace' treat as custom; otherwise core. Falls back gracefully to core.
  const coreSkills = displaySkills.filter((s) => !s.tags.includes('workspace'));
  const customSkills = displaySkills.filter((s) => s.tags.includes('workspace'));

  function renderSkillItem(skill: SkillNode) {
    const isAssigned = assignedNames.has(skill.name);
    // Extract leading emoji from name if present (simple heuristic)
    const emojiMatch = skill.name.match(/^\p{Emoji}/u);
    const emoji = emojiMatch ? emojiMatch[0] : '🔷';
    const displayName = emojiMatch ? skill.name.slice(emoji.length).trim() : skill.name;

    return (
      <div
        key={skill.id}
        className="flex items-start gap-2 px-3 py-2 rounded transition-colors"
        style={{
          opacity: isAssigned ? 0.4 : 1,
          background: 'transparent',
        }}
      >
        {/* Emoji */}
        <span className="text-sm flex-shrink-0 mt-0.5">{emoji}</span>

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-white truncate">{displayName}</p>
          {skill.description && (
            <p className="text-[10px] text-zinc-400 line-clamp-2 mt-0.5">{skill.description}</p>
          )}
        </div>

        {/* Action */}
        {isAssigned ? (
          <span className="text-[9px] text-zinc-500 flex-shrink-0 mt-1">assigned</span>
        ) : (
          <button
            onClick={() => onAssign(skill)}
            className="flex items-center gap-0.5 flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer"
            style={{
              background: `rgba(79,70,229,0.2)`,
              border: `1px solid rgba(79,70,229,0.4)`,
              color: SKILL_LIGHT,
            }}
            title={`Add ${skill.name}`}
          >
            <PlusIcon className="w-2.5 h-2.5" />
            add
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2Icon className="w-4 h-4 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 overflow-hidden">
      {/* Search bar */}
      <div className="px-3 pt-2 pb-1">
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 rounded"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <SearchIcon className="w-3 h-3 text-zinc-500 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills…"
            className="flex-1 bg-transparent text-[11px] text-white placeholder-zinc-600 outline-none"
          />
        </div>
      </div>

      {/* Scrollable list */}
      <div className="overflow-y-auto flex-1" style={{ maxHeight: '340px' }}>
        {displaySkills.length === 0 ? (
          <p className="text-[10px] text-zinc-600 text-center py-6">No skills found</p>
        ) : (
          <>
            {/* CORE section */}
            {coreSkills.length > 0 && (
              <>
                <p
                  className="px-3 pt-3 pb-1 text-[9px] font-bold tracking-widest uppercase"
                  style={{ color: 'rgba(165,180,252,0.5)' }}
                >
                  Core
                </p>
                {coreSkills.map(renderSkillItem)}
              </>
            )}

            {/* CUSTOM section */}
            {customSkills.length > 0 && (
              <>
                <p
                  className="px-3 pt-3 pb-1 text-[9px] font-bold tracking-widest uppercase"
                  style={{ color: 'rgba(165,180,252,0.5)' }}
                >
                  Custom
                </p>
                {customSkills.map(renderSkillItem)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Tools tab ─────────────────────────────────────────────────────────────────

interface ToolsTabProps {
  agentId: string;
  assignedTools: AgentToolSection[];
  /** Tools added optimistically this session */
  locallyAssigned: Set<string>;
  onAssign: (tool: AgentToolRecord) => void;
}

function ToolsTab({ agentId, assignedTools: _assignedTools, locallyAssigned, onAssign }: ToolsTabProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [allSections, setAllSections] = useState<AgentToolSection[]>([]);

  // Fetch full runtime (all tools, enabled AND disabled) on mount
  useEffect(() => {
    setLoading(true);
    fetchAgentRuntime(agentId)
      .then((runtime) => {
        setAllSections(runtime.toolSections);
      })
      .catch(() => setAllSections([]))
      .finally(() => setLoading(false));
  }, [agentId]);

  // Build set of IDs that are now assigned (enabled OR optimistically assigned)
  const assignedIds = new Set([
    ...allSections.flatMap((s) => s.tools.filter((t) => t.enabled).map((t) => t.id)),
    ...locallyAssigned,
  ]);

  // Flatten all tools, then filter by search query
  const allTools = allSections.flatMap((s) => s.tools);
  const filtered = query.trim()
    ? allTools.filter((t) => t.label.toLowerCase().includes(query.trim().toLowerCase()))
    : allTools;

  // Only show core tools (not plugin/discovered)
  const coreTools = filtered.filter((t) => t.source === 'core');

  function renderToolItem(tool: AgentToolRecord) {
    const isAssigned = assignedIds.has(tool.id);

    return (
      <div
        key={tool.id}
        className="flex items-start gap-2 px-3 py-2 rounded"
        style={{ opacity: isAssigned ? 0.4 : 1 }}
      >
        {/* Emoji */}
        <span className="text-sm flex-shrink-0 mt-0.5">🔧</span>

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-white truncate">{tool.label}</p>
          {tool.description && (
            <p className="text-[10px] text-zinc-400 line-clamp-2 mt-0.5">{tool.description}</p>
          )}
        </div>

        {/* Action */}
        {isAssigned ? (
          <span className="text-[9px] text-zinc-500 flex-shrink-0 mt-1">assigned</span>
        ) : (
          <button
            onClick={() => onAssign(tool)}
            className="flex items-center gap-0.5 flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer"
            style={{
              background: `rgba(8,145,178,0.2)`,
              border: `1px solid rgba(8,145,178,0.4)`,
              color: TOOL_LIGHT,
            }}
            title={`Add ${tool.label}`}
          >
            <PlusIcon className="w-2.5 h-2.5" />
            add
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2Icon className="w-4 h-4 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 overflow-hidden">
      {/* Search bar */}
      <div className="px-3 pt-2 pb-1">
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 rounded"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <SearchIcon className="w-3 h-3 text-zinc-500 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools…"
            className="flex-1 bg-transparent text-[11px] text-white placeholder-zinc-600 outline-none"
          />
        </div>
      </div>

      {/* Scrollable list */}
      <div className="overflow-y-auto flex-1" style={{ maxHeight: '340px' }}>
        {coreTools.length === 0 ? (
          <p className="text-[10px] text-zinc-600 text-center py-6">No tools found</p>
        ) : (
          coreTools.map(renderToolItem)
        )}
      </div>
    </div>
  );
}

// ── AgentPoolPalette ──────────────────────────────────────────────────────────

export function AgentPoolPalette({
  agentId,
  agentName,
  assignedSkills,
  assignedTools,
  onAssignSkill,
  onAssignTool,
  onClose,
}: AgentPoolPaletteProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('skills');

  // Optimistic local assignment tracking: IDs/names added this session
  const [localSkillsAssigned, setLocalSkillsAssigned] = useState<Set<string>>(new Set());
  const [localToolsAssigned, setLocalToolsAssigned] = useState<Set<string>>(new Set());

  // Handle skill assignment — optimistic update then delegate to parent
  function handleAssignSkill(skill: SkillNode) {
    setLocalSkillsAssigned((prev) => new Set([...prev, skill.name]));
    onAssignSkill(skill);
  }

  // Handle tool assignment — optimistic update then delegate to parent
  function handleAssignTool(tool: AgentToolRecord) {
    setLocalToolsAssigned((prev) => new Set([...prev, tool.id]));
    onAssignTool(tool);
  }

  return (
    <>
      {/* Semi-transparent overlay — click to close */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 40,
        }}
        aria-hidden="true"
      />

      {/* Palette panel */}
      <div
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          zIndex: 50,
          width: '230px',
          background: '#13131f',
          border: '1px solid #2a2a3a',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2.5"
          style={{ borderBottom: '1px solid #2a2a3a' }}
        >
          <p className="text-[11px] font-semibold text-white truncate">
            Add to{' '}
            <span style={{ color: SKILL_LIGHT }}>{agentName}</span>
          </p>
          <button
            onClick={onClose}
            className="flex-shrink-0 ml-2 p-0.5 rounded transition-colors cursor-pointer text-zinc-500 hover:text-white"
            aria-label="Close palette"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tab bar */}
        <div
          className="flex items-center"
          style={{ borderBottom: '1px solid #2a2a3a' }}
        >
          <button
            onClick={() => setActiveTab('skills')}
            className="flex-1 py-2 text-[10px] font-bold tracking-widest uppercase transition-colors cursor-pointer"
            style={{
              color: activeTab === 'skills' ? SKILL_LIGHT : 'rgba(255,255,255,0.35)',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: activeTab === 'skills' ? `2px solid ${SKILL_ACCENT}` : '2px solid transparent',
            }}
          >
            Skills
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className="flex-1 py-2 text-[10px] font-bold tracking-widest uppercase transition-colors cursor-pointer"
            style={{
              color: activeTab === 'tools' ? TOOL_LIGHT : 'rgba(255,255,255,0.35)',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: activeTab === 'tools' ? `2px solid ${TOOL_ACCENT}` : '2px solid transparent',
            }}
          >
            Tools
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'skills' ? (
          <SkillsTab
            assignedSkills={assignedSkills}
            locallyAssigned={localSkillsAssigned}
            onAssign={handleAssignSkill}
          />
        ) : (
          <ToolsTab
            agentId={agentId}
            assignedTools={assignedTools}
            locallyAssigned={localToolsAssigned}
            onAssign={handleAssignTool}
          />
        )}
      </div>
    </>
  );
}
