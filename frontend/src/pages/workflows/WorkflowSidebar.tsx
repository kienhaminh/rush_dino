import { useMemo, useState } from 'react';
import { SearchIcon, PlusIcon } from 'lucide-react';
import type { WorkflowListItem } from './workflow-types';
import { Badge } from '@/components/ui/badge';

interface WorkflowSidebarProps {
  workflows: WorkflowListItem[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function WorkflowSidebar({
  workflows,
  selectedId,
  loading,
  onSelect,
  onCreate,
}: WorkflowSidebarProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workflows;
    return workflows.filter(
      (item) => item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
    );
  }, [query, workflows]);

  return (
    <aside className="w-[300px] h-full border-r border-border/50 bg-card/40 flex-shrink-0 flex flex-col">
      <div className="px-4 py-4 border-b border-border/50 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Workflows
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{workflows.length} total</p>
          </div>
          <button
            onClick={onCreate}
            className="h-8 px-2.5 rounded-md border border-border bg-background/70 hover:bg-background flex items-center gap-1.5 text-xs font-medium"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            New
          </button>
        </div>

        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search workflows..."
            className="w-full h-8 pl-8 pr-2 rounded-md border border-border bg-background/70 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading workflows...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No workflows found.</div>
        ) : (
          <ul className="py-1">
            {filtered.map((workflow) => {
              const selected = workflow.id === selectedId;
              return (
                <li key={workflow.id}>
                  <button
                    onClick={() => onSelect(workflow.id)}
                    className={`w-full text-left px-4 py-3 border-l-2 transition-colors ${
                      selected
                        ? 'bg-muted/60 border-l-primary'
                        : 'border-l-transparent hover:bg-muted/30'
                    }`}
                  >
                    <div className="text-sm font-semibold truncate">{workflow.name}</div>
                    <div className="text-xs text-muted-foreground truncate mt-1">{workflow.description}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {workflow.source}
                      </Badge>
                      <Badge
                        variant={workflow.status === 'active' ? 'secondary' : 'outline'}
                        className="text-[10px] px-1.5 py-0 h-4"
                      >
                        {workflow.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {workflow.stepCount} steps
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
