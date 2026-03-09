import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ChannelPairingState } from '@/lib/types';

type PairingChannel = 'telegram' | 'discord';

type ChannelPairingPanelProps = {
  channel: PairingChannel;
  pairing: ChannelPairingState | null;
  busy: boolean;
  onRefresh: (channel: PairingChannel) => void;
  onDecision: (channel: PairingChannel, requestId: string, approved: boolean) => void;
  onRevoke: (channel: PairingChannel, senderId: string) => void;
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

export function ChannelPairingPanel({
  channel,
  pairing,
  busy,
  onRefresh,
  onDecision,
  onRevoke,
}: ChannelPairingPanelProps) {
  const pending = pairing?.pending ?? [];
  const paired = pairing?.paired ?? [];
  const [codeFilter, setCodeFilter] = useState('');
  const normalizedFilter = codeFilter.trim().toUpperCase();
  const filteredPending = useMemo(() => {
    if (!normalizedFilter) return pending;
    return pending.filter((request) => request.code.toUpperCase().includes(normalizedFilter));
  }, [normalizedFilter, pending]);
  const hasPendingFilter = normalizedFilter.length > 0;
  const channelLabel = channel === 'telegram' ? 'Telegram' : 'Discord';

  return (
    <div className="space-y-4">
      <Card className="border-border/60 bg-card/80">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">Pairing Workflow</CardTitle>
              <p className="text-sm text-muted-foreground">
                Approve {channelLabel} direct-message senders after they receive a pairing code.
              </p>
            </div>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onRefresh(channel)}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Step 1</p>
              <p className="mt-2 text-sm font-medium">Ask the sender to message the bot.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The gateway replies with a pairing code and creates a pending request.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Step 2</p>
              <p className="mt-2 text-sm font-medium">Find the request by pairing code.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Use the code lookup below if several pending requests are waiting.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/50 p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Step 3</p>
              <p className="mt-2 text-sm font-medium">Approve or deny access.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Approved senders move into the paired list until you revoke them.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={codeFilter}
                onChange={(event) => setCodeFilter(event.target.value)}
                placeholder="Lookup pending request by pairing code"
                className="pl-9"
                disabled={busy}
              />
            </div>
            <div className="rounded-xl border border-border/50 bg-background/50 px-4 py-2 text-sm">
              <span className="text-muted-foreground">Pending</span>{' '}
              <span className="font-semibold text-foreground">{pending.length}</span>
            </div>
            <div className="rounded-xl border border-border/50 bg-background/50 px-4 py-2 text-sm">
              <span className="text-muted-foreground">Paired</span>{' '}
              <span className="font-semibold text-foreground">{paired.length}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pending Pairing Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredPending.length ? (
              filteredPending.map((request) => (
              <div
                key={request.id}
                className="rounded-2xl border border-border/50 bg-background/50 px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        pending
                      </Badge>
                      <p className="text-sm font-medium">
                        {request.senderDisplay ?? request.senderId}
                      </p>
                    </div>
                    <p className="font-mono text-lg font-semibold tracking-[0.25em] text-foreground">
                      {request.code}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2 text-right">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Sender ID
                    </p>
                    <p className="mt-1 font-mono text-xs text-foreground">{request.senderId}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <p>Last seen: {formatTimestamp(request.lastSeenAt)}</p>
                  <p>Expires: {formatTimestamp(request.expiresAt)}</p>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => onDecision(channel, request.id, false)}
                  >
                    Deny
                  </Button>
                  <Button disabled={busy} onClick={() => onDecision(channel, request.id, true)}>
                    Approve
                  </Button>
                </div>
              </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-8 text-sm text-muted-foreground">
                {hasPendingFilter
                  ? `No pending ${channelLabel} pairing request matches code "${normalizedFilter}".`
                  : 'No pairing requests are waiting for approval.'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Paired Users</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {paired.length ? (
              paired.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-border/50 bg-background/50 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{entry.senderDisplay ?? entry.senderId}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sender ID: {entry.senderId}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => onRevoke(channel, entry.senderId)}
                    >
                      Revoke
                    </Button>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <p>Approved: {formatTimestamp(entry.approvedAt)}</p>
                    <p>Last seen: {formatTimestamp(entry.lastSeenAt)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-8 text-sm text-muted-foreground">
                No paired users have been approved yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
