import React, { useState, useMemo, useCallback } from 'react';
import { CronHeader } from './cron-header';
import { CronStats } from './cron-stats';
import { CronList } from './cron-list';
import { CronHistory } from './cron-history';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListIcon, HistoryIcon } from 'lucide-react';
import {
  pauseCronJob,
  resumeCronJob,
  runCronJobNow,
  deleteCronJob,
} from '@/lib/api';
import { useCronQuery, useAllCronRunsQuery } from '@/lib/queries';
import { mapCronJobRecordToCard, mapCronRunRecordToEntry, buildCronStatus } from './cron-data';
import type {
  CronJob,
  CronJobsEnabledFilter,
  CronJobsSortBy,
  CronSortDir,
  CronRunsStatusFilter,
} from './cron-types';
import { useQueryClient } from '@tanstack/react-query';
import { miscKeys } from '@/lib/queries';

export function CronPage() {
  const [activeTab, setActiveTab] = useState('jobs');
  const [searchQuery, setSearchQuery] = useState('');

  // Job List Filters
  const [jobFilters, setJobFilters] = useState({
    enabled: 'all' as CronJobsEnabledFilter,
    sortBy: 'nextRunAtMs' as CronJobsSortBy,
    sortDir: 'asc' as CronSortDir,
  });

  // History Filters
  const [historyFilters, setHistoryFilters] = useState({
    statusFilter: 'all' as CronRunsStatusFilter,
    sortDir: 'desc' as CronSortDir,
  });

  const queryClient = useQueryClient();
  const cronQuery = useCronQuery();
  const apiJobs = cronQuery.data ?? [];
  const loading = cronQuery.isPending;

  const jobIds = useMemo(() => apiJobs.map((j) => j.id), [apiJobs]);
  const { data: allRunArrays = [] } = useAllCronRunsQuery(jobIds);

  const jobs = useMemo(() => apiJobs.map(mapCronJobRecordToCard), [apiJobs]);

  const runs = useMemo(() => {
    if (allRunArrays.length === 0) return [];
    const jobsById = new Map(apiJobs.map((j) => [j.id, j]));
    return allRunArrays
      .flat()
      .map((run) => mapCronRunRecordToEntry(run, jobsById))
      .sort((a, b) => b.startedAtMs - a.startedAtMs);
  }, [allRunArrays, apiJobs]);

  const status = useMemo(() => buildCronStatus(apiJobs), [apiJobs]);

  const refreshData = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: miscKeys.cron() });
    void queryClient.invalidateQueries({ queryKey: miscKeys.cronRuns(jobIds) });
  }, [queryClient, jobIds]);

  const handleToggle = useCallback(
    async (job: CronJob) => {
      try {
        if (job.enabled) {
          await pauseCronJob(job.id);
        } else {
          await resumeCronJob(job.id);
        }
        refreshData();
      } catch (err) {
        console.error('Failed to toggle cron job', err);
      }
    },
    [refreshData],
  );

  const handleRun = useCallback(
    async (job: CronJob) => {
      try {
        await runCronJobNow(job.id);
        refreshData();
      } catch (err) {
        console.error('Failed to run cron job', err);
      }
    },
    [refreshData],
  );

  const handleRemove = useCallback(
    async (job: CronJob) => {
      try {
        await deleteCronJob(job.id);
        refreshData();
      } catch (err) {
        console.error('Failed to delete cron job', err);
      }
    },
    [refreshData],
  );

  const handleNewJob = () => {
    console.log('New job clicked');
  };

  // Filter logic
  const filteredJobs = useMemo(() => {
    return jobs
      .filter((job) => {
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
      })
      .sort((a, b) => {
        const dir = jobFilters.sortDir === 'asc' ? 1 : -1;
        if (jobFilters.sortBy === 'name') return a.name.localeCompare(b.name) * dir;
        if (jobFilters.sortBy === 'nextRunAtMs') {
          const va = a.nextRunAtMs ?? Infinity;
          const vb = b.nextRunAtMs ?? Infinity;
          return (va - vb) * dir;
        }
        return (b.updatedAtMs - a.updatedAtMs) * dir;
      });
  }, [jobs, jobFilters, searchQuery]);

  const filteredHistory = useMemo(() => {
    return runs
      .filter((run) => {
        if (historyFilters.statusFilter !== 'all' && run.status !== historyFilters.statusFilter)
          return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            run.jobName.toLowerCase().includes(q) ||
            (run.summary?.toLowerCase().includes(q) ?? false)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const dir = historyFilters.sortDir === 'asc' ? 1 : -1;
        return (a.startedAtMs - b.startedAtMs) * dir;
      });
  }, [runs, historyFilters, searchQuery]);

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-background overflow-hidden font-sans">
      <CronHeader
        loading={loading}
        onRefresh={refreshData}
        onNewJob={handleNewJob}
        query={searchQuery}
        onQueryChange={setSearchQuery}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6 space-y-8">
          <CronStats status={status} />

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
                    {jobs.length > 0 && (
                      <span className="text-[10px] font-bold bg-muted px-1.5 py-0.5 rounded-full">
                        {jobs.length}
                      </span>
                    )}
                  </div>
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="relative py-3 px-1 mr-6 text-sm font-medium transition-colors whitespace-nowrap text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary data-[state=active]:after:rounded-t bg-transparent border-none rounded-none shadow-none data-[state=active]:shadow-none"
                >
                  <div className="flex items-center gap-2">
                    <HistoryIcon size={16} />
                    Execution History
                    {runs.length > 0 && (
                      <span className="text-[10px] font-bold bg-muted px-1.5 py-0.5 rounded-full">
                        {runs.length}
                      </span>
                    )}
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
                onToggle={handleToggle}
                onEdit={(job) => console.log('Edit', job)}
                onRemove={handleRemove}
                onRun={handleRun}
              />
            </TabsContent>

            <TabsContent value="history" className="mt-0 focus-visible:outline-none">
              <CronHistory
                runs={filteredHistory}
                loading={loading}
                total={runs.length}
                filters={{ ...historyFilters, query: searchQuery }}
                onFilterChange={(patch) =>
                  setHistoryFilters((prev) => ({ ...prev, ...patch }))
                }
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default CronPage;
