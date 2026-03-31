// AgentsPage — entry point for /agents.
// Loads the agent list and redirects to the default agent (or first agent)
// so the user always lands on a focused orbital view.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgentsQuery } from '@/lib/queries';

export function AgentsPage() {
  const navigate = useNavigate();
  const { data: agents } = useAgentsQuery();

  useEffect(() => {
    if (!agents || agents.length === 0) return;
    const target = agents.find((a) => a.isDefault) ?? agents[0];
    navigate(`/agents/${target.id}`, { replace: true });
  }, [agents, navigate]);

  return (
    <div className="flex items-center justify-center h-full">
      <div
        className="w-6 h-6 rounded-full animate-spin"
        style={{
          border: '2px solid rgba(99,102,241,0.15)',
          borderTopColor: 'rgba(99,102,241,0.75)',
        }}
      />
    </div>
  );
}

export default AgentsPage;
