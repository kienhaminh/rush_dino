import { useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, QrCode, ShieldX } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { IssuedMobileGatewayKey, MobileGatewayKeyRecord } from '@/lib/types';

type MobileGatewayKeysPanelProps = {
  publishHost: string;
  busy: boolean;
  keys: MobileGatewayKeyRecord[];
  lastIssuedKey: IssuedMobileGatewayKey | null;
  onIssueKey: (label?: string) => void;
  onRevokeKey: (id: string) => void;
  onDismissIssuedKey: () => void;
};

function formatTimestamp(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied.`);
  } catch {
    toast.error(`Failed to copy ${label.toLowerCase()}.`);
  }
}

export function MobileGatewayKeysPanel({
  publishHost,
  busy,
  keys,
  lastIssuedKey,
  onIssueKey,
  onRevokeKey,
  onDismissIssuedKey,
}: MobileGatewayKeysPanelProps) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (lastIssuedKey) {
      setLabel('');
    }
  }, [lastIssuedKey]);

  const qrPayloadJson = useMemo(
    () => (lastIssuedKey ? JSON.stringify(lastIssuedKey.qrPayload, null, 2) : ''),
    [lastIssuedKey],
  );

  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-primary" />
          Mobile API Keys
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3 rounded-2xl border border-border/50 bg-background/55 p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Issue a new key</h3>
            <p className="text-xs text-muted-foreground">
              Keys are shown once, then only their metadata remains in the dashboard.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Optional device label, for example Alice iPhone"
              disabled={busy}
              className="text-xs"
            />
            <Button
              type="button"
              disabled={busy || !publishHost.trim()}
              onClick={() => onIssueKey(label.trim() || undefined)}
            >
              Issue Key
            </Button>
          </div>

          {!publishHost.trim() ? (
            <p className="text-xs text-destructive">
              Save a publish host first. Key issuance and QR bootstrap depend on it.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Publish host: {publishHost}</p>
          )}
        </div>

        {lastIssuedKey ? (
          <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Latest issued key</h3>
                <p className="text-xs text-muted-foreground">
                  Copy the raw key now. It will not be returned again after this screen.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={onDismissIssuedKey}>
                Hide
              </Button>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-border/50 bg-background/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    API Key
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => copyText(lastIssuedKey.apiKey, 'API key')}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
                <code className="block break-all rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs">
                  {lastIssuedKey.apiKey}
                </code>
              </div>

              <div className="space-y-3 rounded-xl border border-border/50 bg-background/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <QrCode className="h-3.5 w-3.5" />
                    QR Code
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => copyText(qrPayloadJson, 'QR payload')}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
                <div className="flex justify-center rounded-lg border border-border/50 bg-white p-4">
                  <QRCodeSVG value={qrPayloadJson} size={168} bgColor="#ffffff" fgColor="#111827" />
                </div>
                <pre className="overflow-x-auto rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-[11px] leading-5">
                  {qrPayloadJson}
                </pre>
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Active keys</h3>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {keys.length} total
            </Badge>
          </div>

          {keys.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
              No mobile gateway keys have been issued yet.
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="rounded-2xl border border-border/50 bg-background/55 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          {key.label?.trim() || 'Unlabeled device'}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                          sender {key.senderId}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Created {formatTimestamp(key.createdAt)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last seen {formatTimestamp(key.lastSeenAt)}
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-destructive hover:text-destructive"
                      disabled={busy}
                      onClick={() => onRevokeKey(key.id)}
                    >
                      <ShieldX className="h-3.5 w-3.5" />
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
