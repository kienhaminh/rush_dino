import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ActivityIcon,
  ServerIcon,
  MonitorIcon,
  ShieldIcon,
  ClockIcon,
  KeyIcon,
  RefreshCwIcon,
  GlobeIcon,
  WifiIcon,
  UsersIcon,
  CalendarIcon,
  AlertCircleIcon,
  InfoIcon,
} from 'lucide-react';

export type OverviewProps = {
  connected?: boolean;
  hello?: any | null;
  settings?: any;
  password?: string;
  lastError?: string | null;
  lastErrorCode?: string | null;
  presenceCount?: number;
  sessionsCount?: number | null;
  cronEnabled?: boolean | null;
  cronNext?: number | null;
  lastChannelsRefresh?: number | null;
  onSettingsChange?: (next: any) => void;
  onPasswordChange?: (next: string) => void;
  onSessionKeyChange?: (next: string) => void;
  onConnect?: () => void;
  onRefresh?: () => void;
};

export function OverviewPage(props: OverviewProps) {
  // Use props with fallbacks for development/mocking
  const connected = props.connected ?? true;
  const snapshot = props.hello?.snapshot || {
    uptimeMs: 124560000,
    policy: { tickIntervalMs: 1000 },
    authMode: 'token',
  };
  const uptime = snapshot?.uptimeMs
    ? `${Math.floor(snapshot.uptimeMs / (1000 * 60 * 60))}h ${Math.floor((snapshot.uptimeMs / (1000 * 60)) % 60)}m`
    : 'N/A';
  const tick = snapshot?.policy?.tickIntervalMs ? `${snapshot.policy.tickIntervalMs}ms` : 'N/A';

  const [localSettings, setLocalSettings] = useState(
    props.settings || {
      gatewayUrl: 'ws://127.0.0.1:18789',
      token: '',
      sessionKey: '',
      locale: 'en-US',
    },
  );

  const [localPassword, setLocalPassword] = useState(props.password || '');

  return (
    <div className="flex flex-col h-full bg-background min-h-[calc(100vh-72px)] p-6 md:p-8 overflow-y-auto w-full">
      <div className="w-full space-y-8 pb-12">
        <div className="flex justify-end items-center pb-2">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="bg-background border-border hover:bg-secondary transition-colors h-9"
              onClick={() => props.onRefresh?.()}
            >
              <RefreshCwIcon className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {props.lastError && (
          <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-md text-sm mb-6 flex items-start gap-3">
            <AlertCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Connection Error</p>
              <p>{props.lastError}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Access Settings Card */}
          <Card className="bg-card border-border flex flex-col">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldIcon className="w-5 h-5 text-primary" />
                Access Configuration
              </CardTitle>
              <CardDescription>Configure how the UI connects to the gateway.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-5 flex-1">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <GlobeIcon className="w-4 h-4 text-muted-foreground" />
                  Gateway URL
                </label>
                <Input
                  value={localSettings.gatewayUrl}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, gatewayUrl: e.target.value })
                  }
                  className="bg-muted/50 border-border font-mono text-sm"
                  placeholder="ws://127.0.0.1:18789"
                />
              </div>

              {snapshot?.authMode !== 'trusted-proxy' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <KeyIcon className="w-4 h-4 text-muted-foreground" />
                      Gateway Token
                    </label>
                    <Input
                      value={localSettings.token}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, token: e.target.value })
                      }
                      className="bg-muted/50 border-border font-mono text-sm"
                      placeholder="OPENCLAW_GATEWAY_TOKEN"
                      type="password"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <MonitorIcon className="w-4 h-4 text-muted-foreground" />
                      System Password
                    </label>
                    <Input
                      type="password"
                      value={localPassword}
                      onChange={(e) => setLocalPassword(e.target.value)}
                      className="bg-muted/50 border-border"
                      placeholder="system or shared password"
                    />
                  </div>
                </>
              )}

              <div className="pt-4 mt-auto">
                <Button
                  className="w-full"
                  onClick={() => {
                    props.onSettingsChange?.(localSettings);
                    props.onPasswordChange?.(localPassword);
                    props.onConnect?.();
                  }}
                >
                  <WifiIcon className="w-4 h-4 mr-2" />
                  Connect
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* System Snapshot Card */}
          <Card className="bg-card border-border flex flex-col">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <ServerIcon className="w-5 h-5 text-primary" />
                Gateway Snapshot
              </CardTitle>
              <CardDescription>Real-time status of the connected gateway.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                  <div className="text-sm text-muted-foreground mb-1">Status</div>
                  <div className="flex items-center gap-2 font-medium">
                    {connected ? (
                      <>
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Connected
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 rounded-full bg-destructive"></div> Offline
                      </>
                    )}
                  </div>
                </div>

                <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                  <div className="text-sm text-muted-foreground mb-1">Uptime</div>
                  <div className="font-mono text-sm font-medium">{uptime}</div>
                </div>

                <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                  <div className="text-sm text-muted-foreground mb-1">Tick Interval</div>
                  <div className="font-mono text-sm font-medium">{tick}</div>
                </div>

                <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                  <div className="text-sm text-muted-foreground mb-1">Channels Refresh</div>
                  <div className="font-mono text-sm font-medium">
                    {props.lastChannelsRefresh
                      ? new Date(props.lastChannelsRefresh).toLocaleTimeString()
                      : 'N/A'}
                  </div>
                </div>
              </div>

              {!props.lastError && (
                <div className="mt-6 bg-primary/10 text-primary p-3 rounded-md text-sm border border-primary/20 flex items-start gap-3">
                  <InfoIcon className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    Ensure your gateway is fully configured to receive periodic channel status
                    updates.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-card border-border">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-full text-primary shrink-0">
                <MonitorIcon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Connected Instances</p>
                <div className="text-2xl font-bold">{props.presenceCount ?? 0}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="bg-blue-500/10 p-3 rounded-full text-blue-500 shrink-0">
                <UsersIcon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Sessions</p>
                <div className="text-2xl font-bold">{props.sessionsCount ?? 'N/A'}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="bg-amber-500/10 p-3 rounded-full text-amber-500 shrink-0">
                <CalendarIcon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cron Enabled</p>
                <div className="text-2xl font-bold">
                  {props.cronEnabled == null ? 'N/A' : props.cronEnabled ? 'Yes' : 'No'}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notes Section */}
        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border/40 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <InfoIcon className="w-5 h-5 text-primary" />
              Administrative Notes
            </CardTitle>
            <CardDescription>
              Important information about system features and requirements.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-semibold text-sm mb-2 text-foreground">Tailscale Serving</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  When accessing your gateway via a shared domain or IP, consider running behind
                  Tailscale Serve for end-to-end encryption.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-2 text-foreground">Session Keys</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Use session keys to persist active workflow states across multiple browser tabs
                  and windows securely.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-2 text-foreground">Cron Jobs</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Background cron jobs handle automated workflows. Ensure the gateway has the
                  correct policy setup to allow background tasks.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default OverviewPage;
