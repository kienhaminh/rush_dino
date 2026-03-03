import React, { useState, useMemo, useEffect } from 'react';
import { LogsHeader } from './logs-header';
import { LogsStream } from './logs-stream';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollText, ShieldAlert, History } from 'lucide-react';
import type { LogEntry, LogLevel, LogsFilters } from './logs-types';

// ─── Mock Data Helpers ────────────────────────────────────────────────────────

const SUBSYSTEMS = ['Gateway', 'Worker', 'Cron', 'Auth', 'Database', 'Agent:alpha', 'Agent:beta'];
const LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

function generateMockLogs(count: number): LogEntry[] {
  const logs: LogEntry[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const time = new Date(now.getTime() - (count - i) * 1000);
    const level = LEVELS[Math.floor(Math.random() * LEVELS.length)];
    const subsystem = SUBSYSTEMS[Math.floor(Math.random() * SUBSYSTEMS.length)];

    let message = '';
    switch (level) {
      case 'error':
      case 'fatal':
        message = `Failed to process request: ${['Timeout', 'Connection Reset', 'Out of Memory', 'Invalid Token'][Math.floor(Math.random() * 4)]}`;
        break;
      case 'warn':
        message = `High latency detected on ${subsystem} (avg: ${Math.floor(Math.random() * 1000) + 500}ms)`;
        break;
      case 'info':
        message = `${subsystem} successfully ${['initialized', 'started', 'completed task', 'synced'][Math.floor(Math.random() * 4)]}`;
        break;
      default:
        message = `Routine ${['check', 'poll', 'heartbeat'][Math.floor(Math.random() * 3)]} for ${subsystem}`;
    }

    logs.push({
      id: `log-${i}`,
      time: time.toLocaleTimeString([], { hour12: false }),
      level,
      subsystem,
      message,
      raw: JSON.stringify({ time: time.toISOString(), level, subsystem, message }),
    });
  }
  return logs;
}

const MOCK_LOGS = generateMockLogs(50);

// ─── LogsPage ───────────────────────────────────────────────────────────────

export function LogsPage() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>(MOCK_LOGS);

  const [filters, setFilters] = useState<LogsFilters>({
    query: '',
    levels: {
      trace: false,
      debug: true,
      info: true,
      warn: true,
      error: true,
      fatal: true,
    },
    autoFollow: true,
  });

  const [activeTab, setActiveTab] = useState('live');

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (!filters.levels[log.level]) return false;
      if (filters.query) {
        const q = filters.query.toLowerCase();
        return (
          log.message.toLowerCase().includes(q) ||
          (log.subsystem?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [logs, filters]);

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      // Simulate new logs arriving
      const newLogs = generateMockLogs(5);
      setLogs((prev) => [...prev, ...newLogs].slice(-100)); // Keep last 100
      setLoading(false);
    }, 800);
  };

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
        onRefresh={handleRefresh}
        onExport={handleExport}
        filters={filters}
        onFilterChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
      />

      <div className="flex-1 overflow-hidden relative flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="px-6 border-b border-border/40 bg-background/30 backdrop-blur-sm shrink-0">
            <TabsList className="bg-transparent h-12 p-0 gap-8">
              <TabsTrigger
                value="live"
                className="bg-transparent border-none p-0 h-full text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground data-[state=active]:text-primary data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary relative rounded-none transition-all"
              >
                <div className="flex items-center gap-2">
                  <ScrollText size={14} />
                  Live Stream
                </div>
              </TabsTrigger>
              <TabsTrigger
                value="errors"
                className="bg-transparent border-none p-0 h-full text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground data-[state=active]:text-rose-400 data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-rose-400 relative rounded-none transition-all"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert size={14} />
                  Error Logs
                </div>
              </TabsTrigger>
              <TabsTrigger
                value="archive"
                className="bg-transparent border-none p-0 h-full text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground data-[state=active]:text-primary data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary relative rounded-none transition-all"
              >
                <div className="flex items-center gap-2">
                  <History size={14} />
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
              <LogsStream
                entries={filteredLogs}
                autoFollow={filters.autoFollow}
                onScroll={(e) => {
                  // If user scrolls up, disable auto-follow
                  const target = e.currentTarget;
                  const isAtBottom = target.scrollHeight - target.scrollTop === target.clientHeight;
                  if (!isAtBottom && filters.autoFollow) {
                    setFilters((prev) => ({ ...prev, autoFollow: false }));
                  }
                }}
              />
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
                <div className="w-16 h-16 rounded-3xl bg-muted/20 border border-border/40 flex items-center justify-center mb-4 transition-transform hover:scale-105">
                  <History size={32} />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest mb-1">
                  Archive Unavailable
                </h3>
                <p className="text-xs max-w-xs leading-relaxed">
                  Log archiving is not configured for this environment. Please check your gateway
                  settings.
                </p>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Connection Info footer */}
      <div className="px-6 py-2 border-t border-border/40 bg-muted/20 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Connected to Gateway
          </div>
          <div className="flex items-center gap-1.5">File: gateway.jsonl</div>
          <div className="flex items-center gap-1.5 text-primary/60">
            {filteredLogs.length} Entries
          </div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
          Last Updated: {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

export default LogsPage;
