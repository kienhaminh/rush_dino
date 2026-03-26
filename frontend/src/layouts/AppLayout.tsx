import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { Sidebar } from '@/components/sidebar/sidebar';
import { ThemeToggle } from '@/components/sidebar/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { resolvePageHeader } from '@/lib/dashboard-routes';
import { useWsStatus } from '@/hooks/use-ws-status';

export function AppLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const location = useLocation();
  const shellView = resolvePageHeader(location.pathname);
  const { isConnected } = useWsStatus();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background font-body text-foreground">
      <Sidebar
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((value) => !value)}
      />

      <div className="relative flex min-w-0 flex-1 overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <header className="sticky top-0 z-10 flex h-[72px] shrink-0 items-center justify-between border-b border-border/40 bg-background/85 px-6 backdrop-blur-md">
            <div className="flex min-w-0 items-center gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-lg font-bold uppercase leading-none tracking-tight">
                    {shellView.title}
                  </h2>
                  {shellView.detail ? (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase">
                      {shellView.detail}
                    </Badge>
                  ) : null}
                  {shellView.id === 'workspace' ? (
                    <Badge
                      variant="outline"
                      className={`h-5 px-1.5 text-[10px] uppercase tracking-widest font-bold ${
                        isConnected
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                          : 'border-red-500/40 bg-red-500/10 text-red-400'
                      }`}
                    >
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {shellView.subtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/20 shadow-sm transition-colors hover:bg-primary/20">
                KH
              </div>
            </div>
          </header>

          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
