import { useEffect, useState } from 'react';
import { Bot, Settings, Plus, LayoutDashboard, Menu as MenuIcon } from 'lucide-react';

import { ChatInput } from './components/chat/chat-input';
import { MessageList } from './components/chat/message-list';
import { SettingsPage } from './components/settings/settings-page';
import { ConversationList } from './components/sidebar/conversation-list';
import { Sidebar } from './components/sidebar/sidebar';
import { useConversations } from './hooks/use-conversations';
import { useWebSocket } from './hooks/use-websocket';
import { fetchConversation } from './lib/api';
import { type Tab, TAB_LABELS } from './lib/navigation';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from './lib/utils';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const { conversations, activeId, setActiveId, deleteConversation, createNew, refresh } =
    useConversations();
  const { messages, sendMessage, clearMessages, isConnected, isStreaming } = useWebSocket(activeId);

  useEffect(() => {
    if (!activeId) {
      clearMessages();
      return;
    }

    fetchConversation(activeId)
      .then((data) => {
        clearMessages();
      })
      .catch(() => undefined);
  }, [activeId, clearMessages]);

  return (
    <div className="flex h-screen w-full bg-neutral-50 overflow-hidden font-body text-foreground">
      {/* Primary Sidebar - The one from OpenClaw */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* Workspace Area */}
      <div className="flex flex-1 min-w-0 overflow-hidden relative">
        <main className="flex-1 flex flex-col min-w-0 bg-white shadow-sm border-l overflow-hidden">
          {/* Main Topbar */}
          <header className="h-[65px] flex items-center justify-between px-6 border-b shrink-0 bg-white/80 backdrop-blur-md sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <h2 className="font-display font-bold text-lg tracking-tight uppercase">
                {TAB_LABELS[activeTab]}
              </h2>
              {activeTab === 'chat' && (
                <Badge
                  variant={isConnected ? 'secondary' : 'destructive'}
                  className="h-5 px-1.5 text-[10px] uppercase tracking-widest font-bold"
                >
                  {isConnected ? 'Connected' : 'Disconnected'}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-4">
              {/* Search or other global actions could go here */}
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs ring-1 ring-primary/20 shadow-sm cursor-pointer hover:bg-primary/20 transition-colors">
                KH
              </div>
            </div>
          </header>

          {/* Dynamically Render Content based on activeTab */}
          <div className="flex-1 overflow-hidden relative flex">
            {activeTab === 'chat' && (
              <div className="flex flex-1 min-w-0 h-full">
                {/* Secondary Sidebar for Conversations */}
                <div className="w-[280px] border-r bg-muted/5 hidden lg:flex flex-col shrink-0">
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
                </div>

                {/* Chat Interface */}
                <div className="flex-1 flex flex-col min-w-0 relative">
                  <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
                    <div className="max-w-4xl mx-auto">
                      <MessageList messages={messages} />
                    </div>
                  </div>
                  <div className="p-4 md:p-6 border-t bg-white/50 backdrop-blur-sm">
                    <div className="max-w-3xl mx-auto">
                      <ChatInput onSend={sendMessage} disabled={isStreaming || !isConnected} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(activeTab === 'config' || activeTab === ('settings' as any)) && (
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="max-w-4xl mx-auto w-full">
                  <SettingsPage />
                </div>
              </div>
            )}

            {/* Default Placeholder for other tabs */}
            {activeTab !== 'chat' &&
              activeTab !== 'config' &&
              activeTab !== ('settings' as any) && (
                <div className="flex-1 flex items-center justify-center p-12 text-center">
                  <div className="max-w-md space-y-4">
                    <div className="h-16 w-16 bg-muted/20 rounded-2xl flex items-center justify-center mx-auto text-muted-foreground/30">
                      <Bot size={32} />
                    </div>
                    <h3 className="text-xl font-bold tracking-tight">{TAB_LABELS[activeTab]}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      This view is currently being migrated from the OpenClaw architecture. The
                      underlying logic is available in{' '}
                      <code className="bg-muted px-1 rounded text-xs">
                        src/pages/{activeTab}.ts
                      </code>
                      .
                    </p>
                  </div>
                </div>
              )}
          </div>
        </main>
      </div>
    </div>
  );
}
