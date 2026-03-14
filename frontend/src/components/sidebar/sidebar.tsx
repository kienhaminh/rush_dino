import { cn } from '@/lib/utils';
import { TAB_GROUPS, TAB_ICONS, TAB_LABELS, type Tab } from '@/lib/navigation';
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardAuth } from '@/hooks/use-dashboard-auth';

interface SidebarProps {
  activeTab: Tab;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ activeTab, collapsed, onToggleCollapse }: SidebarProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const { enabled, logout } = useDashboardAuth();

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev: Record<string, boolean>) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const handleTabClick = (tab: Tab) => {
    navigate(tab === 'chat' ? '/' : `/${tab}`);
  };

  return (
    <aside
      className={cn(
        'flex flex-col bg-card border-r border-border transition-all duration-300 ease-in-out h-full shrink-0',
        collapsed ? 'w-[70px]' : 'w-[260px]',
      )}
    >
      {/* Brand / Header */}
      <div className="flex items-center justify-between px-4 h-[72px] border-b border-border/40 shrink-0 w-full">
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0 shadow-sm ring-1 ring-primary/20">
              <span className="font-bold text-lg">R</span>
            </div>
            <div className="flex flex-col justify-center">
              <span className="font-display font-bold text-sm tracking-tight truncate leading-none">
                RUSHDINO
              </span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-[0.2em] font-bold leading-none mt-1 opacity-60">
                Dashboard
              </span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="h-8 w-8 mx-auto flex items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
            <span className="font-bold text-lg">R</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-6 space-y-6 scrollbar-none">
        {TAB_GROUPS.map((group) => {
          const isCollapsed = collapsedGroups[group.label] || false;
          const hasActiveTab = group.tabs.some((tab: string) => tab === activeTab);
          const shouldShowItems = !isCollapsed || hasActiveTab;

          return (
            <div key={group.label} className="space-y-1">
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex items-center justify-between w-full px-2 py-1.5 text-[9px] tracking-[0.15em] text-muted-foreground/60 uppercase hover:text-foreground transition-colors group"
                >
                  <span>{group.label}</span>
                  {isCollapsed && !hasActiveTab ? (
                    <ChevronRight size={10} className="opacity-50" />
                  ) : (
                    <ChevronDown size={10} className="opacity-50" />
                  )}
                </button>
              )}

              {(shouldShowItems || hasActiveTab || collapsed) && (
                <div className="space-y-0.5">
                  {group.tabs.map((tab: string) => {
                    const Icon = TAB_ICONS[tab as Tab];
                    const active = activeTab === tab;

                    if (collapsed) {
                      return (
                        <button
                          key={tab}
                          onClick={() => handleTabClick(tab as Tab)}
                          title={TAB_LABELS[tab as Tab]}
                          className={cn(
                            'w-10 h-10 mx-auto flex items-center justify-center rounded-xl transition-all mb-1',
                            active
                              ? 'bg-primary text-primary-foreground shadow-md scale-105'
                              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                          )}
                        >
                          <Icon size={20} />
                        </button>
                      );
                    }

                    return (
                      <button
                        key={tab}
                        onClick={() => handleTabClick(tab as Tab)}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative',
                          active
                            ? 'border-l-2 border-primary text-primary bg-primary/[0.06]'
                            : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                        )}
                      >
                        <Icon
                          size={18}
                          className={cn(
                            'transition-colors',
                            active
                              ? 'text-primary'
                              : 'text-muted-foreground group-hover:text-foreground',
                          )}
                        />
                        <span className="truncate">{TAB_LABELS[tab as Tab]}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border/40 mt-auto shrink-0 bg-muted/30">
        {enabled ? (
          <button
            onClick={() => void logout()}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all mb-2"
          >
            <span>Log out</span>
          </button>
        ) : null}
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all"
        >
          {collapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <>
              <PanelLeftClose size={18} />
              <span>Collapse sidebar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
