import { useEffect, useReducer, useState, useCallback } from 'react';
import { SearchIcon, NetworkIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useDebounced } from '@/hooks/use-debounced';
import { useSkillGraphQuery, useAgentsQuery } from '@/lib/queries';

import type { SkillNode } from './skill-graph-types';
import { querySkillGraph } from './skill-graph-api';
import { SkillGraphView } from './SkillGraphView';
import { SkillDetailPanel } from './SkillDetailPanel';

type FilterTab = 'all' | 'core' | 'custom';

type UiState = { selectedSkill: SkillNode | null; filter: FilterTab };
type UiAction =
  | { type: 'select'; skill: SkillNode | null }
  | { type: 'setFilter'; filter: FilterTab };
function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'select': return { ...state, selectedSkill: action.skill };
    case 'setFilter': return { ...state, filter: action.filter };
  }
}

type HighlightAction = { type: 'clear' } | { type: 'set'; ids: Set<string> };
function highlightReducer(_: Set<string> | null, action: HighlightAction): Set<string> | null {
  return action.type === 'clear' ? null : action.ids;
}

export function SkillsPage() {
  const { data: graph, isPending: graphLoading } = useSkillGraphQuery();
  const { data: agents = [] } = useAgentsQuery();
  const [searchQuery, setSearchQuery] = useState('');

  // Selection & UI state grouped together
  const [uiState, dispatchUi] = useReducer(uiReducer, { selectedSkill: null, filter: 'all' as FilterTab });
  const { selectedSkill, filter } = uiState;

  // Highlighted IDs from semantic search results — null means "no active search"
  const [highlightedIds, dispatchHighlight] = useReducer(highlightReducer, null);

  const debouncedSearch = useDebounced(searchQuery, 300);

  // Run semantic search when debounced query changes.
  // A cancellation flag prevents stale responses from overwriting fresh results.
  useEffect(() => {
    if (!debouncedSearch.trim()) {
      dispatchHighlight({ type: 'clear' });
      return;
    }
    let cancelled = false;
    querySkillGraph(debouncedSearch, 20)
      .then((results) => {
        if (!cancelled && graph) {
          // Map scored result names back to node IDs — search returns names, graph dims by ID
          const nameSet = new Set(results.map((r) => r.name.toLowerCase()));
          const ids = new Set(
            graph.nodes
              .filter((n) => n.nodeType === 'skill' && nameSet.has(n.name.toLowerCase()))
              .map((n) => n.id),
          );
          dispatchHighlight({ type: 'set', ids });
        }
      })
      .catch(() => {
        if (!cancelled) dispatchHighlight({ type: 'clear' });
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, graph]);

  // Assign/unassign stubs with optimistic local state
  // TODO: wire up real API calls when assign/unassign endpoints exist
  const [assignedBySkill, setAssignedBySkill] = useState<Record<string, string[]>>({});

  const getAssignedAgentIds = (skillId: string) => assignedBySkill[skillId] ?? [];

  const handleAssign = useCallback((skillId: string, agentId: string) => {
    console.log('TODO: assign skill', skillId, 'to agent', agentId);
    // Optimistic local update
    setAssignedBySkill((prev) => ({
      ...prev,
      [skillId]: [...(prev[skillId] ?? []), agentId],
    }));
  }, []);

  const handleUnassign = useCallback((skillId: string, agentId: string) => {
    console.log('TODO: unassign skill', skillId, 'from agent', agentId);
    // Optimistic local update
    setAssignedBySkill((prev) => ({
      ...prev,
      [skillId]: (prev[skillId] ?? []).filter((id) => id !== agentId),
    }));
  }, []);

  const handleSkillSelect = useCallback((skill: SkillNode | null) => {
    dispatchUi({ type: 'select', skill });
  }, [dispatchUi]);

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'core', label: 'Core' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="relative flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
      {/* Header bar */}
      <div
        className="flex items-center gap-3 px-6 py-4 flex-shrink-0 flex-wrap"
        style={{ borderBottom: '1px solid hsl(var(--border) / 0.4)' }}
      >
        {/* Title */}
        <div className="flex items-center gap-2 mr-2">
          <NetworkIcon className="w-4 h-4 text-primary opacity-70" />
          <span className="text-sm font-bold text-foreground">Skill Pool</span>
          {graph && (
            <span className="text-xs text-muted-foreground">
              ({graph.nodes.filter((n) => n.nodeType === 'skill').length})
            </span>
          )}
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
            placeholder="Semantic search…"
            className={cn(
              'w-full pl-8 pr-3 py-1.5 text-xs rounded-lg outline-none transition-colors',
              'bg-muted/40 border border-border/50 text-foreground placeholder:text-muted-foreground/60',
              'focus:border-primary/50 focus:bg-muted/60',
            )}
          />
        </div>

        {/* Search active hint */}
        {highlightedIds && highlightedIds.size > 0 && (
          <span className="text-xs text-muted-foreground">
            {highlightedIds.size} match{highlightedIds.size !== 1 ? 'es' : ''}
          </span>
        )}

        {/* Loading indicator */}
        {graphLoading && (
          <div
            className="w-4 h-4 rounded-full animate-spin flex-shrink-0"
            style={{
              border: '2px solid rgba(99,102,241,0.2)',
              borderTopColor: 'rgba(99,102,241,0.8)',
            }}
          />
        )}
      </div>

      {/* Graph area + overlapping detail panel */}
      <div className="relative flex-1 min-h-0">
        <div className="h-full overflow-auto px-4 py-4">
          <SkillGraphView
            snapshot={graph ?? null}
            onSkillSelect={handleSkillSelect}
            selectedSkillId={selectedSkill?.id}
            highlightedIds={debouncedSearch.trim() && highlightedIds ? highlightedIds : undefined}
            filter={filter}
          />
        </div>

        {/* Detail panel overlays on the right */}
        <SkillDetailPanel
          skill={selectedSkill}
          agents={agents}
          assignedAgentIds={selectedSkill ? getAssignedAgentIds(selectedSkill.id) : []}
          onClose={() => dispatchUi({ type: 'select', skill: null })}
          onAssign={(agentId) => selectedSkill && handleAssign(selectedSkill.id, agentId)}
          onUnassign={(agentId) => selectedSkill && handleUnassign(selectedSkill.id, agentId)}
        />
      </div>
    </div>
  );
}

export default SkillsPage;
