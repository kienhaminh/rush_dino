import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, SearchIcon } from 'lucide-react';
import type { WorkflowListItem } from './workflow-types';
import { Badge } from '@/components/ui/badge';

interface WorkflowSidebarProps {
  workflows: WorkflowListItem[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}

export function WorkflowSidebar({
  workflows,
  selectedId,
  loading,
  onSelect,
}: WorkflowSidebarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = workflows.find((w) => w.id === selectedId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workflows;
    return workflows.filter(
      (item) => item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
    );
  }, [query, workflows]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleSelect(id: string) {
    onSelect(id);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`h-8 pl-3 pr-2.5 rounded-md border text-xs font-medium flex items-center gap-2 transition-colors ${
          open
            ? 'bg-muted border-border text-foreground'
            : 'bg-background/70 border-border/60 hover:bg-muted/40 text-foreground'
        }`}
      >
        <span className="max-w-[160px] truncate">
          {selected ? selected.name : 'Workflows'}
        </span>
        {workflows.length > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            ({workflows.length})
          </span>
        )}
        <ChevronDownIcon
          className={`w-3 h-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 z-50 w-[300px] rounded-xl border border-border/60 bg-card shadow-xl overflow-hidden"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
        >
          {/* Panel header */}
          <div className="px-3 py-2.5 border-b border-border/50">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Workflows
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{workflows.length} total</p>
          </div>

          {/* Search */}
          <div className="px-2 py-2 border-b border-border/30">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search workflows..."
                autoFocus
                className="w-full h-7 pl-8 pr-2 rounded-md border border-border/50 bg-background/60 text-xs outline-none focus:border-border transition-colors"
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-[340px] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-4 text-xs text-muted-foreground">Loading workflows...</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-4 text-xs text-muted-foreground">No workflows found.</div>
            ) : (
              <ul className="py-1">
                {filtered.map((workflow) => {
                  const isSelected = workflow.id === selectedId;
                  return (
                    <li key={workflow.id}>
                      <button
                        onClick={() => handleSelect(workflow.id)}
                        className={`w-full text-left px-3 py-2.5 border-l-2 transition-colors ${
                          isSelected
                            ? 'bg-muted/60 border-l-primary'
                            : 'border-l-transparent hover:bg-muted/30'
                        }`}
                      >
                        <div className="text-sm font-semibold truncate">{workflow.name}</div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {workflow.description}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                            {workflow.source}
                          </Badge>
                          <Badge
                            variant={workflow.status === 'active' ? 'secondary' : 'outline'}
                            className="text-[9px] px-1 py-0 h-3.5"
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
        </div>
      )}
    </div>
  );
}
