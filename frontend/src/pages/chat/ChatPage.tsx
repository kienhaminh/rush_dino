import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, RefreshCw } from 'lucide-react';

import { ConversationTimeline } from '@/components/workspace/conversation-timeline';
import { AgentBadge } from '@/components/workspace/agent-badge';
import { useWebSocket } from '@/hooks/use-websocket';
import { fetchConversation } from '@/lib/api';
import { messagesToItems } from '@/lib/message-converter';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const MAIN_SESSION_ID = 'main';

export function ChatPage() {
  const [historyLoading, setHistoryLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { items, activeAgent, sendMessage, resetWithItems, isConnected, isStreaming } =
    useWebSocket(MAIN_SESSION_ID, undefined);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const detail = await fetchConversation(MAIN_SESSION_ID);
      resetWithItems(messagesToItems(detail.messages));
    } catch {
      resetWithItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [resetWithItems]);

  useEffect(() => {
    loadHistory();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
              <span>Loading…</span>
            </div>
          </div>
        ) : (
          <ConversationTimeline items={items} isStreaming={isStreaming} />
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
