import { useEffect, useState } from 'react';

import { ChatInput } from './components/chat/chat-input';
import { MessageList } from './components/chat/message-list';
import { SettingsPage } from './components/settings/settings-page';
import { ConversationList } from './components/sidebar/conversation-list';
import { useConversations } from './hooks/use-conversations';
import { useWebSocket } from './hooks/use-websocket';
import { fetchConversation } from './lib/api';

export default function App() {
  const [tab, setTab] = useState<'chat' | 'settings'>('chat');
  const { conversations, activeId, setActiveId, deleteConversation, createNew, refresh } =
    useConversations();
  const { messages, sendMessage, clearMessages, isConnected, isStreaming } =
    useWebSocket(activeId);

  useEffect(() => {
    if (!activeId) {
      clearMessages();
      return;
    }

    fetchConversation(activeId)
      .then((data) => {
        clearMessages();
        data.messages.forEach(() => {
          // The websocket hook currently owns message state for streaming.
          // Existing history can be merged in a follow-up iteration.
        });
      })
      .catch(() => undefined);
  }, [activeId, clearMessages]);

  return (
    <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-4 p-4 md:grid-cols-[320px_1fr]">
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onDelete={async (id) => {
          await deleteConversation(id);
          await refresh();
        }}
        onNew={createNew}
      />

      <main className="flex min-h-[80vh] flex-col gap-3 rounded-2xl border border-ink/10 bg-white/40 p-4 backdrop-blur">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl text-ink">RushDino</h1>
            <p className="text-sm text-ink/70">{isConnected ? 'WebSocket connected' : 'Reconnecting...'}</p>
          </div>
          <div className="flex gap-2">
            <button
              className={`rounded-lg px-3 py-1 text-sm ${tab === 'chat' ? 'bg-ink text-white' : 'bg-white'}`}
              onClick={() => setTab('chat')}
              type="button"
            >
              Chat
            </button>
            <button
              className={`rounded-lg px-3 py-1 text-sm ${tab === 'settings' ? 'bg-ink text-white' : 'bg-white'}`}
              onClick={() => setTab('settings')}
              type="button"
            >
              Settings
            </button>
          </div>
        </header>

        {tab === 'chat' ? (
          <>
            <MessageList messages={messages} />
            <ChatInput onSend={sendMessage} disabled={isStreaming || !isConnected} />
          </>
        ) : (
          <SettingsPage />
        )}
      </main>
    </div>
  );
}
