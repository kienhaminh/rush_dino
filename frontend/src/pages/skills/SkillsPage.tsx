import { useEffect, useState, useRef, useCallback } from 'react';
import { SearchIcon, LayoutGridIcon, NetworkIcon } from 'lucide-react';

import { fetchAgents } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AgentRecord } from '@/pages/agents/agent-types';

import type { SkillNode, GraphSnapshot } from './skill-graph-types';
import { fetchSkillGraph, querySkillGraph } from './skill-graph-api';
import { SkillGraphView } from './SkillGraphView';
import { SkillDetailPanel } from './SkillDetailPanel';

type FilterTab = 'all' | 'core' | 'custom';

/** Debounce a callback by `delay` ms */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function SkillsPage() {
  // Data
  const [graph, setGraph] = useState<GraphSnapshot | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);
  const [agents, setAgents] = useState<AgentRecord[]>([]);

  // Selection & UI state
  const [selectedSkill, setSelectedSkill] = useState<SkillNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');

  // Highlighted IDs from semantic search results
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);

  // Track inflight search to avoid race conditions
  const searchAbortRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSearch = useDebounced(searchQuery, 300);

  // Fetch graph on mount
  useEffect(() => {
    setGraphLoading(true);
    fetchSkillGraph()
      .then((data) => setGraph(data))
      .catch((err) => console.error('Failed to load skill graph:', err))
      .finally(() => setGraphLoading(false));
  }, []);

  // Fetch agents on mount
  useEffect(() => {
    fetchAgents()
      .then((data) => setAgents(data))
      .catch((err) => console.error('Failed to load agents:', err));
  }, []);

  // Run semantic search when debounced query changes
  useEffect(() => {
    if (searchAbortRef.current) {
      clearTimeout(searchAbortRef.current);
    }

    if (!debouncedSearch.trim()) {
      setHighlightedIds([]);
      return;
    }

    // Query the skill graph with the search term
    querySkillGraph(debouncedSearch, 20)
      .then((scored) => {
        if (!graph) return;
        // Map scored skill names back to node IDs
        const nameToId: Record<string, string> = {};
        for (const node of graph.nodes) {
          if (node.nodeType === 'skill') {
            nameToId[node.name.toLowerCase()] = node.id;
          }
        }
        const ids = scored
          .map((s) => nameToId[s.name.toLowerCase()])
          .filter(Boolean) as string[];
        setHighlightedIds(ids);
      })
      .catch((err) => {
        console.error('Skill graph query failed:', err);
        setHighlightedIds([]);
      });
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
    setSelectedSkill(skill);
  }, []);

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
              onClick={() => setFilter(key)}
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
        {highlightedIds.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {highlightedIds.length} match{highlightedIds.length !== 1 ? 'es' : ''}
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
            snapshot={graph}
            onSkillSelect={handleSkillSelect}
            selectedSkillId={selectedSkill?.id}
            highlightedIds={debouncedSearch.trim() ? highlightedIds : undefined}
            filter={filter}
          />
        </div>

        {/* Detail panel overlays on the right */}
        <SkillDetailPanel
          skill={selectedSkill}
          agents={agents}
          assignedAgentIds={selectedSkill ? getAssignedAgentIds(selectedSkill.id) : []}
          onClose={() => setSelectedSkill(null)}
          onAssign={(agentId) => selectedSkill && handleAssign(selectedSkill.id, agentId)}
          onUnassign={(agentId) => selectedSkill && handleUnassign(selectedSkill.id, agentId)}
        />
      </div>
    </div>
  );
}

export default SkillsPage;
