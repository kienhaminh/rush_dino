import { cn } from '@/lib/utils';
import { WORKSPACE_ITEM, SIDEBAR_GROUPS, type SidebarItem } from '@/lib/navigation';
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDashboardAuth } from '@/hooks/use-dashboard-auth';

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function isItemActive(item: SidebarItem, pathname: string): boolean {
  if (item.matchPrefix === null) {
    // /chat redirects to / in the router, so only exact / match is needed
    return pathname === '/';
  }
  return pathname.startsWith(item.matchPrefix);
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const location = useLocation();
  const { enabled, logout } = useDashboardAuth();

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const renderItem = (item: SidebarItem) => {
    const Icon = item.icon;
    const active = isItemActive(item, location.pathname);

    if (collapsed) {
      return (
        <button
          key={item.id}
          onClick={() => navigate(item.href)}
          title={item.label}
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
        key={item.id}
        onClick={() => navigate(item.href)}
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
            active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
          )}
        />
        <span className="truncate">{item.label}</span>
      </button>
    );
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
        {/* Standalone Workspace */}
        <div className="space-y-0.5">
          {renderItem(WORKSPACE_ITEM)}
        </div>

        {/* Groups */}
        {SIDEBAR_GROUPS.map((group) => {
          const isCollapsed = collapsedGroups[group.label] ?? false;
          const hasActive = group.items.some((item) => isItemActive(item, location.pathname));
          const showItems = !isCollapsed || hasActive;

          return (
            <div key={group.label} className="space-y-1">
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex items-center justify-between w-full px-2 py-1.5 text-[9px] tracking-[0.15em] text-muted-foreground/60 uppercase hover:text-foreground transition-colors group"
                >
                  <span>{group.label}</span>
                  {isCollapsed && !hasActive ? (
                    <ChevronRight size={10} className="opacity-50" />
                  ) : (
                    <ChevronDown size={10} className="opacity-50" />
                  )}
                </button>
              )}
              {(showItems || collapsed) && (
                <div className="space-y-0.5">
                  {group.items.map(renderItem)}
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
