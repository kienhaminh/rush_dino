import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { fetchChannelPairing, resolveChannelPairingRequest, revokeChannelPairedUser } from '@/lib/api';
import { usePairingRequestEvents } from '@/hooks/use-chat-ws';
import type { ChannelPairingState, ChannelPairingPendingRequest, ChannelPairedUser } from '@/lib/types';

type Channel = 'telegram' | 'discord';
const CHANNELS: Channel[] = ['telegram', 'discord'];

function channelLabel(channel: Channel) {
  return channel === 'telegram' ? 'Telegram' : 'Discord';
}

function formatTs(value: string) {
  return new Date(value).toLocaleString();
}

export function ApprovalsPage() {
  const [states, setStates] = useState<Record<Channel, ChannelPairingState | null>>({
    telegram: null,
    discord: null,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    try {
      const [telegram, discord] = await Promise.all([
        fetchChannelPairing('telegram'),
        fetchChannelPairing('discord'),
      ]);
      setStates({ telegram, discord });
    } catch (err) {
      console.error('Failed to fetch pairing state', err);
      toast.error('Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const { pairingRequestCount } = usePairingRequestEvents();
  useEffect(() => {
    if (pairingRequestCount === 0) return;
    fetchAll();
  }, [pairingRequestCount, fetchAll]);

  const allPending: (ChannelPairingPendingRequest & { channel: Channel })[] = CHANNELS.flatMap(
    (ch) => (states[ch]?.pending ?? []).map((r) => ({ ...r, channel: ch })),
  ).sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

  const allPaired: (ChannelPairedUser & { channel: Channel })[] = CHANNELS.flatMap(
    (ch) => (states[ch]?.paired ?? []).map((p) => ({ ...p, channel: ch })),
  ).sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

  const handleDecision = async (channel: Channel, requestId: string, approved: boolean) => {
    setBusy((prev) => ({ ...prev, [requestId]: true }));
    try {
      await resolveChannelPairingRequest(channel, requestId, approved);
      await fetchAll();
    } catch (err) {
      console.error('Failed to resolve pairing request', err);
      toast.error('Action failed — please try again');
    } finally {
      setBusy((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  const handleRevoke = async (channel: Channel, senderId: string) => {
    const key = `${channel}:${senderId}`;
    setBusy((prev) => ({ ...prev, [key]: true }));
    try {
      await revokeChannelPairedUser(channel, senderId);
      await fetchAll();
    } catch (err) {
      console.error('Failed to revoke paired user', err);
      toast.error('Revoke failed — please try again');
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-auto p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">

        {/* Pending requests */}
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Pending Requests
            {allPending.length > 0 && (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {allPending.length}
              </span>
            )}
          </h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : allPending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending pairing requests.</p>
          ) : (
            <div className="space-y-3">
              {allPending.map((req) => (
                <Card key={req.id} className="border-border/60 bg-card/80">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                          {channelLabel(req.channel)}
                        </Badge>
                        <span className="truncate font-medium">
                          {req.senderDisplay ?? req.senderId}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          Code: <span className="font-mono font-bold text-foreground">{req.code}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTs(req.lastSeenAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/30 text-red-500 hover:bg-red-500/10"
                        disabled={!!busy[req.id]}
                        onClick={() => handleDecision(req.channel, req.id, false)}
                      >
                        <XCircle className="mr-1.5 h-3.5 w-3.5" />
                        Deny
                      </Button>
                      <Button
                        size="sm"
                        disabled={!!busy[req.id]}
                        onClick={() => handleDecision(req.channel, req.id, true)}
                      >
                        <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                        Approve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Paired users */}
        {!loading && allPaired.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Paired Users
            </h3>
            <div className="space-y-2">
              {allPaired.map((p) => (
                <Card key={`${p.channel}:${p.senderId}`} className="border-border/40 bg-card/50">
                  <CardContent className="flex items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                        {channelLabel(p.channel)}
                      </Badge>
                      <span className="truncate text-sm font-medium">
                        {p.senderDisplay ?? p.senderId}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        since {formatTs(p.approvedAt)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={!!busy[`${p.channel}:${p.senderId}`]}
                      onClick={() => handleRevoke(p.channel, p.senderId)}
                    >
                      Revoke
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
