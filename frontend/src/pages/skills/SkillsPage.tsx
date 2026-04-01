import { useCallback, useMemo, useReducer, useState } from 'react';
import { SearchIcon, ListIcon, ChevronRightIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useDebounced } from '@/hooks/use-debounced';
import { useSkillsQuery, useAgentsQuery } from '@/lib/queries';
import type { SkillRecord } from '@/lib/types';

import { SkillDetailPanel } from './SkillDetailPanel';

type FilterTab = 'all' | 'built-in' | 'custom';

/** Accent colours for each section */
const BUILTIN_COLOR = '#6366f1';
const CUSTOM_COLOR = '#8b5cf6';

type UiState = { selectedSkill: SkillRecord | null; filter: FilterTab };
type UiAction =
  | { type: 'select'; skill: SkillRecord | null }
  | { type: 'setFilter'; filter: FilterTab };
function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'select': return { ...state, selectedSkill: action.skill };
    case 'setFilter': return { ...state, filter: action.filter };
  }
}

export function SkillsPage() {
  const { data: skills = [], isPending: skillsLoading } = useSkillsQuery();
  const { data: agents = [] } = useAgentsQuery();
  const [searchQuery, setSearchQuery] = useState('');

  const [uiState, dispatchUi] = useReducer(uiReducer, { selectedSkill: null, filter: 'all' as FilterTab });
  const { selectedSkill, filter } = uiState;

  const debouncedSearch = useDebounced(searchQuery, 300);

  // Filter and search logic
  const { builtInSkills, customSkills } = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();

    let filtered = skills;

    // Apply built-in/custom filter
    if (filter === 'built-in') filtered = filtered.filter((s) => s.isBuiltIn);
    if (filter === 'custom') filtered = filtered.filter((s) => !s.isBuiltIn);

    // Apply search filter
    if (query) {
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query),
      );
    }

    return {
      builtInSkills: filtered.filter((s) => s.isBuiltIn),
      customSkills: filtered.filter((s) => !s.isBuiltIn),
    };
  }, [skills, filter, debouncedSearch]);

  const totalVisible = builtInSkills.length + customSkills.length;

  // Assign/unassign stubs with optimistic local state
  const [assignedBySkill, setAssignedBySkill] = useState<Record<string, string[]>>({});
  const getAssignedAgentIds = (skillName: string) => assignedBySkill[skillName] ?? [];

  const handleAssign = useCallback((skillName: string, agentId: string) => {
    setAssignedBySkill((prev) => ({
      ...prev,
      [skillName]: [...(prev[skillName] ?? []), agentId],
    }));
  }, []);

  const handleUnassign = useCallback((skillName: string, agentId: string) => {
    setAssignedBySkill((prev) => ({
      ...prev,
      [skillName]: (prev[skillName] ?? []).filter((id) => id !== agentId),
    }));
  }, []);

  const handleSkillSelect = useCallback((skill: SkillRecord | null) => {
    dispatchUi({ type: 'select', skill });
  }, []);

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'built-in', label: 'Built-in' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="relative flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
      {/* Header bar */}
      <div
        className="flex items-center gap-3 px-6 py-4 flex-shrink-0 flex-wrap"
        style={{ borderBottom: '1px solid hsl(var(--border) / 0.4)' }}
      >
        <div className="flex items-center gap-2 mr-2">
          <ListIcon className="w-4 h-4 text-primary opacity-70" />
          <span className="text-sm font-bold text-foreground">Skill Pool</span>
          <span className="text-xs text-muted-foreground">
            ({skills.length})
          </span>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center rounded-lg border border-border/50 p-0.5 flex-shrink-0">
          {filterTabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => dispatchUi({ type: 'setFilter', filter: key })}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                filter === key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills…"
            className={cn(
              'w-full pl-8 pr-3 py-1.5 text-xs rounded-lg outline-none transition-colors',
              'bg-muted/40 border border-border/50 text-foreground placeholder:text-muted-foreground/60',
              'focus:border-primary/50 focus:bg-muted/60',
            )}
          />
        </div>

        {/* Result count when searching */}
        {debouncedSearch.trim() && (
          <span className="text-xs text-muted-foreground">
            {totalVisible} match{totalVisible !== 1 ? 'es' : ''}
          </span>
        )}

        {skillsLoading && (
          <div
            className="w-4 h-4 rounded-full animate-spin flex-shrink-0"
            style={{
              border: '2px solid rgba(99,102,241,0.2)',
              borderTopColor: 'rgba(99,102,241,0.8)',
            }}
          />
        )}
      </div>

      {/* Skill list + detail panel */}
      <div className="relative flex-1 min-h-0">
        <div className="h-full overflow-y-auto px-6 py-4">
          {skillsLoading ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
              Loading skills…
            </div>
          ) : builtInSkills.length === 0 && customSkills.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
              {debouncedSearch.trim() ? 'No skills match your search.' : 'No skills available.'}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {builtInSkills.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: BUILTIN_COLOR }}
                    />
                    <span
                      className="text-[11px] font-bold tracking-[0.12em] uppercase"
                      style={{ color: BUILTIN_COLOR }}
                    >
                      Built-in
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      ({builtInSkills.length})
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {builtInSkills.map((skill) => (
                      <SkillListItem
                        key={skill.name}
                        skill={skill}
                        accentColor={BUILTIN_COLOR}
                        isSelected={selectedSkill?.name === skill.name}
                        onClick={() => handleSkillSelect(skill)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {customSkills.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: CUSTOM_COLOR }}
                    />
                    <span
                      className="text-[11px] font-bold tracking-[0.12em] uppercase"
                      style={{ color: CUSTOM_COLOR }}
                    >
                      Custom
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      ({customSkills.length})
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {customSkills.map((skill) => (
                      <SkillListItem
                        key={skill.name}
                        skill={skill}
                        accentColor={CUSTOM_COLOR}
                        isSelected={selectedSkill?.name === skill.name}
                        onClick={() => handleSkillSelect(skill)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Detail panel overlays on the right */}
        <SkillDetailPanel
          skill={selectedSkill}
          agents={agents}
          assignedAgentIds={selectedSkill ? getAssignedAgentIds(selectedSkill.name) : []}
          onClose={() => dispatchUi({ type: 'select', skill: null })}
          onAssign={(agentId) => selectedSkill && handleAssign(selectedSkill.name, agentId)}
          onUnassign={(agentId) => selectedSkill && handleUnassign(selectedSkill.name, agentId)}
        />
      </div>
    </div>
  );
}

/** Individual skill row in the list */
function SkillListItem({
  skill,
  accentColor,
  isSelected,
  onClick,
}: {
  skill: SkillRecord;
  accentColor: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isCustom = !skill.isBuiltIn;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-all duration-150',
        'hover:bg-muted/50',
      )}
      style={{
        background: isSelected ? `${accentColor}10` : undefined,
        boxShadow: isSelected ? `0 0 0 1px ${accentColor}40` : undefined,
      }}
    >
      {/* Accent dot */}
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: accentColor, opacity: 0.6 }}
      />

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground truncate">{skill.name}</span>
          {isCustom && (
            <span
              className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded flex-shrink-0"
              style={{
                background: `${accentColor}15`,
                color: accentColor,
                border: `1px dashed ${accentColor}50`,
              }}
            >
              custom
            </span>
          )}
        </div>
        {skill.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 leading-snug">
            {skill.description}
          </p>
        )}
      </div>

      <ChevronRightIcon className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
    </button>
  );
}

export default SkillsPage;
