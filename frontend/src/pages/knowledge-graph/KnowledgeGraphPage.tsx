import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Database, RefreshCw, Search, Sparkles } from 'lucide-react';

import {
  fetchKgStats,
  fetchKgFacts,
  fetchKgSearch,
  fetchKgNode,
  triggerKgBackfill,
} from '@/lib/api';
import type { GraphEntity, GraphFact, GraphNode, GraphStats } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fact row
// ---------------------------------------------------------------------------

function FactRow({
  fact,
  onSubjectClick,
  onObjectClick,
}: {
  fact: GraphFact;
  onSubjectClick: (name: string) => void;
  onObjectClick: (name: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-border/30 last:border-0 text-sm">
      <button
        type="button"
        className="font-medium text-primary hover:underline truncate max-w-[180px]"
        onClick={() => onSubjectClick(fact.subject)}
        title={fact.subject}
      >
        {fact.subject}
      </button>
      <span className="text-muted-foreground shrink-0 font-mono text-xs bg-muted/40 px-1.5 py-0.5 rounded">
        {fact.predicate}
      </span>
      <button
        type="button"
        className="font-medium text-primary hover:underline truncate max-w-[180px]"
        onClick={() => onObjectClick(fact.object)}
        title={fact.object}
      >
        {fact.object}
      </button>
      <span className="ml-auto text-xs text-muted-foreground shrink-0">
        {(fact.confidence * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entity row
// ---------------------------------------------------------------------------

function EntityRow({
  entity,
  onClick,
}: {
  entity: GraphEntity;
  onClick: (entity: GraphEntity) => void;
}) {
  return (
    <button
      type="button"
      className="w-full text-left flex items-center gap-3 py-2 border-b border-border/30 last:border-0 hover:bg-muted/30 rounded px-1 transition-colors"
      onClick={() => onClick(entity)}
    >
      <span className="font-medium text-sm truncate flex-1">{entity.canonical_name}</span>
      {entity.entity_type && (
        <Badge variant="outline" className="text-xs shrink-0">
          {entity.entity_type}
        </Badge>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Node detail panel
// ---------------------------------------------------------------------------

function NodeDetailPanel({
  node,
  onBack,
  onEntityClick,
}: {
  node: GraphNode;
  onBack: () => void;
  onEntityClick: (name: string) => void;
}) {
  const { entity, outgoing, incoming } = node;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="font-semibold">{entity.canonical_name}</p>
          {entity.entity_type && (
            <Badge variant="outline" className="text-xs mt-0.5">
              {entity.entity_type}
            </Badge>
          )}
        </div>
      </div>

      {outgoing.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Outgoing ({outgoing.length})
          </p>
          <div>
            {outgoing.map((f) => (
              <FactRow
                key={f.id}
                fact={f}
                onSubjectClick={onEntityClick}
                onObjectClick={onEntityClick}
              />
            ))}
          </div>
        </div>
      )}

      {incoming.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Incoming ({incoming.length})
          </p>
          <div>
            {incoming.map((f) => (
              <FactRow
                key={f.id}
                fact={f}
                onSubjectClick={onEntityClick}
                onObjectClick={onEntityClick}
              />
            ))}
          </div>
        </div>
      )}

      {outgoing.length === 0 && incoming.length === 0 && (
        <p className="text-sm text-muted-foreground">No connections found for this entity.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reducers
// ---------------------------------------------------------------------------

type StatsState = { stats: GraphStats | null; statsError: string | null };
type StatsAction = { type: 'loaded'; stats: GraphStats } | { type: 'error'; message: string };
function statsReducer(_: StatsState, action: StatsAction): StatsState {
  if (action.type === 'loaded') return { stats: action.stats, statsError: null };
  return { stats: null, statsError: action.message };
}

type SearchState = { searching: boolean; facts: GraphFact[]; entities: GraphEntity[] };
type SearchAction =
  | { type: 'start' }
  | { type: 'facts'; facts: GraphFact[] }
  | { type: 'entities'; entities: GraphEntity[] }
  | { type: 'error' };
function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'start': return { ...state, searching: true };
    case 'facts': return { searching: false, facts: action.facts, entities: state.entities };
    case 'entities': return { searching: false, facts: state.facts, entities: action.entities };
    case 'error': return { ...state, searching: false };
  }
}

type NodeState = { selectedNode: GraphNode | null; loadingNode: boolean };
type NodeAction = { type: 'loading' } | { type: 'loaded'; node: GraphNode } | { type: 'error' };
function nodeReducer(_: NodeState, action: NodeAction): NodeState {
  switch (action.type) {
    case 'loading': return { selectedNode: null, loadingNode: true };
    case 'loaded': return { selectedNode: action.node, loadingNode: false };
    case 'error': return { selectedNode: null, loadingNode: false };
  }
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Tab = 'facts' | 'entities';

export function KnowledgeGraphPage() {
  const [statsState, statsDispatch] = useReducer(statsReducer, { stats: null, statsError: null });
  const [searchState, searchDispatch] = useReducer(searchReducer, {
    searching: false,
    facts: [],
    entities: [],
  });
  const [nodeState, nodeDispatch] = useReducer(nodeReducer, {
    selectedNode: null,
    loadingNode: false,
  });

  const [tab, setTab] = useState<Tab>('facts');
  const [query, setQuery] = useState('');
  const [backfilling, setBackfilling] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load stats on mount
  useEffect(() => {
    fetchKgStats()
      .then((s) => statsDispatch({ type: 'loaded', stats: s }))
      .catch((err: Error) => statsDispatch({ type: 'error', message: err.message }));
  }, []);

  // Debounced search
  const runSearch = useCallback(
    async (q: string, activeTab: Tab) => {
      searchDispatch({ type: 'start' });
      try {
        if (activeTab === 'facts') {
          const items = await fetchKgFacts(q, 50);
          searchDispatch({ type: 'facts', facts: items });
        } else {
          const items = await fetchKgSearch(q, 50);
          searchDispatch({ type: 'entities', entities: items });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Search failed');
        searchDispatch({ type: 'error' });
      }
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(query, tab), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tab, runSearch]);

  async function openNode(name: string) {
    nodeDispatch({ type: 'loading' });
    try {
      const node = await fetchKgNode(name, 30);
      nodeDispatch({ type: 'loaded', node });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load node');
      nodeDispatch({ type: 'error' });
    }
  }

  async function handleBackfill() {
    setBackfilling(true);
    try {
      const result = await triggerKgBackfill();
      toast.success(
        `Backfill complete — ingested ${result.ingested}, skipped ${result.skipped}, failed ${result.failed}`,
      );
      const updated = await fetchKgStats();
      statsDispatch({ type: 'loaded', stats: updated });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-background p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Knowledge Graph</h1>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleBackfill()}
          disabled={backfilling}
          className="gap-1.5"
        >
          <RefreshCw size={14} className={backfilling ? 'animate-spin' : ''} />
          {backfilling ? 'Backfilling…' : 'Run Backfill'}
        </Button>
      </div>

      {/* Stats */}
      {statsState.statsError ? (
        <p className="text-sm text-destructive">{statsState.statsError}</p>
      ) : statsState.stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Entities" value={statsState.stats.entities} />
          <StatCard label="Relations" value={statsState.stats.relations} />
          <StatCard label="Sources" value={statsState.stats.sources} />
          <StatCard label="Evidence" value={statsState.stats.evidence} />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border/50 bg-card p-4 h-[72px] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
        {/* Tabs + search */}
        <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
          <div className="flex items-center rounded-md border border-border/50 p-0.5">
            {(['facts', 'entities'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium capitalize transition-colors',
                  tab === t
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder={tab === 'facts' ? 'Search facts…' : 'Search entities…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {searchState.searching && (
            <Sparkles size={14} className="text-muted-foreground animate-pulse shrink-0" />
          )}
        </div>

        {/* Body — split view if node selected */}
        <div className={cn('flex', nodeState.selectedNode || nodeState.loadingNode ? 'divide-x divide-border/30' : '')}>
          {/* List pane */}
          <div className="flex-1 min-w-0 p-4 overflow-y-auto max-h-[520px]">
            {tab === 'facts' ? (
              searchState.facts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {query ? 'No facts found.' : 'Type a query to search for facts.'}
                </p>
              ) : (
                <div>
                  {searchState.facts.map((f) => (
                    <FactRow
                      key={f.id}
                      fact={f}
                      onSubjectClick={openNode}
                      onObjectClick={openNode}
                    />
                  ))}
                </div>
              )
            ) : searchState.entities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {query ? 'No entities found.' : 'Type a query to search for entities.'}
              </p>
            ) : (
              <div>
                {searchState.entities.map((e) => (
                  <EntityRow key={e.id} entity={e} onClick={(en) => void openNode(en.canonical_name)} />
                ))}
              </div>
            )}
          </div>

          {/* Node detail pane */}
          {(nodeState.selectedNode || nodeState.loadingNode) && (
            <div className="w-[400px] shrink-0 p-4 overflow-y-auto max-h-[520px]">
              {nodeState.loadingNode ? (
                <p className="text-sm text-muted-foreground animate-pulse">Loading node…</p>
              ) : nodeState.selectedNode ? (
                <NodeDetailPanel
                  node={nodeState.selectedNode}
                  onBack={() => nodeDispatch({ type: 'error' })}
                  onEntityClick={(name) => void openNode(name)}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
