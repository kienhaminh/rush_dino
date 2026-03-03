import { MessageList } from '@/components/chat/message-list';
import { ChatInput } from '@/components/chat/chat-input';
import { useWebSocket } from '@/hooks/use-websocket';

export function ChatPage() {
  // Use a null ID for a single unified conversation stream, or an established default
  const activeId = null;
  const { messages, sendMessage, isConnected, isStreaming } = useWebSocket(activeId);

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden bg-background relative">
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 scrollbar-thin h-full">
          <div className="max-w-3xl mx-auto space-y-8 min-h-full flex flex-col justify-end">
            <MessageList messages={messages} />
          </div>
        </div>

        {/* Input area */}
        <div className="p-4 md:p-6 pb-8">
          <div className="max-w-3xl mx-auto">
            <ChatInput onSend={sendMessage} disabled={isStreaming || !isConnected} />
          </div>
        </div>
      </div>
    </div>
  );
}
