import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { ADVANCED_VIEWS } from '@/lib/dashboard-routes';
import { cn } from '@/lib/utils';

const BUILDER_VIEWS = ADVANCED_VIEWS.filter((view) => view.area === 'builder');

export function BuilderPage() {
  const location = useLocation();

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <aside className="w-[280px] shrink-0 overflow-y-auto border-r border-border/40 bg-card/35 px-4 py-5">
        <div className="space-y-2">
          <Badge variant="outline" className="text-[10px] uppercase tracking-[0.24em]">
            Builder
          </Badge>
          <p className="text-sm leading-6 text-muted-foreground">
            Agents, workflows, skills, and coding tools for building and managing your AI system.
          </p>
        </div>

        <div className="mt-6 space-y-1">
          {BUILDER_VIEWS.map((view) => {
            const active = location.pathname === view.href;
            return (
              <NavLink
                key={view.href}
                to={view.href}
                className={cn(
                  'block rounded-2xl border px-3 py-3 transition-colors',
                  active
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border/40 bg-background/65 text-foreground hover:bg-muted/30',
                )}
              >
                <div className="text-sm font-medium">{view.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{view.description}</div>
              </NavLink>
            );
          })}
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

export default BuilderPage;
