import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, RefreshCw } from 'lucide-react';

import { ConversationTimeline } from '@/components/workspace/conversation-timeline';
import { AgentBadge } from '@/components/workspace/agent-badge';
import { useWebSocket } from '@/hooks/use-websocket';
import { fetchConversations, fetchConversation } from '@/lib/api';
import { messagesToItems, formatConversationTime } from '@/lib/message-converter';
import type { Conversation } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Ref so the onChannelMessage callback can always read the latest selectedConvId
  const selectedConvIdRef = useRef<string | null>(null);
  selectedConvIdRef.current = selectedConvId;

  /**
   * Called when the gateway broadcasts a user_message from an external channel.
   * If we're not already viewing that conversation, switch to it.
   */
  const handleChannelMessage = useCallback(async (conversationId: string, _channel: string) => {
    try {
      const convs = await fetchConversations();
      setConversations(convs);
    } catch {
      /* ignore */
    }

    if (selectedConvIdRef.current !== conversationId) {
      setSelectedConvId(conversationId);
    }
  }, []);

  const { items, activeAgent, sendMessage, resetWithItems, isConnected, isStreaming } =
    useWebSocket(selectedConvId, handleChannelMessage);

  const prevIsStreamingRef = useRef(false);

  const loadConversations = useCallback(async () => {
    try {
      const convs = await fetchConversations();
      setConversations(convs);
      if (convs.length > 0 && selectedConvId === null) {
        selectConversation(convs[0].id, true);
      }
    } catch {
      /* ignore */
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadConversations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh sidebar after a stream ends (new messages may have arrived)
  useEffect(() => {
    if (prevIsStreamingRef.current && !isStreaming) {
      loadConversations();
    }
    prevIsStreamingRef.current = isStreaming;
  }, [isStreaming, loadConversations]);

  const selectConversation = useCallback(
    async (convId: string, skipIfSame = false) => {
      if (skipIfSame && convId === selectedConvId) return;
      setSelectedConvId(convId);
      setHistoryLoading(true);
      try {
        const detail = await fetchConversation(convId);
        resetWithItems(messagesToItems(detail.messages));
      } catch {
        resetWithItems([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [selectedConvId, resetWithItems],
  );

  const handleSendMessage = useCallback(() => {
    if (!inputValue.trim() || isStreaming) return;
    sendMessage(inputValue);
    setInputValue('');
  }, [inputValue, sendMessage, isStreaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-resize textarea as user types
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = '44px';
      const scrollHeight = textarea.scrollHeight;
      if (scrollHeight > 44) {
        textarea.style.height = `${Math.min(scrollHeight, 200)}px`;
      }
    }
  }, [inputValue]);

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden bg-background">
      {/* Conversation list sidebar */}
      <aside className="w-[260px] shrink-0 flex flex-col border-r border-border/40 bg-background/60">
        <div className="flex items-center justify-between px-3 py-3 border-b border-border/30">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            Conversations
          </span>
          <button
            onClick={loadConversations}
            className="p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => selectConversation(conv.id)}
              className={cn(
                'w-full flex flex-col gap-0.5 px-3 py-2.5 text-left transition-colors border-b border-border/10 last:border-0',
                selectedConvId === conv.id
                  ? 'bg-primary/[0.08] border-l-2 border-primary text-primary'
                  : 'hover:bg-muted/40 text-foreground/80',
              )}
            >
              <span className="text-[12px] font-medium truncate leading-tight">{conv.title}</span>
              <span className="text-[10px] text-muted-foreground/50">
                {formatConversationTime(conv.updated_at)}
              </span>
            </button>
          ))}

          {conversations.length === 0 && (
            <div className="px-4 py-8 text-center space-y-1">
              <p className="text-[11px] text-muted-foreground/40">No conversations yet</p>
              <p className="text-[10px] text-muted-foreground/30">
                Send a message via Telegram or another connected channel
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {isStreaming && (
          <div className="flex items-center gap-2 px-6 py-2 border-b border-border/20 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <span className="text-[11px] text-muted-foreground/50">Active agent:</span>
            <AgentBadge agent={activeAgent} isStreaming={isStreaming} />
          </div>
        )}

        {historyLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground/50 text-sm">
              <RefreshCw size={14} className="animate-spin" />
              <span>Loading conversation…</span>
            </div>
          </div>
        ) : (
          <ConversationTimeline items={items} />
        )}

        {/* Chat Input */}
        <div className="border-t border-border/10 bg-background/50 backdrop-blur-md p-4">
          <div className="max-w-3xl mx-auto flex gap-3 relative">
            <Textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="min-h-[44px] h-[44px] py-2.5 pr-12 resize-none rounded-xl bg-muted/30 border-border/20 focus-visible:ring-primary/20 overflow-hidden"
            />
            <Button
              size="icon"
              variant="default"
              className="absolute right-1.5 bottom-1.5 h-8 w-8 rounded-lg shadow-sm"
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isStreaming || !isConnected}
            >
              <Send size={16} />
            </Button>
          </div>
          <div className="max-w-3xl mx-auto flex justify-center mt-2">
            {!isConnected ? (
              <span className="text-[10px] text-muted-foreground/40 italic">
                Disconnected — reconnecting…
              </span>
            ) : isStreaming ? (
              <div className="flex items-center gap-1.5 bg-primary/[0.07] border border-primary/25 rounded-[18px] rounded-bl-[4px] px-3 py-2 shadow-sm">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground/30">
                Press Enter to send, Shift+Enter for new line
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
