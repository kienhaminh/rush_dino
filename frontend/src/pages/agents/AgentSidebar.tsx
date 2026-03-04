import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { SearchIcon } from 'lucide-react';

interface AgentSidebarProps {
  agents: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  loading: boolean;
}

export function AgentSidebar({ agents, selectedId, onSelect, loading }: AgentSidebarProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return agents;
    return agents.filter(
      (agent) => agent.name.toLowerCase().includes(term) || agent.id.toLowerCase().includes(term),
    );
  }, [agents, search]);

  return (
    <div className="w-[280px] flex-shrink-0 h-full flex flex-col border-r border-border bg-card/40">
      {/* Sidebar Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/50 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Agent Directory
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{agents.length} configured</p>
          </div>
          {loading && (
            <span className="text-[10px] text-muted-foreground animate-pulse">Loading…</span>
          )}
        </div>

        {/* Search Filter */}
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search agents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs rounded-md border border-border bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all"
          />
        </div>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {search ? 'No agents match your search.' : 'No agents found.'}
          </div>
        ) : (
          <div className="flex flex-col py-1">
            {filtered.map((agent) => {
              const isSelected = selectedId === agent.id;
              return (
                <button
                  key={agent.id}
                  onClick={() => onSelect(agent.id)}
                  className={`flex gap-3 items-center px-4 py-3 text-left transition-colors hover:bg-muted/40 relative ${
                    isSelected ? 'bg-muted/60' : ''
                  }`}
                >
                  {/* Active indicator */}
                  {isSelected && (
                    <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-primary rounded-r" />
                  )}

                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-base border flex-shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-secondary border-border/50'
                    }`}
                  >
                    {agent.emoji || '🤖'}
                  </div>

                  <div className="flex-1 overflow-hidden">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {agent.name}
                      {agent.isDefault && (
                        <Badge variant="secondary" className="text-[9px] h-3.5 px-1 leading-none">
                          Default
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate font-mono mt-0.5">
                      {agent.id}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
