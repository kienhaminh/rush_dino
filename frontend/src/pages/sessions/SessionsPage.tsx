import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquareIcon,
  SearchIcon,
  DownloadIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type SessionsListResult = any;

export type SessionsProps = {
  loading: boolean;
  result: SessionsListResult | null;
  error: string | null;
  activeMinutes: string;
  limit: string;
  includeGlobal: boolean;
  includeUnknown: boolean;
  basePath: string;
  onFiltersChange: (next: {
    activeMinutes: string;
    limit: string;
    includeGlobal: boolean;
    includeUnknown: boolean;
  }) => void;
  onRefresh: () => void;
  onPatch: (
    key: string,
    patch: {
      label?: string | null;
      thinkingLevel?: string | null;
      verboseLevel?: string | null;
      reasoningLevel?: string | null;
    },
  ) => void;
  onDelete: (key: string) => void;
};

const THINK_LEVELS = ['', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh'];
const VERBOSE_LEVELS = [
  { value: '', label: 'inherit' },
  { value: 'off', label: 'off (explicit)' },
  { value: 'on', label: 'on' },
  { value: 'full', label: 'full' },
];
const REASONING_LEVELS = ['', 'off', 'on', 'stream'];

export function SessionsPage(props: SessionsProps) {
  const rows = props.result?.sessions ?? [];
  const [search, setSearch] = useState('');

  const filteredRows = search
    ? rows.filter(
        (r: any) =>
          r.key?.includes(search) || r.label?.includes(search) || r.displayName?.includes(search),
      )
    : rows;

  return (
    <div className="flex flex-col h-full bg-background min-h-[calc(100vh-72px)] p-6 md:p-8 overflow-y-auto w-full">
      <div className="w-full space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end pb-2 gap-4">
          <div>
            <p className="text-muted-foreground mt-2 text-sm max-w-xl">
              Store: <span className="font-mono text-xs">{props.result?.path || 'N/A'}</span>
            </p>
          </div>
          <button
            disabled={props.loading}
            onClick={props.onRefresh}
            className="flex items-center gap-2 text-xs font-medium bg-background border border-border hover:bg-secondary transition-colors h-9 px-4 rounded disabled:opacity-50"
          >
            <RefreshCwIcon className={`w-4 h-4 ${props.loading ? 'animate-spin' : ''}`} />
            {props.loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {props.error && (
          <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-md text-sm">
            {props.error}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-lg border border-border/50">
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter listed sessions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background border-border h-9"
            />
          </div>

          <div className="flex flex-col gap-1.5 w-[120px]">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Active Within
            </label>
            <Input
              className="h-9"
              value={props.activeMinutes}
              onChange={(e) =>
                props.onFiltersChange({
                  activeMinutes: e.target.value,
                  limit: props.limit,
                  includeGlobal: props.includeGlobal,
                  includeUnknown: props.includeUnknown,
                })
              }
            />
          </div>

          <div className="flex flex-col gap-1.5 w-[100px]">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Limit
            </label>
            <Input
              className="h-9"
              value={props.limit}
              onChange={(e) =>
                props.onFiltersChange({
                  activeMinutes: props.activeMinutes,
                  limit: e.target.value,
                  includeGlobal: props.includeGlobal,
                  includeUnknown: props.includeUnknown,
                })
              }
            />
          </div>

          <div className="flex gap-4 items-center h-9 px-2">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={props.includeGlobal}
                onChange={(e) =>
                  props.onFiltersChange({
                    activeMinutes: props.activeMinutes,
                    limit: props.limit,
                    includeGlobal: e.target.checked,
                    includeUnknown: props.includeUnknown,
                  })
                }
                className="rounded border-border bg-background"
              />
              Global
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={props.includeUnknown}
                onChange={(e) =>
                  props.onFiltersChange({
                    activeMinutes: props.activeMinutes,
                    limit: props.limit,
                    includeGlobal: props.includeGlobal,
                    includeUnknown: e.target.checked,
                  })
                }
                className="rounded border-border bg-background"
              />
              Unknown
            </label>
          </div>
        </div>

        {/* Sessions Table */}
        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium uppercase tracking-wider">Session Key</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wider">Label</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wider">Kind</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wider">Tokens</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wider">Thinking</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wider">Verbose</th>
                  <th className="px-4 py-3 font-medium uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      No sessions found matching current filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row: any) => {
                    const isGlobal = row.kind === 'global';
                    return (
                      <tr key={row.key} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-col">
                            {isGlobal ? (
                              <span className="font-mono text-foreground font-medium">
                                {row.key}
                              </span>
                            ) : (
                              <a
                                href={`${props.basePath}?session=${encodeURIComponent(row.key)}`}
                                className="font-mono text-primary hover:underline font-medium"
                              >
                                {row.key}
                              </a>
                            )}
                            {row.displayName && row.displayName !== row.key && (
                              <span className="text-xs text-muted-foreground mt-1">
                                {row.displayName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <Input
                            className="h-8 text-xs bg-background max-w-[150px]"
                            placeholder="(optional label)"
                            defaultValue={row.label || ''}
                            disabled={props.loading}
                            onBlur={(e) => {
                              if (e.target.value !== (row.label || '')) {
                                props.onPatch(row.key, { label: e.target.value || null });
                              }
                            }}
                          />
                        </td>
                        <td className="px-4 py-4 align-top">
                          <Badge
                            variant="outline"
                            className="capitalize text-[10px] bg-background/50"
                          >
                            {row.kind}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 align-top font-mono text-xs text-muted-foreground">
                          {row.tokens || '0'}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <Select
                            disabled={props.loading}
                            value={row.thinkingLevel || ''}
                            onValueChange={(val) =>
                              props.onPatch(row.key, { thinkingLevel: val || null })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs w-[110px]">
                              <SelectValue placeholder="Inherit" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">Inherit</SelectItem>
                              {THINK_LEVELS.filter(Boolean).map((l) => (
                                <SelectItem key={l} value={l} className="capitalize">
                                  {l}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <Select
                            disabled={props.loading}
                            value={row.verboseLevel || ''}
                            onValueChange={(val) =>
                              props.onPatch(row.key, { verboseLevel: val || null })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs w-[110px]">
                              <SelectValue placeholder="Inherit" />
                            </SelectTrigger>
                            <SelectContent>
                              {VERBOSE_LEVELS.map((l) => (
                                <SelectItem key={l.value} value={l.value || 'inherit'}>
                                  {l.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <button
                            disabled={props.loading}
                            onClick={() => props.onDelete(row.key)}
                            className="p-2 text-destructive hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-50"
                            title="Delete Session"
                          >
                            <Trash2Icon className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default SessionsPage;
