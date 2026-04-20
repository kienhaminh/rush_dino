import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';
import { useMessagesQuery } from '../../lib/queries';

export function MessagesPage() {
  const { data: messages = [], isPending: loading, error: queryError, refetch } = useMessagesQuery(true);
  const error = queryError?.message ?? null;
  const unreadCount = messages.filter((m) => !m.read).length;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-[13px] font-semibold tracking-wide">Agent Messages</h1>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-[8px]">{unreadCount} unread</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refetch()} className="h-6 px-2 text-[9px]">
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {loading && messages.length === 0 && (
        <p className="text-[10px] text-muted-foreground">Loading messages...</p>
      )}

      {error && (
        <p className="text-[10px] text-destructive">{error}</p>
      )}

      {!loading && messages.length === 0 && !error && (
        <p className="text-[10px] text-muted-foreground">No messages yet. Agents will send messages to each other during task execution.</p>
      )}

      <div className="flex flex-col gap-2">
        {messages.map((msg) => (
          <Card key={msg.id} className={msg.read ? 'opacity-60' : ''}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">From</span>
                  <span className="font-semibold">{msg.fromAgent}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-muted-foreground">To</span>
                  <span className="font-semibold">{msg.toAgent}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {msg.state !== 'processed' && (
                    <Badge variant="outline" className="text-[7px] px-1 uppercase">
                      {msg.state}
                    </Badge>
                  )}
                  {!msg.read && <Badge variant="secondary" className="text-[7px] px-1">NEW</Badge>}
                  <span className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground leading-relaxed">{msg.content}</p>
              {msg.failureReason && (
                <p className="mt-1 text-[8px] text-destructive">{msg.failureReason}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
