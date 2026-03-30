import { useEffect, useReducer, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { addPolicyRule, getPolicyRules } from '@/lib/guardrail-api';
import type { ActionCategory, CategoryRules, PolicyRulesResponse, RuleType } from '@/lib/guardrail-api';

const CATEGORY_LABELS: Record<ActionCategory, string> = {
  bash: 'Bash',
  network: 'Network',
  fs_read: 'File Read',
  fs_write: 'File Write',
};

const ALL_CATEGORIES: ActionCategory[] = ['bash', 'network', 'fs_read', 'fs_write'];

type LoadState<T> = { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; error: string };
type LoadAction<T> = { type: 'start' } | { type: 'success'; data: T } | { type: 'error'; error: string };

function loadReducer<T>(state: LoadState<T>, action: LoadAction<T>): LoadState<T> {
  switch (action.type) {
    case 'start': return { status: 'loading' };
    case 'success': return { status: 'success', data: action.data };
    case 'error': return { status: 'error', error: action.error };
  }
}

interface CategoryRulesRowProps {
  category: ActionCategory;
  rules: CategoryRules | undefined;
  ruleType: RuleType;
  agentId: string;
  onPatternAdded: (category: ActionCategory, pattern: string) => void;
}

function CategoryRulesRow({ category, rules, ruleType, agentId, onPatternAdded }: CategoryRulesRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const pattern = inputRef.current?.value.trim();
    if (!pattern) return;
    setAdding(true);
    try {
      await addPolicyRule(agentId, ruleType, category, pattern);
      onPatternAdded(category, pattern);
      if (inputRef.current) inputRef.current.value = '';
    } catch {
      // Backend not yet implemented — silently ignore
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {CATEGORY_LABELS[category]}
        </Badge>
      </div>

      {rules && rules.patterns.length > 0 ? (
        <ul className="space-y-1 pl-2">
          {rules.patterns.map((p) => (
            <li key={p} className="text-xs font-mono bg-muted/50 rounded px-2 py-1">
              {p}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground pl-2">No patterns defined.</p>
      )}

      {/* Add pattern row */}
      <div className="flex gap-2 pl-2">
        <Input
          ref={inputRef}
          className="h-7 text-xs"
          placeholder="glob pattern, e.g. /tmp/**"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={adding}>
          Add
        </Button>
      </div>
    </div>
  );
}

interface PolicyRulesEditorProps {
  agentId: string;
}

export function PolicyRulesEditor({ agentId }: PolicyRulesEditorProps) {
  const [state, dispatch] = useReducer(
    loadReducer<PolicyRulesResponse>,
    { status: 'loading' },
  );

  useEffect(() => {
    if (!agentId) return;
    dispatch({ type: 'start' });
    getPolicyRules(agentId)
      .then((data) => dispatch({ type: 'success', data }))
      .catch(() => dispatch({ type: 'error', error: 'Policy rules are not yet available.' }));
  }, [agentId]);

  function handlePatternAdded(ruleType: RuleType, category: ActionCategory, pattern: string) {
    if (state.status !== 'success') return;
    const prev = state.data;
    const updateList = (list: CategoryRules[]) => {
      const existing = list.find((r) => r.category === category);
      if (existing) {
        return list.map((r) =>
          r.category === category ? { ...r, patterns: [...r.patterns, pattern] } : r
        );
      }
      return [...list, { category, patterns: [pattern] }];
    };
    const updated = ruleType === 'deny'
      ? { ...prev, deny_rules: updateList(prev.deny_rules) }
      : { ...prev, allow_rules: updateList(prev.allow_rules) };
    dispatch({ type: 'success', data: updated });
  }

  function getRulesFor(list: CategoryRules[], category: ActionCategory) {
    return list.find((r) => r.category === category);
  }

  return (
    <Card className="bg-card border-border/70">
      <CardHeader>
        <CardTitle className="text-base">Policy Rules</CardTitle>
        <p className="text-sm text-muted-foreground">
          Define patterns that are always denied or always allowed, bypassing trust-level checks.
        </p>
      </CardHeader>
      <CardContent>
        {state.status === 'loading' && (
          <p className="text-sm text-muted-foreground animate-pulse">Loading policy rules…</p>
        )}
        {state.status === 'error' && (
          <p className="text-sm text-muted-foreground">{state.error}</p>
        )}
        {state.status === 'success' && (
          <Tabs defaultValue="deny">
            <TabsList className="mb-4">
              <TabsTrigger value="deny">Always Deny</TabsTrigger>
              <TabsTrigger value="allow">Always Allow</TabsTrigger>
            </TabsList>

            <TabsContent value="deny" className="space-y-4">
              {ALL_CATEGORIES.map((category) => (
                <CategoryRulesRow
                  key={category}
                  category={category}
                  rules={getRulesFor(state.data.deny_rules, category)}
                  ruleType="deny"
                  agentId={agentId}
                  onPatternAdded={(cat, pat) => handlePatternAdded('deny', cat, pat)}
                />
              ))}
            </TabsContent>

            <TabsContent value="allow" className="space-y-4">
              {ALL_CATEGORIES.map((category) => (
                <CategoryRulesRow
                  key={category}
                  category={category}
                  rules={getRulesFor(state.data.allow_rules, category)}
                  ruleType="allow"
                  agentId={agentId}
                  onPatternAdded={(cat, pat) => handlePatternAdded('allow', cat, pat)}
                />
              ))}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
