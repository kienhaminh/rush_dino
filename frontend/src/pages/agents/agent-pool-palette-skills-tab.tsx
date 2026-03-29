// SkillsTab — displays the skills palette inside AgentPoolPalette.
//
// Loads the full skill graph on mount, supports debounced semantic search,
// and splits results into CORE / CUSTOM sections based on a tag heuristic.

import { useEffect, useRef, useState } from 'react';
import { PlusIcon, SearchIcon, Loader2Icon } from 'lucide-react';

import type { AgentSkillRecord } from './agent-types';
import type { SkillNode } from '../skills/skill-graph-types';
import { fetchSkillGraph, querySkillGraph } from '../skills/skill-graph-api';

// ── Colour tokens (shared via import from shell) ───────────────────────────

const SKILL_ACCENT = '#4f46e5';
const SKILL_LIGHT = '#a5b4fc';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SkillsTabProps {
  assignedSkills: AgentSkillRecord[];
  /** Skills added optimistically this session (before palette close) */
  locallyAssigned: Set<string>;
  onAssign: (skill: SkillNode) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function SkillsTab({ assignedSkills, locallyAssigned, onAssign }: SkillsTabProps) {
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
          // Map scored results back to full SkillNode objects by name.
          // Use case-insensitive comparison so "Web Search" matches "web search".
          const nameSet = new Set(scored.map((s) => s.name.toLowerCase()));
          const matched = allSkills.filter((n) => nameSet.has(n.name.toLowerCase()));
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

  // Split displayed skills into CORE (non-workspace) and CUSTOM (workspace-sourced).
  // TODO: SkillNode has no `group` field from the API. Using tags.includes('workspace')
  // as a heuristic. When the API exposes a `group` field on SkillNode, replace this.
  const coreSkills = displaySkills.filter((n) => !n.tags.includes('workspace'));
  const customSkills = displaySkills.filter((n) => n.tags.includes('workspace'));

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

// Re-export colour tokens for use in the shell component
export { SKILL_ACCENT, SKILL_LIGHT };
