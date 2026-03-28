// AgentFocusPage — stub for Phase 2 (orbital canvas per-agent view)
// Will be fully implemented in Phase 2 of the agent canvas redesign.
import { useParams, useNavigate } from 'react-router-dom';

export function AgentFocusPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <p className="text-sm text-muted-foreground">
        Agent focus view for <span className="font-mono text-foreground">{id}</span> — coming in Phase 2.
      </p>
      <button
        className="text-xs underline text-muted-foreground hover:text-foreground"
        onClick={() => navigate('/agents')}
      >
        Back to overview
      </button>
    </div>
  );
}

export default AgentFocusPage;
