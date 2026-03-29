import { useEffect, useState } from 'react';
import { RefreshCw, Shield, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchDoctorReport, fetchSystemSummary } from '@/lib/api';
import type { DoctorReportResponse, SystemSummaryResponse } from '@/lib/types';

function severityTone(severity: string) {
  switch (severity) {
    case 'error':
      return 'border-destructive/30 bg-destructive/10 text-destructive';
    case 'warn':
      return 'border-warning/30 bg-warning/10 text-warning';
    default:
      return 'border-border/50 bg-muted/20 text-muted-foreground';
  }
}

export function DiagnosticsPage() {
  const [report, setReport] = useState<DoctorReportResponse | null>(null);
  const [summary, setSummary] = useState<SystemSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [doctor, system] = await Promise.all([fetchDoctorReport(), fetchSystemSummary()]);
      setReport(doctor);
      setSummary(system);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diagnostics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-background px-6 py-6 md:px-8 md:py-8 flex flex-col gap-6 w-full">
      <section className="rounded-[28px] border border-border/60 bg-card/70 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Badge variant="outline" className="text-[10px] uppercase tracking-[0.24em]">
              Doctor report
            </Badge>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              This is the UI-first recovery surface: policy drift, missing credentials, fallback
              breakage, and unsafe defaults should surface here before you need the CLI.
            </p>
          </div>
          <Button onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/60 bg-card/80">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Errors</p>
            <p className="mt-2 text-3xl font-semibold">{report?.summary.errorCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/80">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Warnings</p>
            <p className="mt-2 text-3xl font-semibold">{report?.summary.warnCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/80">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Incidents</p>
            <p className="mt-2 text-3xl font-semibold">{summary?.incidents.length ?? 0}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Findings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {report?.findings.length ? (
              report.findings.map((finding) => (
                <div
                  key={finding.code}
                  className={`rounded-3xl border px-4 py-4 ${severityTone(finding.severity)}`}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {finding.severity}
                    </Badge>
                    <p className="text-sm font-semibold">{finding.title}</p>
                  </div>
                  <p className="mt-2 text-sm opacity-90">{finding.detail}</p>
                  <div className="mt-3 flex items-start gap-2 text-xs opacity-90">
                    <Wrench className="mt-0.5 h-4 w-4" />
                    <p>{finding.action}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
                No doctor findings. The current config and credential posture look healthy.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recovery posture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3">
                <div className="flex items-center gap-2 text-foreground">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="font-medium">Sandbox posture</span>
                </div>
                <p className="mt-1">
                  {summary?.security.sandboxEnabled ? 'Shell sandbox enabled' : 'Shell sandbox disabled'}
                  {' · '}
                  network {summary?.security.sandboxAllowNetwork ? 'allowed' : 'blocked'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent incidents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary?.incidents.length ? (
                summary.incidents.slice(0, 5).map((incident) => (
                  <div
                    key={incident.id}
                    className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {incident.level}
                      </Badge>
                      <p className="text-sm font-medium">{incident.target}</p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{incident.message}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-8 text-sm text-muted-foreground">
                  No runtime incidents were detected in the recent log window.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
