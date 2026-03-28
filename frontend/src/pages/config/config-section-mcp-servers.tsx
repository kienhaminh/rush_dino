'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchMcpStatus } from '@/lib/api';
import type { AppConfigView, McpServerConfig, McpServerStatus } from '@/lib/types';

interface Props {
  config: AppConfigView;
  onConfigChange: (patch: Partial<AppConfigView>) => void;
}

export function ConfigSectionMcpServers({ config, onConfigChange }: Props) {
  const servers = config.mcp_servers ?? [];

  const [statuses, setStatuses] = useState<McpServerStatus[]>([]);
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  // Track per-row edit state so changes don't clobber each other
  const [editValues, setEditValues] = useState<Record<string, McpServerConfig>>({});
  const [newServer, setNewServer] = useState({ name: '', url: '', auth_header: '' });

  // Poll MCP status every 5s so status dots stay fresh
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const data = await fetchMcpStatus();
        if (mounted) setStatuses(data);
      } catch {
        // Silently ignore — server may not be running yet
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  function getStatus(name: string): McpServerStatus | undefined {
    return statuses.find((s) => s.name === name);
  }

  /** Render a small coloured status dot for a given server name. */
  function statusDot(name: string) {
    const s = getStatus(name);
    if (!s) return <span className="w-2 h-2 rounded-full bg-muted flex-shrink-0" />;
    if (s.status.kind === 'connected')
      return (
        <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0 shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
      );
    if (s.status.kind === 'connecting')
      return <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />;
    return (
      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
    );
  }

  /** Short inline label shown on the collapsed row (tool count or error state). */
  function statusLabel(name: string): React.ReactNode {
    const s = getStatus(name);
    if (!s) return null;
    if (s.status.kind === 'connected')
      return (
        <span className="text-[10px] text-muted-foreground">{s.tool_count} tools</span>
      );
    if (s.status.kind === 'connecting')
      return <span className="text-[10px] text-muted-foreground">connecting…</span>;
    return <span className="text-[10px] text-red-400">unreachable</span>;
  }

  /** Footer text shown in the expanded row when the server is connected. */
  function lastSeenLabel(name: string): string {
    const s = getStatus(name);
    if (!s || s.status.kind !== 'connected' || s.last_seen_secs == null) return '';
    return `Connected · last seen ${s.last_seen_secs}s ago`;
  }

  function toggleExpand(name: string) {
    if (expandedName === name) {
      setExpandedName(null);
    } else {
      setExpandedName(name);
      // Seed the edit buffer with the current saved values so the user starts with real data
      const srv = servers.find((s) => s.name === name);
      if (srv) setEditValues((prev) => ({ ...prev, [name]: { ...srv } }));
    }
  }

  function saveEdit(name: string) {
    const edited = editValues[name];
    if (!edited) return;
    const updated = servers.map((s) => (s.name === name ? edited : s));
    onConfigChange({ mcp_servers: updated });
  }

  function deleteServer(name: string) {
    onConfigChange({ mcp_servers: servers.filter((s) => s.name !== name) });
    if (expandedName === name) setExpandedName(null);
  }

  function addServer() {
    if (!newServer.name.trim() || !newServer.url.trim()) return;
    const entry: McpServerConfig = {
      name: newServer.name.trim(),
      url: newServer.url.trim(),
      auth_header: newServer.auth_header.trim() || null,
    };
    onConfigChange({ mcp_servers: [...servers, entry] });
    setNewServer({ name: '', url: '', auth_header: '' });
    setShowAddForm(false);
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">MCP Servers</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            External MCP servers connected via SSE. Tools are available to all agents automatically.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs shrink-0"
          onClick={() => setShowAddForm(true)}
        >
          + Add Server
        </Button>
      </div>

      {/* Server list */}
      <div className="flex flex-col gap-1.5">
        {servers.map((srv) => {
          const isExpanded = expandedName === srv.name;
          // Fall back to the saved values when not yet edited
          const edit = editValues[srv.name] ?? srv;
          return (
            <div
              key={srv.name}
              className={`rounded-md border overflow-hidden ${
                isExpanded
                  ? 'border-primary/40 bg-primary/[0.03]'
                  : 'border-border/50'
              }`}
            >
              {/* Collapsed row header — click to expand */}
              <div
                className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer select-none"
                onClick={() => toggleExpand(srv.name)}
              >
                {statusDot(srv.name)}
                <span className="text-sm font-semibold flex-1">{srv.name}</span>
                {statusLabel(srv.name)}
                <span className="text-[10px] text-muted-foreground/50">
                  {isExpanded ? '▾' : '▸'}
                </span>
              </div>

              {/* Expanded edit body */}
              {isExpanded && (
                <div className="px-4 py-3 border-t border-border/50 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        URL
                      </Label>
                      <Input
                        value={edit.url}
                        onChange={(e) =>
                          setEditValues((prev) => ({
                            ...prev,
                            [srv.name]: { ...edit, url: e.target.value },
                          }))
                        }
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Auth Header{' '}
                        <span className="text-muted-foreground/50 normal-case">(optional)</span>
                      </Label>
                      <Input
                        type="password"
                        value={edit.auth_header ?? ''}
                        placeholder="Bearer ..."
                        onChange={(e) =>
                          setEditValues((prev) => ({
                            ...prev,
                            [srv.name]: {
                              ...edit,
                              auth_header: e.target.value || null,
                            },
                          }))
                        }
                        className="text-xs"
                      />
                    </div>
                  </div>

                  {/* Footer: last-seen info + action buttons */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground/50">
                      {lastSeenLabel(srv.name)}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => saveEdit(srv.name)}
                      >
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 text-muted-foreground"
                        onClick={() => deleteServer(srv.name)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Inline add-server form */}
        {showAddForm && (
          <div className="rounded-md border border-dashed border-border/50 p-4 flex flex-col gap-3">
            <p className="text-xs font-semibold text-muted-foreground">New Server</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Name</Label>
                <Input
                  placeholder="e.g. browser"
                  value={newServer.name}
                  onChange={(e) => setNewServer((prev) => ({ ...prev, name: e.target.value }))}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">SSE URL</Label>
                <Input
                  placeholder="http://localhost:3300/sse"
                  value={newServer.url}
                  onChange={(e) => setNewServer((prev) => ({ ...prev, url: e.target.value }))}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  Auth Header <span className="opacity-50">(optional)</span>
                </Label>
                <Input
                  placeholder="Bearer ..."
                  value={newServer.auth_header}
                  onChange={(e) =>
                    setNewServer((prev) => ({ ...prev, auth_header: e.target.value }))
                  }
                  className="text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={addServer}
              >
                Connect
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 text-muted-foreground/50"
                onClick={() => {
                  setShowAddForm(false);
                  setNewServer({ name: '', url: '', auth_header: '' });
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
