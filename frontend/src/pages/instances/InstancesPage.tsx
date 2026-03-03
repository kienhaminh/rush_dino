import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  RadioIcon,
  RefreshCwIcon,
  ServerIcon,
  ClockIcon,
  ActivityIcon,
  AlertCircleIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export type PresenceEntry = any;

export type InstancesProps = {
  loading: boolean;
  entries: PresenceEntry[];
  lastError: string | null;
  statusMessage: string | null;
  onRefresh: () => void;
};

export function InstancesPage({
  loading = false,
  entries = [],
  lastError = null,
  statusMessage = null,
  onRefresh,
}: InstancesProps) {
  return (
    <div className="flex flex-col h-full bg-background min-h-[calc(100vh-72px)] p-6 md:p-8 overflow-y-auto w-full">
      <div className="w-full space-y-8 pb-12">
        <div className="flex justify-between items-center pb-2">
          <p className="text-muted-foreground text-sm max-w-xl">
            Presence beacons from the gateway and clients.
          </p>
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-2 bg-background border border-border hover:bg-secondary transition-colors h-9 px-4 rounded font-medium text-sm disabled:opacity-50"
              disabled={loading}
              onClick={onRefresh}
            >
              <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {lastError && (
          <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-md text-sm mb-6 flex items-start gap-3">
            <AlertCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Connection Error</p>
              <p>{lastError}</p>
            </div>
          </div>
        )}

        {statusMessage && (
          <div className="bg-primary/10 text-primary border border-primary/20 p-4 rounded-md text-sm mb-6">
            <p>{statusMessage}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {entries.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border/50 rounded-lg shadow-sm">
              <ServerIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">No instances reported yet.</p>
            </div>
          ) : (
            entries.map((entry: PresenceEntry, idx: number) => {
              const lastInput =
                entry.lastInputSeconds != null ? `${entry.lastInputSeconds}s ago` : 'N/A';
              const mode = entry.mode ?? 'unknown';
              const roles = Array.isArray(entry.roles) ? entry.roles.filter(Boolean) : [];
              const scopes = Array.isArray(entry.scopes) ? entry.scopes.filter(Boolean) : [];
              const scopesLabel =
                scopes.length > 0
                  ? scopes.length > 3
                    ? `${scopes.length} scopes`
                    : `scopes: ${scopes.join(', ')}`
                  : null;

              return (
                <Card
                  key={entry.id || idx}
                  className="bg-card border-border hover:border-border/80 transition-colors"
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row justify-between gap-6">
                      <div className="space-y-4 flex-1">
                        <div>
                          <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                            <ServerIcon className="w-5 h-5 text-primary" />
                            {entry.host ?? 'unknown host'}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1 font-mono">
                            {formatPresenceSummary(entry)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant="outline"
                            className="bg-background/50 text-[10px] capitalize"
                          >
                            Mode: {mode}
                          </Badge>
                          {roles.map((role: string) => (
                            <Badge
                              key={role}
                              variant="secondary"
                              className="text-[10px] bg-secondary/50 capitalize"
                            >
                              {role}
                            </Badge>
                          ))}
                          {scopesLabel && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              {scopesLabel}
                            </Badge>
                          )}
                          {entry.platform && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-primary/20 text-primary/80"
                            >
                              {entry.platform}
                            </Badge>
                          )}
                          {entry.deviceFamily && (
                            <Badge variant="outline" className="text-[10px]">
                              {entry.deviceFamily}
                            </Badge>
                          )}
                          {entry.modelIdentifier && (
                            <Badge variant="outline" className="text-[10px] bg-muted/30">
                              {entry.modelIdentifier}
                            </Badge>
                          )}
                          {entry.version && (
                            <Badge variant="outline" className="text-[10px] font-mono">
                              v{entry.version}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 md:w-48 shrink-0 text-sm">
                        <div className="flex items-center gap-2 text-foreground font-medium">
                          <ActivityIcon className="w-4 h-4 text-emerald-500" />
                          {formatPresenceAge(entry)}
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <ClockIcon className="w-4 h-4" />
                          Last Input: {lastInput}
                        </div>
                        {entry.reason && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <AlertCircleIcon className="w-4 h-4" />
                            Reason: {entry.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// Temporary stubs for presenter details
function formatPresenceSummary(entry: any) {
  if (entry.serviceUrl) return entry.serviceUrl;
  if (entry.id) return entry.id;
  return 'Unknown Identity';
}

function formatPresenceAge(entry: any) {
  if (!entry.timestampMs) return 'Unknown age';
  const ageMs = Date.now() - entry.timestampMs;
  if (ageMs < 60000) return 'Just now';
  return `${Math.floor(ageMs / 60000)}m ago`;
}

export default InstancesPage;
