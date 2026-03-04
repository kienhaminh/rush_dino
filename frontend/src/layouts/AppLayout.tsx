import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/sidebar/sidebar';
import { ThemeToggle } from '@/components/sidebar/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { type Tab, TAB_LABELS, TAB_DESCRIPTIONS } from '@/lib/navigation';
import { useWsStatus } from '@/hooks/use-ws-status';

/**
 * Maps the current URL pathname to the active Tab value.
 * "/" maps to "chat" (the default route).
 */
function pathToTab(pathname: string): Tab {
  const segment = pathname.replace(/^\//, '').split('/')[0];
  const knownTabs: Tab[] = [
    'chat',
    'agent-board',
    'overview',
    'channels',
    'instances',
    'sessions',
    'usage',
    'cron',
    'skills',
    'nodes',
    'agents',
    'workflows',
    'config',
    'debug',
    'logs',
  ];
  return knownTabs.includes(segment as Tab) ? (segment as Tab) : 'chat';
}

export function AppLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const location = useLocation();
  const activeTab = pathToTab(location.pathname);
  const { isConnected } = useWsStatus();

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-body text-foreground">
      {/* Primary Sidebar */}
      <Sidebar
        activeTab={activeTab}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((v) => !v)}
      />

      {/* Workspace Area */}
      <div className="flex flex-1 min-w-0 overflow-hidden relative">
        <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
          {/* Main Topbar */}
          <header className="h-[72px] flex items-center justify-between px-6 border-b border-border/40 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <h2 className="font-display font-bold text-lg tracking-tight uppercase leading-none">
                  {TAB_LABELS[activeTab]}
                </h2>
                <span className="text-muted-foreground text-[10px] mt-1 tracking-wide uppercase">
                  {TAB_DESCRIPTIONS[activeTab]}
                </span>
              </div>
              {activeTab === 'chat' && (
                <Badge
                  variant={isConnected ? 'secondary' : 'destructive'}
                  className="h-5 px-1.5 text-[10px] uppercase tracking-widest font-bold"
                >
                  {isConnected ? 'Connected' : 'Disconnected'}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs ring-1 ring-primary/20 shadow-sm cursor-pointer hover:bg-primary/20 transition-colors">
                KH
              </div>
            </div>
          </header>

          {/* Page content rendered by router */}
          <div className="flex-1 overflow-hidden relative flex">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
