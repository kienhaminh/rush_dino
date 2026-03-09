import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { deleteConversation, fetchSessions } from '@/lib/api';
import type { SessionSummary } from '@/lib/types';

import { SessionsPage } from './SessionsPage';

export function SessionsRoute() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const next = await fetchSessions();
      setSessions(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm('Delete this conversation session? This cannot be undone.')) {
      return;
    }
    try {
      await deleteConversation(sessionId);
      toast.success('Session deleted.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete session.');
    }
  };

  return (
    <SessionsPage
      sessions={sessions}
      loading={loading}
      error={error}
      onRefresh={() => void load()}
      onDelete={(sessionId) => {
        void handleDelete(sessionId);
      }}
    />
  );
}
