import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';
import { useMessages } from './use-messages';

export function MessagesPage() {
  const { messages, loading, error, refresh } = useMessages(true);
  const unreadCount = messages.filter((m) => !m.read).length;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-[13px] font-semibold tracking-wide">Agent Messages</h1>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-[8px]">{unreadCount} unread</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} className="h-6 px-2 text-[9px]">
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
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="font-semibold">{msg.fromAgent}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-semibold">{msg.toAgent}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {!msg.read && <Badge variant="secondary" className="text-[7px] px-1">NEW</Badge>}
                  <span className="text-[8px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground leading-relaxed">{msg.content}</p>
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
