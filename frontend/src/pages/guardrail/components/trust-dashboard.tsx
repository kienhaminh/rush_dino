import { useEffect, useReducer, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getTrustLevels, setTrustLevel } from '@/lib/guardrail-api';
import type { ActionCategory, CategoryTrustInfo, TrustLevel } from '@/lib/guardrail-api';

const CATEGORY_LABELS: Record<ActionCategory, string> = {
  bash: 'Bash',
  network: 'Network',
  fs_read: 'File Read',
  fs_write: 'File Write',
};

const TRUST_LEVEL_LABELS: Record<TrustLevel, string> = {
  untrusted: 'L0 Untrusted',
  supervised: 'L1 Supervised',
  trusted: 'L2 Trusted',
};

const TRUST_LEVEL_VARIANTS: Record<TrustLevel, 'destructive' | 'secondary' | 'default'> = {
  untrusted: 'destructive',
  supervised: 'secondary',
  trusted: 'default',
};

interface TrustCategoryCardProps {
  info: CategoryTrustInfo;
  agentId: string;
  onLevelChange: (category: ActionCategory, level: TrustLevel) => void;
}

function TrustCategoryCard({ info, agentId, onLevelChange }: TrustCategoryCardProps) {
  const [changing, setChanging] = useState(false);

  async function handleChange(value: string) {
    const level = value as TrustLevel;
    setChanging(true);
    try {
      await setTrustLevel(agentId, info.category, level);
      onLevelChange(info.category, level);
    } catch {
      // Silently ignore — backend not yet implemented
    } finally {
      setChanging(false);
    }
  }

  return (
    <div className="rounded-md border border-border/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{CATEGORY_LABELS[info.category]}</span>
        <Badge variant={TRUST_LEVEL_VARIANTS[info.level]}>
          {TRUST_LEVEL_LABELS[info.level]}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground">
        Consecutive approvals: <span className="font-medium text-foreground">{info.consecutive_approvals}</span>
      </div>

      {info.approved_patterns.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Approved patterns:</p>
          <ul className="space-y-0.5">
            {info.approved_patterns.map((pattern) => (
              <li key={pattern} className="text-xs font-mono bg-muted/50 rounded px-2 py-0.5">
                {pattern}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Override:</span>
        <Select
          value={info.level}
          onValueChange={handleChange}
          disabled={changing}
        >
          <SelectTrigger className="h-7 text-xs w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="untrusted">L0 Untrusted</SelectItem>
            <SelectItem value="supervised">L1 Supervised</SelectItem>
            <SelectItem value="trusted">L2 Trusted</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

type LoadState<T> = { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; error: string };
type LoadAction<T> =
  | { type: 'start' }
  | { type: 'success'; data: T }
  | { type: 'error'; error: string }
  | { type: 'update'; data: T };

function loadReducer<T>(state: LoadState<T>, action: LoadAction<T>): LoadState<T> {
  switch (action.type) {
    case 'start': return { status: 'loading' };
    case 'success': return { status: 'success', data: action.data };
    case 'update': return { status: 'success', data: action.data };
    case 'error': return { status: 'error', error: action.error };
  }
}

interface TrustDashboardProps {
  agentId: string;
}

export function TrustDashboard({ agentId }: TrustDashboardProps) {
  const [state, dispatch] = useReducer(
    loadReducer<CategoryTrustInfo[]>,
    { status: 'loading' },
  );

  useEffect(() => {
    if (!agentId) return;
    dispatch({ type: 'start' });
    getTrustLevels(agentId)
      .then((res) => dispatch({ type: 'success', data: res.trust_levels }))
      .catch(() => dispatch({ type: 'error', error: 'Trust level data is not yet available.' }));
  }, [agentId]);

  function handleLevelChange(category: ActionCategory, level: TrustLevel) {
    if (state.status === 'success') {
      dispatch({
        type: 'update',
        data: state.data.map((info) => (info.category === category ? { ...info, level } : info)),
      });
    }
  }

  return (
    <Card className="bg-card border-border/70">
      <CardHeader>
        <CardTitle className="text-base">Trust Levels</CardTitle>
        <p className="text-sm text-muted-foreground">
          Per-category trust for agent actions. Higher trust means fewer approval prompts.
        </p>
      </CardHeader>
      <CardContent>
        {state.status === 'loading' && (
          <p className="text-sm text-muted-foreground animate-pulse">Loading trust levels…</p>
        )}
        {state.status === 'error' && (
          <p className="text-sm text-muted-foreground">{state.error}</p>
        )}
        {state.status === 'success' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {state.data.map((info) => (
              <TrustCategoryCard
                key={info.category}
                info={info}
                agentId={agentId}
                onLevelChange={handleLevelChange}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
