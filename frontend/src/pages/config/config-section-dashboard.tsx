import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSidebarMode } from '@/hooks/use-sidebar-mode';

export function ConfigSectionDashboard() {
  const { isAdvanced, setMode } = useSidebarMode();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="advanced-mode" className="text-sm font-medium">
            Advanced Mode
          </Label>
          <p className="text-xs text-muted-foreground">
            Show all sidebar menus including system tools, workflows, and monitoring. When off, only
            essential items (Workspace, Agents, Config) are visible.
          </p>
        </div>
        <Switch
          id="advanced-mode"
          checked={isAdvanced}
          onCheckedChange={(checked) => setMode(checked ? 'advanced' : 'light')}
        />
      </div>
    </div>
  );
}
