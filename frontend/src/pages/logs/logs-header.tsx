import React from 'react';
import { Search, RefreshCw, Download, Filter, ChevronDown, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { LogLevel, LogsFilters } from './logs-types';

const LEVEL_COLORS: Record<LogLevel, { text: string; bg: string; border: string }> = {
  trace: { text: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20' },
  debug: { text: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  info: { text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  warn: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  error: { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
  fatal: { text: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20' },
};

interface LogsHeaderProps {
  loading: boolean;
  onRefresh: () => void;
  onExport: () => void;
  filters: LogsFilters;
  onFilterChange: (patch: Partial<LogsFilters>) => void;
}

export function LogsHeader({
  loading,
  onRefresh,
  onExport,
  filters,
  onFilterChange,
}: LogsHeaderProps) {
  const activeLevelCount = Object.values(filters.levels).filter(Boolean).length;
  const isAllLevelsEnabled = activeLevelCount === Object.keys(filters.levels).length;

  return (
    <div className="flex flex-col border-b border-border/40 bg-background/50 backdrop-blur-md sticky top-0 z-10 shrink-0">
      <div className="h-16 flex items-center justify-between px-6 gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-2xl">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              value={filters.query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onFilterChange({ query: e.target.value })
              }
              placeholder="Search in log messages, subsystems..."
              className="pl-10 h-10 bg-muted/30 border-border/40 hover:bg-muted/50 focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-all rounded-lg"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-10 px-4 gap-2 border-border/40 hover:bg-muted/50 rounded-lg',
                  !isAllLevelsEnabled &&
                    'bg-primary/5 border-primary/20 text-primary hover:bg-primary/10',
                )}
              >
                <Filter className="w-4 h-4" />
                <span>Levels</span>
                {!isAllLevelsEnabled && (
                  <Badge
                    variant="secondary"
                    className="h-5 px-1 min-w-[20px] bg-primary/20 text-primary border-none text-[10px]"
                  >
                    {activeLevelCount}
                  </Badge>
                )}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-48 p-1 bg-popover/95 backdrop-blur-md border-border/40 shadow-2xl rounded-xl"
            >
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground px-2 py-1.5">
                Filter Levels
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border/40" />
              {(Object.keys(filters.levels) as LogLevel[]).map((level) => (
                <DropdownMenuCheckboxItem
                  key={level}
                  checked={filters.levels[level]}
                  onCheckedChange={(checked: boolean) =>
                    onFilterChange({
                      levels: { ...filters.levels, [level]: checked },
                    })
                  }
                  className="capitalize text-xs font-medium focus:bg-primary/10"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full',
                        LEVEL_COLORS[level].bg.replace('bg-', 'bg-').replace('/10', ''),
                      )}
                    />
                    {level}
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator className="bg-border/40" />
              <div
                className="flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-primary/10 transition-colors rounded-lg group"
                onClick={() => {
                  const allOn = Object.keys(filters.levels).reduce(
                    (acc, l) => ({ ...acc, [l]: true }),
                    {},
                  );
                  onFilterChange({ levels: allOn as Record<LogLevel, boolean> });
                }}
              >
                <span className="text-[10px] uppercase font-bold text-primary tracking-wider">
                  Enable All
                </span>
                <Check className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border border-border/40 rounded-lg">
            <Switch
              id="auto-follow"
              checked={filters.autoFollow}
              onCheckedChange={(checked: boolean) => onFilterChange({ autoFollow: checked })}
              className="data-[state=checked]:bg-primary"
            />
            <Label
              htmlFor="auto-follow"
              className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground cursor-pointer select-none"
            >
              Auto-follow
            </Label>
          </div>

          <Separator orientation="vertical" className="h-8 bg-border/40" />

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={loading}
              className="h-10 w-10 border-border/40 hover:bg-muted/50 rounded-lg text-muted-foreground hover:text-foreground transition-all shrink-0"
              title="Refresh logs"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              className="h-10 px-4 gap-2 border-border/40 hover:bg-muted/50 rounded-lg text-muted-foreground hover:text-foreground transition-all"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
