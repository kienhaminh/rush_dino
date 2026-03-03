import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HexagonIcon } from 'lucide-react';
import type { ChannelsProps } from './ChannelsPage';

function truncatePubkey(pubkey: string | null | undefined): string {
  if (!pubkey) return 'n/a';
  if (pubkey.length <= 20) return pubkey;
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
}

export function NostrCard({
  props,
  nostr,
  accounts,
}: {
  props: ChannelsProps;
  nostr?: any;
  accounts: any[];
}) {
  const formatTime = (ts: number | null | undefined) =>
    ts ? new Date(ts).toLocaleString() : 'n/a';
  const primaryAccount = accounts[0];
  const summaryConfigured = nostr?.configured ?? primaryAccount?.configured ?? false;
  const summaryRunning = nostr?.running ?? primaryAccount?.running ?? false;
  const summaryPublicKey = nostr?.publicKey ?? primaryAccount?.publicKey;
  const summaryLastStartAt = nostr?.lastStartAt ?? primaryAccount?.lastStartAt ?? null;
  const summaryLastError = nostr?.lastError ?? primaryAccount?.lastError ?? null;
  const hasMultipleAccounts = accounts.length > 1;

  const profile = primaryAccount?.profile ?? nostr?.profile;
  const { name, displayName, about, picture, nip05 } = profile ?? {};
  const hasProfile = name || displayName || about || picture || nip05;

  return (
    <Card className="bg-card border-border flex flex-col h-full hover:border-border/80 transition-colors">
      <CardHeader className="pb-3 flex flex-row justify-between items-start space-y-0 border-b border-border/50">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2 capitalize">
            <HexagonIcon className="w-5 h-5 text-muted-foreground" />
            Nostr
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Decentralized DMs via Nostr relays (NIP-04).
          </p>
        </div>
        <Badge
          variant={summaryRunning ? 'default' : 'secondary'}
          className="capitalize text-[10px] h-5"
        >
          {summaryRunning ? 'Connected' : 'Offline'}
        </Badge>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-start pt-4 space-y-4">
        {hasMultipleAccounts ? (
          <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2">
            {accounts.map((account, idx) => {
              const accPub = account.publicKey;
              const accProfile = account.profile;
              const dispName =
                accProfile?.displayName ?? accProfile?.name ?? account.name ?? account.accountId;
              return (
                <div
                  key={idx}
                  className="bg-muted p-3 text-sm rounded-md space-y-2 border border-border/50"
                >
                  <div className="flex justify-between font-semibold border-b border-border/50 pb-2">
                    <span>{dispName}</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {account.accountId}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Configured</span>
                    <span className="font-medium text-foreground">
                      {account.configured ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground text-xs">
                    <span>Running</span>
                    <span className="font-medium text-foreground">
                      {account.running ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground text-xs">
                    <span>Public Key</span>
                    <span className="font-mono text-foreground tracking-tight" title={accPub}>
                      {truncatePubkey(accPub)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground text-xs mt-1">
                    <span>Last Inbound</span>
                    <span className="font-medium text-foreground">
                      {formatTime(account.lastInboundAt)}
                    </span>
                  </div>
                  {account.lastError && (
                    <div className="text-destructive text-[10px] mt-1 p-2 bg-destructive/10 rounded">
                      {account.lastError}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-y-2 text-sm bg-muted/30 p-3 rounded-md">
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Configured</span>
              <span className="font-medium text-foreground">
                {summaryConfigured ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground pl-4 border-l border-border/50">
              <span>Running</span>
              <span className="font-medium text-foreground">{summaryRunning ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground pt-2 border-t border-border/50 col-span-2">
              <span>Public Key</span>
              <span className="font-medium text-foreground tracking-tight font-mono">
                {truncatePubkey(summaryPublicKey)}
              </span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground col-span-2 mt-1">
              <span>Last start</span>
              <span className="font-medium text-foreground">{formatTime(summaryLastStartAt)}</span>
            </div>
          </div>
        )}

        {summaryLastError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md">
            {summaryLastError}
          </div>
        )}

        {/* Profile Card Snippet */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border/50">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-medium text-sm">Profile</h4>
            {summaryConfigured && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px]"
                onClick={() =>
                  props.onNostrProfileEdit(primaryAccount?.accountId ?? 'default', profile)
                }
              >
                Edit Profile
              </Button>
            )}
          </div>
          {hasProfile ? (
            <div className="space-y-2 text-xs">
              {picture && (
                <img
                  src={picture}
                  alt="Profile"
                  className="w-12 h-12 rounded-full object-cover border border-border/50"
                />
              )}
              {name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span>{name}</span>
                </div>
              )}
              {displayName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Display Name</span>
                  <span>{displayName}</span>
                </div>
              )}
              {nip05 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">NIP-05</span>
                  <span>{nip05}</span>
                </div>
              )}
              {about && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">About</span>
                  <span className="text-right truncate max-w-[150px]">{about}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              No profile set. Click "Edit Profile" to add your name, bio, and avatar.
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 w-full mt-auto pt-4">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => props.onRefresh(false)}
          >
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
