import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchUsageMetrics } from '@/lib/api';
import type { UsageAggregateKey, UsageMetricRow } from '@/lib/types';
import { formatCost } from '@/lib/model-prices';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Build a cost-per-key map from raw items. `getKey` extracts the grouping key from each row. */
function buildCostMap(items: UsageMetricRow[], getKey: (r: UsageMetricRow) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    map.set(key, (map.get(key) ?? 0) + item.totalCost);
  }
  return map;
}

function UsageTable({
  title,
  rows,
  totalTokens,
  costMap,
}: {
  title: string;
  rows: UsageAggregateKey[];
  totalTokens: number;
  costMap: Map<string, number>;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          {title}
        </h4>
        <p className="text-xs text-muted-foreground">No data yet.</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="rounded-lg border border-border/40 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Requests</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Prompt</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Completion</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cost</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const share = totalTokens > 0 ? (row.totals.totalTokens / totalTokens) * 100 : 0;
              const cost = costMap.get(row.key) ?? 0;
              return (
                <tr
                  key={row.key}
                  className={`${i < rows.length - 1 ? 'border-b border-border/20' : ''} hover:bg-muted/20`}
                >
                  <td className="px-3 py-2 font-mono text-foreground">{row.key}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {row.totals.rowCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatTokens(row.totals.promptTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatTokens(row.totals.completionTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                    {formatTokens(row.totals.totalTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-primary">
                    {cost > 0 ? formatCost(cost) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/60"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground tabular-nums w-8 text-right">
                        {share.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MetricsProviderUsage() {
  const [byProvider, setByProvider] = useState<UsageAggregateKey[]>([]);
  const [byModel, setByModel] = useState<UsageAggregateKey[]>([]);
  const [providerCostMap, setProviderCostMap] = useState<Map<string, number>>(new Map());
  const [modelCostMap, setModelCostMap] = useState<Map<string, number>>(new Map());
  const [totalTokens, setTotalTokens] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsageMetrics();
      // Sort by total tokens descending
      const sortedProviders = [...data.aggregates.byProvider].sort(
        (a, b) => b.totals.totalTokens - a.totals.totalTokens,
      );
      const sortedModels = [...data.aggregates.byModel].sort(
        (a, b) => b.totals.totalTokens - a.totals.totalTokens,
      );
      setByProvider(sortedProviders);
      setByModel(sortedModels);
      setTotalTokens(data.aggregates.totals.totalTokens);
      // Build cost maps from raw items (they carry both provider and model)
      setProviderCostMap(buildCostMap(data.items, (r) => r.provider));
      setModelCostMap(buildCostMap(data.items, (r) => r.model));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="rounded-xl border border-border/40 bg-card/50 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-foreground">Usage by Provider & Model</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Token consumption across all time.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={load}
          disabled={loading}
          className="gap-1.5 shrink-0 h-8"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {!loading && !error && totalTokens === 0 && (
        <p className="text-xs text-muted-foreground">
          No usage recorded yet. Start a conversation to see stats here.
        </p>
      )}

      {totalTokens > 0 && (
        <>
          <UsageTable title="By Provider" rows={byProvider} totalTokens={totalTokens} costMap={providerCostMap} />
          <UsageTable title="By Model" rows={byModel} totalTokens={totalTokens} costMap={modelCostMap} />
        </>
      )}
    </div>
  );
}
