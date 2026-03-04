import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  BrainIcon,
  SearchIcon,
  PlusIcon,
  Trash2Icon,
  ToggleLeftIcon,
  ToggleRightIcon,
} from 'lucide-react';
import type {
  AgentMemoryEntry,
  AgentRuntimeData,
  MemoryEntryType,
  MemoryImportance,
} from './agent-types';

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const TYPE_META: Record<
  MemoryEntryType,
  { label: string; color: string; bg: string; border: string }
> = {
  fact: {
    label: 'Fact',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
  },
  instruction: {
    label: 'Instruction',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
  },
  preference: {
    label: 'Preference',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
  context: {
    label: 'Context',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
};

const IMPORTANCE_META: Record<MemoryImportance, { label: string; dot: string }> = {
  critical: { label: 'Critical', dot: 'bg-red-500' },
  high: { label: 'High', dot: 'bg-orange-400' },
  medium: { label: 'Medium', dot: 'bg-yellow-400' },
  low: { label: 'Low', dot: 'bg-slate-400' },
};

const ALL_TYPES: MemoryEntryType[] = ['fact', 'instruction', 'preference', 'context'];
const ALL_IMPORTANCE: MemoryImportance[] = ['critical', 'high', 'medium', 'low'];

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

type AgentMemoryPanelProps = {
  runtime: AgentRuntimeData;
};

type NewEntryDraft = {
  content: string;
  type: MemoryEntryType;
  importance: MemoryImportance;
  tag: string;
};

const BLANK_DRAFT: NewEntryDraft = {
  content: '',
  type: 'fact',
  importance: 'medium',
  tag: '',
};

export function AgentMemoryPanel({ runtime }: AgentMemoryPanelProps) {
  const [entries, setEntries] = useState<AgentMemoryEntry[]>([...runtime.memory]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<MemoryEntryType | 'all'>('all');
  const [showNew, setShowNew] = useState(false);
  const [newDraft, setNewDraft] = useState<NewEntryDraft>({ ...BLANK_DRAFT });

  // Derived stats
  const stats = useMemo(
    () => ({
      total: entries.length,
      active: entries.filter((e) => e.active).length,
      byType: ALL_TYPES.map((t) => ({
        type: t,
        count: entries.filter((e) => e.type === t).length,
      })),
    }),
    [entries],
  );

  // Filtered list
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (
        term &&
        !e.content.toLowerCase().includes(term) &&
        !(e.tag ?? '').toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [entries, search, typeFilter]);

  function toggleActive(id: string) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, active: !e.active } : e)));
  }

  function deleteEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function addEntry() {
    const trimmed = newDraft.content.trim();
    if (!trimmed) return;
    const entry: AgentMemoryEntry = {
      id: `m${Date.now()}`,
      content: trimmed,
      type: newDraft.type,
      importance: newDraft.importance,
      tag: newDraft.tag.trim() || undefined,
      createdAt: new Date().toISOString().slice(0, 10),
      active: true,
    };
    setEntries((prev) => [entry, ...prev]);
    setNewDraft({ ...BLANK_DRAFT });
    setShowNew(false);
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="sm:col-span-1 rounded-lg border border-border/50 bg-card p-3 flex flex-col gap-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <BrainIcon className="w-3 h-3" />
            Total
          </p>
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">{stats.active} active</p>
        </div>
        {stats.byType.map(({ type, count }) => {
          const meta = TYPE_META[type];
          return (
            <div
              key={type}
              className={`rounded-lg border p-3 flex flex-col gap-1 cursor-pointer transition-all ${
                typeFilter === type
                  ? `${meta.bg} ${meta.border}`
                  : 'border-border/50 bg-card hover:bg-muted/30'
              }`}
              onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
            >
              <p className={`text-xs font-semibold uppercase tracking-widest ${meta.color}`}>
                {meta.label}
              </p>
              <p className="text-2xl font-bold">{count}</p>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories…"
            className="pl-8 h-9 bg-background/50 border-border/40 text-sm"
          />
        </div>

        {/* Type Filter Pills */}
        <div className="flex bg-muted/40 p-1 rounded-md gap-0.5">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1 text-xs font-medium rounded transition-all ${
              typeFilter === 'all'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          {ALL_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
              className={`px-3 py-1 text-xs font-medium rounded capitalize transition-all ${
                typeFilter === t
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {TYPE_META[t].label}
            </button>
          ))}
        </div>

        <Button
          size="sm"
          className="h-9 text-xs gap-1.5 ml-auto"
          onClick={() => setShowNew((v) => !v)}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Add Memory
        </Button>
      </div>

      {/* New Entry Form */}
      {showNew && (
        <Card className="bg-card border-primary/20 shadow-lg shadow-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Memory Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={newDraft.content}
              onChange={(e) => setNewDraft((d) => ({ ...d, content: e.target.value }))}
              placeholder="What should the agent remember?"
              className="min-h-[80px] text-sm bg-background/50 border-border/40 resize-none"
              autoFocus
            />
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Type
                </label>
                <select
                  value={newDraft.type}
                  onChange={(e) =>
                    setNewDraft((d) => ({ ...d, type: e.target.value as MemoryEntryType }))
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {ALL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_META[t].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Importance
                </label>
                <select
                  value={newDraft.importance}
                  onChange={(e) =>
                    setNewDraft((d) => ({
                      ...d,
                      importance: e.target.value as MemoryImportance,
                    }))
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {ALL_IMPORTANCE.map((imp) => (
                    <option key={imp} value={imp}>
                      {IMPORTANCE_META[imp].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Tag (optional)
                </label>
                <Input
                  value={newDraft.tag}
                  onChange={(e) => setNewDraft((d) => ({ ...d, tag: e.target.value }))}
                  placeholder="e.g. project, workflow"
                  className="h-8 text-sm bg-background/50 border-border/40"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setShowNew(false);
                  setNewDraft({ ...BLANK_DRAFT });
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!newDraft.content.trim()}
                onClick={addEntry}
              >
                Save Memory
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Memory Entries List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BrainIcon className="w-8 h-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {entries.length === 0
                ? 'No memories yet. Add the first one.'
                : 'No memories match your filters.'}
            </p>
          </div>
        ) : (
          filtered.map((entry) => {
            const typeMeta = TYPE_META[entry.type];
            const importanceMeta = IMPORTANCE_META[entry.importance];
            return (
              <div
                key={entry.id}
                className={`group flex gap-3 items-start rounded-lg border p-4 transition-all ${
                  entry.active
                    ? 'border-border/50 bg-card hover:bg-muted/20'
                    : 'border-border/30 bg-muted/10 opacity-50'
                }`}
              >
                {/* Importance dot */}
                <div className="flex flex-col items-center gap-1 pt-1 flex-shrink-0">
                  <div
                    className={`w-2 h-2 rounded-full ${importanceMeta.dot}`}
                    title={`Importance: ${importanceMeta.label}`}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-sm text-foreground leading-relaxed">{entry.content}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Type badge */}
                    <span
                      className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${typeMeta.bg} ${typeMeta.color} ${typeMeta.border}`}
                    >
                      {typeMeta.label}
                    </span>
                    {/* Tag */}
                    {entry.tag && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 px-1.5 border-border/40 bg-muted/30"
                      >
                        #{entry.tag}
                      </Badge>
                    )}
                    {/* Date */}
                    <span className="text-[10px] text-muted-foreground">{entry.createdAt}</span>
                    {/* Inactive label */}
                    {!entry.active && (
                      <span className="text-[10px] text-muted-foreground italic">inactive</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={() => toggleActive(entry.id)}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                    title={entry.active ? 'Deactivate' : 'Activate'}
                  >
                    {entry.active ? (
                      <ToggleRightIcon className="w-4 h-4 text-primary" />
                    ) : (
                      <ToggleLeftIcon className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete memory"
                  >
                    <Trash2Icon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
