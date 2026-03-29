import { useCallback, useEffect, useRef, useState } from 'react';
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
// Main page
// ---------------------------------------------------------------------------

type Tab = 'facts' | 'entities';

export function KnowledgeGraphPage() {
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('facts');
  const [query, setQuery] = useState('');
  const [facts, setFacts] = useState<GraphFact[]>([]);
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loadingNode, setLoadingNode] = useState(false);

  const [backfilling, setBackfilling] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load stats on mount
  useEffect(() => {
    fetchKgStats()
      .then(setStats)
      .catch((err: Error) => setStatsError(err.message));
  }, []);

  // Debounced search
  const runSearch = useCallback(
    async (q: string, activeTab: Tab) => {
      setSearching(true);
      try {
        if (activeTab === 'facts') {
          const items = await fetchKgFacts(q, 50);
          setFacts(items);
        } else {
          const items = await fetchKgSearch(q, 50);
          setEntities(items);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setSearching(false);
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
    setLoadingNode(true);
    setSelectedNode(null);
    try {
      const node = await fetchKgNode(name, 30);
      setSelectedNode(node);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load node');
    } finally {
      setLoadingNode(false);
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
      setStats(updated);
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
      {statsError ? (
        <p className="text-sm text-destructive">{statsError}</p>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Entities" value={stats.entities} />
          <StatCard label="Relations" value={stats.relations} />
          <StatCard label="Sources" value={stats.sources} />
          <StatCard label="Evidence" value={stats.evidence} />
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
          {searching && (
            <Sparkles size={14} className="text-muted-foreground animate-pulse shrink-0" />
          )}
        </div>

        {/* Body — split view if node selected */}
        <div className={cn('flex', selectedNode || loadingNode ? 'divide-x divide-border/30' : '')}>
          {/* List pane */}
          <div className="flex-1 min-w-0 p-4 overflow-y-auto max-h-[520px]">
            {tab === 'facts' ? (
              facts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {query ? 'No facts found.' : 'Type a query to search for facts.'}
                </p>
              ) : (
                <div>
                  {facts.map((f) => (
                    <FactRow
                      key={f.id}
                      fact={f}
                      onSubjectClick={openNode}
                      onObjectClick={openNode}
                    />
                  ))}
                </div>
              )
            ) : entities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {query ? 'No entities found.' : 'Type a query to search for entities.'}
              </p>
            ) : (
              <div>
                {entities.map((e) => (
                  <EntityRow key={e.id} entity={e} onClick={(en) => void openNode(en.canonical_name)} />
                ))}
              </div>
            )}
          </div>

          {/* Node detail pane */}
          {(selectedNode || loadingNode) && (
            <div className="w-[400px] shrink-0 p-4 overflow-y-auto max-h-[520px]">
              {loadingNode ? (
                <p className="text-sm text-muted-foreground animate-pulse">Loading node…</p>
              ) : selectedNode ? (
                <NodeDetailPanel
                  node={selectedNode}
                  onBack={() => setSelectedNode(null)}
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
