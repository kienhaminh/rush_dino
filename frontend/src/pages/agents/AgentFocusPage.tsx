// AgentFocusPage — stub for Phase 2 (orbital canvas per-agent view)
// Will be fully implemented in Phase 2 of the agent canvas redesign.
import { useParams, Link } from 'react-router-dom';

export function AgentFocusPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <p className="text-sm text-muted-foreground">
        Agent focus view for <span className="font-mono text-foreground">{id}</span> — coming in Phase 2.
      </p>
      <Link
        to="/agents"
        className="text-xs underline text-muted-foreground hover:text-foreground"
      >
        Back to overview
      </Link>
    </div>
  );
}

export default AgentFocusPage;
