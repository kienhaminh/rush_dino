import React, { useEffect, useState } from 'react';
import { Terminal, RefreshCw, Clock, CheckCircle, XCircle, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcpSession {
  id: string;
  agentId: string;
  conversationId: string;
  status: 'active' | 'completed' | 'error';
  workingDir: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AcpSession['status'] }) {
  if (status === 'active') {
    return (
      <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">
        <Activity size={10} className="mr-1 animate-pulse" />
        Active
      </Badge>
    );
  }
  if (status === 'completed') {
    return (
      <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20">
        <CheckCircle size={10} className="mr-1" />
        Completed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/20">
      <XCircle size={10} className="mr-1" />
      Error
    </Badge>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ─── AcpSessionsPage ──────────────────────────────────────────────────────────

export function AcpSessionsPage() {
  const [sessions, setSessions] = useState<AcpSession[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/acp/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } catch (e) {
      console.error('Failed to fetch ACP sessions', e);
    } finally {
      setLoading(false);
    }
  };

  const handleTerminate = async (id: string) => {
    await fetch(`/api/acp/sessions/${id}`, { method: 'DELETE' });
    fetchSessions();
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-background overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-[72px] border-b border-border/40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary/10">
            <Terminal size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-sm">ACP Sessions</h1>
            <p className="text-[11px] text-muted-foreground">Active and recent coding-agent sessions</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchSessions} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-6">
        {sessions.length === 0 && !loading ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            No ACP sessions found.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Agent
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                    Started
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                    Working Dir
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Terminal size={13} className="text-muted-foreground shrink-0" />
                        <span className="font-mono text-xs font-medium">{session.agentId}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[120px]">
                        {session.id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={session.status} />
                      {session.error && (
                        <div className="text-[10px] text-red-500 mt-1 truncate max-w-[160px]">
                          {session.error}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock size={11} />
                        {relativeTime(session.startedAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[200px] block">
                        {session.workingDir}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {session.status === 'active' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-6 text-red-600 hover:text-red-700"
                          onClick={() => handleTerminate(session.id)}
                        >
                          Terminate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AcpSessionsPage;
