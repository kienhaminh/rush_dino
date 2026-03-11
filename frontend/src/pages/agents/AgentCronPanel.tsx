import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AgentRuntimeData } from './agent-types';

type AgentCronPanelProps = {
  runtime: AgentRuntimeData;
};

export function AgentCronPanel({ runtime }: AgentCronPanelProps) {
  return (
    <div className="space-y-4">
      <Card className="bg-card border-border/50">
        <CardHeader className="flex flex-row justify-between items-start">
          <div>
            <CardTitle className="text-base">Scheduler</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Gateway cron status for this agent.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-border/50 bg-transparent hover:bg-muted/50"
          >
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-md border border-border/50 p-3 bg-muted/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Enabled</p>
              <p className="text-lg font-semibold">{runtime.cronStatus.enabled ? 'Yes' : 'No'}</p>
            </div>
            <div className="rounded-md border border-border/50 p-3 bg-muted/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Jobs</p>
              <p className="text-lg font-semibold">{runtime.cronStatus.jobs}</p>
            </div>
            <div className="rounded-md border border-border/50 p-3 bg-muted/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Next Wake</p>
              <p className="text-lg font-semibold">{runtime.cronStatus.nextWake}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Agent Cron Jobs</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Scheduled jobs targeting this agent.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {runtime.cronJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs assigned.</p>
          ) : (
            runtime.cronJobs.map((job) => (
              <div
                key={job.id}
                className="border border-border/50 rounded-lg p-4 bg-muted/20 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{job.name}</p>
                  <Badge variant={job.enabled ? 'success' : 'secondary'}>
                    {job.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{job.description}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className="border-border/50 bg-muted/40">
                    schedule: {job.schedule}
                  </Badge>
                  <Badge variant="outline" className="border-border/50 bg-muted/40">
                    next: {job.nextRun}
                  </Badge>
                  <Badge variant="outline" className="border-border/50 bg-muted/40">
                    state: {job.state}
                  </Badge>
                </div>
                <p className="text-xs font-mono text-muted-foreground">{job.payload}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
