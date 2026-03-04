import React, { useState, useMemo, useEffect } from 'react';
import { LogsHeader } from './logs-header';
import { LogsStream } from './logs-stream';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollText, ShieldAlert, History } from 'lucide-react';
import type { LogEntry, LogLevel, LogsFilters } from './logs-types';
import { fetchLogs } from '@/lib/api';

const LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

function asLogLevel(level: string): LogLevel {
  if (LEVELS.includes(level as LogLevel)) {
    return level as LogLevel;
  }
  return 'info';
}

function mapRecord(record: {
  id: string;
  level: string;
  target: string;
  message: string;
  fields?: Record<string, unknown> | null;
  createdAt: string;
}): LogEntry {
  const date = new Date(record.createdAt);
  const time = Number.isNaN(date.getTime())
    ? record.createdAt
    : date.toLocaleTimeString([], { hour12: false });
  return {
    id: record.id,
    time,
    level: asLogLevel(record.level),
    subsystem: record.target,
    message: record.message,
    raw: JSON.stringify({
      time: record.createdAt,
      level: record.level,
      target: record.target,
      message: record.message,
      fields: record.fields ?? null,
    }),
  };
}

export function LogsPage() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<LogsFilters>({
    query: '',
    levels: {
      trace: true,
      debug: true,
      info: true,
      warn: true,
      error: true,
      fatal: true,
    },
    autoFollow: true,
  });

  const [activeTab, setActiveTab] = useState('live');

  const levelFilter = useMemo(
    () => LEVELS.filter((level) => filters.levels[level]),
    [filters.levels],
  );

  const loadLogs = async () => {
    setLoading(true);
    try {
      const response = await fetchLogs({
        level: levelFilter,
        q: filters.query || undefined,
        limit: 300,
      });
      setLogs(response.items.map(mapRecord));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
    const timer = setInterval(() => {
      void loadLogs();
    }, 2000);
    return () => clearInterval(timer);
  }, [filters.query, levelFilter.join(',')]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (!filters.levels[log.level]) return false;
      if (!filters.query) return true;
      const q = filters.query.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        (log.subsystem?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [logs, filters]);

  const handleExport = () => {
    const blob = new Blob([filteredLogs.map((l) => l.raw).join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rush-dino-logs-${new Date().toISOString()}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-background overflow-hidden">
      <LogsHeader
        loading={loading}
        onRefresh={() => void loadLogs()}
        onExport={handleExport}
        filters={filters}
        onFilterChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
      />

      {error ? (
        <div className="px-6 py-3 text-sm text-rose-500 border-b border-border/40">{error}</div>
      ) : null}

      <div className="flex-1 overflow-hidden relative flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="flex items-center overflow-x-auto border-b border-border bg-card/30 px-6 flex-shrink-0">
            <TabsList className="bg-transparent h-auto p-0 flex">
              <TabsTrigger
                value="live"
                className="relative py-3 px-1 mr-6 text-sm font-medium transition-colors whitespace-nowrap text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary data-[state=active]:after:rounded-t bg-transparent border-none rounded-none shadow-none data-[state=active]:shadow-none"
              >
                <div className="flex items-center gap-2">
                  <ScrollText size={16} />
                  Live Stream
                </div>
              </TabsTrigger>
              <TabsTrigger
                value="errors"
                className="relative py-3 px-1 mr-6 text-sm font-medium transition-colors whitespace-nowrap text-muted-foreground hover:text-foreground data-[state=active]:text-rose-400 data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-rose-400 data-[state=active]:after:rounded-t bg-transparent border-none rounded-none shadow-none data-[state=active]:shadow-none"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert size={16} />
                  Error Logs
                </div>
              </TabsTrigger>
              <TabsTrigger
                value="archive"
                className="relative py-3 px-1 mr-6 text-sm font-medium transition-colors whitespace-nowrap text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary data-[state=active]:after:rounded-t bg-transparent border-none rounded-none shadow-none data-[state=active]:shadow-none"
              >
                <div className="flex items-center gap-2">
                  <History size={16} />
                  Archive
                </div>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden">
            <TabsContent
              value="live"
              className="flex-1 h-full m-0 focus-visible:outline-none flex flex-col min-h-0 text-foreground overflow-hidden"
            >
              <LogsStream entries={filteredLogs} autoFollow={filters.autoFollow} />
            </TabsContent>

            <TabsContent
              value="errors"
              className="flex-1 h-full m-0 focus-visible:outline-none flex flex-col min-h-0 text-foreground overflow-hidden"
            >
              <LogsStream
                entries={filteredLogs.filter((l) => l.level === 'error' || l.level === 'fatal')}
                autoFollow={false}
              />
            </TabsContent>

            <TabsContent
              value="archive"
              className="flex-1 h-full m-0 flex flex-col justify-center items-center"
            >
              <div className="flex-1 flex flex-col items-center justify-center h-full p-12 text-center opacity-40">
                <div className="w-16 h-16 rounded-3xl bg-muted/20 border border-border/40 flex items-center justify-center mb-4">
                  <History size={32} />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest mb-1">Archive</h3>
                <p className="text-xs max-w-xs leading-relaxed">
                  Logs are backed by SQLite. Use export for snapshots.
                </p>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <div className="px-6 py-2 border-t border-border/40 bg-muted/20 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Connected to Gateway
          </div>
          <div className="flex items-center gap-1.5">SQLite source</div>
          <div className="flex items-center gap-1.5 text-primary/60">{filteredLogs.length} Entries</div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
          Last Updated: {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

export default LogsPage;
