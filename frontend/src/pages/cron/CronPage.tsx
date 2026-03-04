import React, { useState, useMemo } from 'react';
import { CronHeader } from './cron-header';
import { CronStats } from './cron-stats';
import { CronList } from './cron-list';
import { CronHistory } from './cron-history';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListIcon, HistoryIcon } from 'lucide-react';
import type {
  CronJob,
  CronRunLogEntry,
  CronStatus,
  CronJobsEnabledFilter,
  CronJobsSortBy,
  CronSortDir,
  CronRunScope,
} from './cron-types';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_STATUS: CronStatus = {
  enabled: true,
  jobsNum: 4,
  nextWakeAtMs: Date.now() + 15 * 60 * 1000, // 15 mins
};

const MOCK_JOBS: CronJob[] = [
  {
    id: '1',
    name: 'Daily Backup Analysis',
    schedule: '0 0 * * *',
    scheduleKind: 'cron',
    nextRunAtMs: Date.now() + 4 * 60 * 60 * 1000,
    agentId: 'beta',
    enabled: true,
    status: 'active',
    updatedAtMs: Date.now() - 86400000,
  },
  {
    id: '2',
    name: 'News Scraper',
    schedule: '*/15 * * * *',
    scheduleKind: 'cron',
    nextRunAtMs: Date.now() + 12 * 60 * 1000,
    agentId: 'alpha',
    enabled: true,
    status: 'active',
    updatedAtMs: Date.now() - 3600000,
  },
  {
    id: '3',
    name: 'System Health Check',
    schedule: 'Every 5 minutes',
    scheduleKind: 'every',
    nextRunAtMs: Date.now() + 3 * 60 * 1000,
    agentId: 'monitor',
    enabled: true,
    status: 'active',
    updatedAtMs: Date.now() - 300000,
  },
  {
    id: '4',
    name: 'Legacy Report Gen',
    schedule: '0 12 * * *',
    scheduleKind: 'cron',
    nextRunAtMs: null,
    agentId: 'gamma',
    enabled: false,
    status: 'paused',
    updatedAtMs: Date.now() - 172800000,
  },
];

const MOCK_RUNS: CronRunLogEntry[] = [
  {
    id: 'r1',
    jobId: '2',
    jobName: 'News Scraper',
    status: 'ok',
    startedAtMs: Date.now() - 13 * 60 * 1000,
    durationMs: 1250,
    summary: 'Fetched 12 new articles from primary sources.',
    deliveryStatus: 'delivered',
  },
  {
    id: 'r2',
    jobId: '3',
    jobName: 'System Health Check',
    status: 'ok',
    startedAtMs: Date.now() - 5 * 60 * 1000,
    durationMs: 450,
    summary: 'All checks passed. System healthy.',
    deliveryStatus: 'not-requested',
  },
  {
    id: 'r3',
    jobId: '1',
    jobName: 'Daily Backup Analysis',
    status: 'error',
    startedAtMs: Date.now() - 20 * 60 * 60 * 1000,
    durationMs: 8200,
    summary: 'Backup verification failed.',
    error: 'Checksum mismatch in shard-3',
    deliveryStatus: 'delivered',
  },
  {
    id: 'r4',
    jobId: '2',
    jobName: 'News Scraper',
    status: 'skipped',
    startedAtMs: Date.now() - 28 * 60 * 1000,
    durationMs: 0,
    summary: 'Skipped due to concurrent execution lock.',
    deliveryStatus: 'not-requested',
  },
];

// ─── CronPage ────────────────────────────────────────────────────────────────

export function CronPage() {
  const [activeTab, setActiveTab] = useState('jobs');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Job List Filters
  const [jobFilters, setJobFilters] = useState({
    enabled: 'all' as CronJobsEnabledFilter,
    sortBy: 'nextRunAtMs' as CronJobsSortBy,
    sortDir: 'asc' as CronSortDir,
  });

  // History Filters
  const [historyFilters, setHistoryFilters] = useState({
    scope: 'all' as CronRunScope,
    sortDir: 'desc' as CronSortDir,
  });

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 800);
  };

  const handleNewJob = () => {
    console.log('New job clicked');
  };

  // Filter logic
  const filteredJobs = useMemo(() => {
    return MOCK_JOBS.filter((job) => {
      if (jobFilters.enabled === 'enabled' && !job.enabled) return false;
      if (jobFilters.enabled === 'disabled' && job.enabled) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          job.name.toLowerCase().includes(q) ||
          job.agentId.toLowerCase().includes(q) ||
          job.schedule.toLowerCase().includes(q)
        );
      }
      return true;
    }).sort((a, b) => {
      const dir = jobFilters.sortDir === 'asc' ? 1 : -1;
      if (jobFilters.sortBy === 'name') return a.name.localeCompare(b.name) * dir;
      if (jobFilters.sortBy === 'nextRunAtMs') {
        const va = a.nextRunAtMs ?? Infinity;
        const vb = b.nextRunAtMs ?? Infinity;
        return (va - vb) * dir;
      }
      return (b.updatedAtMs - a.updatedAtMs) * dir;
    });
  }, [jobFilters, searchQuery]);

  const filteredHistory = useMemo(() => {
    return MOCK_RUNS.filter((run) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          run.jobName.toLowerCase().includes(q) || (run.summary?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    }).sort((a, b) => {
      const dir = historyFilters.sortDir === 'asc' ? 1 : -1;
      return (a.startedAtMs - b.startedAtMs) * dir;
    });
  }, [historyFilters, searchQuery]);

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-background overflow-hidden font-sans">
      <CronHeader
        loading={loading}
        onRefresh={handleRefresh}
        onNewJob={handleNewJob}
        query={searchQuery}
        onQueryChange={setSearchQuery}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6 space-y-8">
          {/* Insights / Stats */}
          <CronStats status={MOCK_STATUS} />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
            <div className="flex items-center overflow-x-auto border-b border-border bg-card/30 px-6 flex-shrink-0 mx-[-1rem] lg:mx-[-1.5rem] mb-6">
              <TabsList className="bg-transparent h-auto p-0 flex">
                <TabsTrigger
                  value="jobs"
                  className="relative py-3 px-1 mr-6 text-sm font-medium transition-colors whitespace-nowrap text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary data-[state=active]:after:rounded-t bg-transparent border-none rounded-none shadow-none data-[state=active]:shadow-none"
                >
                  <div className="flex items-center gap-2">
                    <ListIcon size={16} />
                    Active Jobs
                  </div>
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="relative py-3 px-1 mr-6 text-sm font-medium transition-colors whitespace-nowrap text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary data-[state=active]:after:rounded-t bg-transparent border-none rounded-none shadow-none data-[state=active]:shadow-none"
                >
                  <div className="flex items-center gap-2">
                    <HistoryIcon size={16} />
                    Execution History
                  </div>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="jobs" className="mt-0 focus-visible:outline-none">
              <CronList
                jobs={filteredJobs}
                loading={loading}
                filters={{ ...jobFilters, query: searchQuery }}
                onFilterChange={(patch) => setJobFilters((prev) => ({ ...prev, ...patch }))}
                onToggle={(job) => console.log('Toggle', job)}
                onEdit={(job) => console.log('Edit', job)}
                onRemove={(job) => console.log('Remove', job)}
                onRun={(job) => console.log('Run Now', job)}
              />
            </TabsContent>

            <TabsContent value="history" className="mt-0 focus-visible:outline-none">
              <CronHistory
                runs={filteredHistory}
                loading={loading}
                total={MOCK_RUNS.length}
                hasMore={false}
                filters={{
                  ...historyFilters,
                  query: searchQuery,
                  statuses: [],
                  deliveryStatuses: [],
                }}
                onFilterChange={(patch) => setHistoryFilters((prev) => ({ ...prev, ...patch }))}
                onLoadMore={() => console.log('Load more history')}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default CronPage;
