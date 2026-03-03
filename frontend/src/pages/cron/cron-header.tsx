import React from 'react';
import { CalendarIcon, RefreshCcw, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CronHeaderProps {
  loading: boolean;
  onRefresh: () => void;
  onNewJob: () => void;
  query: string;
  onQueryChange: (q: string) => void;
}

export function CronHeader({
  loading,
  onRefresh,
  onNewJob,
  query,
  onQueryChange,
}: CronHeaderProps) {
  return (
    <div className="flex flex-col border-b border-border bg-card">
      {/* Primary Actions Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          {/* We could add generic filters here later (e.g., date range) */}
          <div className="hidden md:flex items-center gap-1.5 opacity-60">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded">
              Management
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-2 text-xs font-semibold px-3"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            className="h-8 gap-2 text-xs font-semibold px-4 shadow-lg shadow-primary/10"
            onClick={onNewJob}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            New Job
          </Button>
        </div>
      </div>

      {/* Search Filter Row */}
      <div className="flex flex-wrap gap-3 px-4 pb-2.5 pt-2">
        <div className="flex-1 min-w-[200px] relative group">
          <SearchIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            className="pl-8 h-9 bg-background/50 text-[13px] border-border/40 focus:border-primary/40 focus:ring-primary/10 transition-all rounded-lg"
            placeholder="Search jobs, agents or schedule..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
