// SkillsTab — displays the skills palette inside AgentPoolPalette.
//
// Loads skills from the real skills API on mount, supports debounced string
// search, and splits results into BUILT-IN / CUSTOM sections using isBuiltIn.

import { useEffect, useReducer, useRef } from 'react';
import { PlusIcon, SearchIcon, Loader2Icon } from 'lucide-react';

import type { AgentSkillRecord } from './agent-types';
import type { SkillRecord } from '@/lib/types';
import { fetchSkills } from '@/lib/api';

// ── Colour tokens (shared via import from shell) ───────────────────────────

const SKILL_ACCENT = '#4f46e5';
const SKILL_LIGHT = '#a5b4fc';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SkillsTabProps {
  assignedSkills: AgentSkillRecord[];
  /** Skills added optimistically this session (before palette close) */
  locallyAssigned: Set<string>;
  onAssign: (skill: SkillRecord) => void;
}

// ── Reducer ────────────────────────────────────────────────────────────────

type TabState = {
  query: string;
  loading: boolean;
  allSkills: SkillRecord[];
};

type TabAction =
  | { type: 'setQuery'; query: string }
  | { type: 'loadStart' }
  | { type: 'loadDone'; skills: SkillRecord[] };

function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case 'setQuery':
      return { ...state, query: action.query };
    case 'loadStart':
      return { ...state, loading: true };
    case 'loadDone':
      return { ...state, loading: false, allSkills: action.skills };
  }
}

const initialTabState: TabState = {
  query: '',
  loading: false,
  allSkills: [],
};

// ── Component ──────────────────────────────────────────────────────────────

export function SkillsTab({ assignedSkills, locallyAssigned, onAssign }: SkillsTabProps) {
  const [{ query, loading, allSkills }, dispatch] = useReducer(
    tabReducer,
    initialTabState,
  );

  // Load skills on mount
  useEffect(() => {
    dispatch({ type: 'loadStart' });
    fetchSkills()
      .then((skills) => {
        dispatch({ type: 'loadDone', skills });
      })
      .catch(() => {
        dispatch({ type: 'loadDone', skills: [] });
      });
  }, []);

  // Build set of names already assigned (from prop + optimistic local set)
  const assignedNames = new Set([
    ...assignedSkills.map((s) => s.name),
    ...locallyAssigned,
  ]);

  // Simple string matching for search
  const displaySkills = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return allSkills;
    return allSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    );
  })();

  // Split displayed skills into BUILT-IN and CUSTOM using isBuiltIn
  const builtInSkills = displaySkills.filter((n) => n.isBuiltIn);
  const customSkills = displaySkills.filter((n) => !n.isBuiltIn);

  function renderSkillItem(skill: SkillRecord) {
    const isAssigned = assignedNames.has(skill.name);
    // Extract leading emoji from name if present (simple heuristic)
    const emojiMatch = skill.name.match(/^\p{Emoji}/u);
    const emoji = emojiMatch ? emojiMatch[0] : '🔷';
    const displayName = emojiMatch ? skill.name.slice(emoji.length).trim() : skill.name;

    return (
      <div
        key={skill.name}
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
            onChange={(e) => dispatch({ type: 'setQuery', query: e.target.value })}
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
            {/* BUILT-IN section */}
            {builtInSkills.length > 0 && (
              <>
                <p
                  className="px-3 pt-3 pb-1 text-[9px] font-bold tracking-widest uppercase"
                  style={{ color: 'rgba(165,180,252,0.5)' }}
                >
                  Built-in
                </p>
                {builtInSkills.map(renderSkillItem)}
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
