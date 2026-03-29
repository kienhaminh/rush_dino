import { useEffect, useState } from 'react';
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

interface TrustDashboardProps {
  agentId: string;
}

export function TrustDashboard({ agentId }: TrustDashboardProps) {
  const [trustLevels, setTrustLevels] = useState<CategoryTrustInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    getTrustLevels(agentId)
      .then((res) => setTrustLevels(res.trust_levels))
      .catch(() => setError('Trust level data is not yet available.'))
      .finally(() => setLoading(false));
  }, [agentId]);

  function handleLevelChange(category: ActionCategory, level: TrustLevel) {
    setTrustLevels((prev) =>
      prev
        ? prev.map((info) => (info.category === category ? { ...info, level } : info))
        : prev
    );
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
        {loading && (
          <p className="text-sm text-muted-foreground animate-pulse">Loading trust levels…</p>
        )}
        {error && (
          <p className="text-sm text-muted-foreground">{error}</p>
        )}
        {!loading && !error && trustLevels && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {trustLevels.map((info) => (
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
