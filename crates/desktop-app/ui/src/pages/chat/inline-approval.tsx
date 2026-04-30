import type { PendingApproval } from '@/hooks/useChatStream'

/** Renders a tool-approval card that blocks the stream until the user decides. */
export function InlineApproval({
  approval,
  onDecide,
}: {
  approval: PendingApproval
  onDecide: (approved: boolean) => void
}) {
  return (
    <div className="msg msg--approval">
      <div className="approval-card">
        <div className="approval-card__head">
          <span className="approval-card__label">APPROVAL NEEDED</span>
          <span className="approval-card__tool rd-mono">{approval.tool}</span>
        </div>
        <p className="approval-card__prompt">
          The agent wants to run <code>{approval.tool}</code> with these arguments.
        </p>
        <pre className="approval-card__args rd-mono">{JSON.stringify(approval.args, null, 2)}</pre>
        <div className="approval-card__actions">
          <button type="button" className="btn" onClick={() => onDecide(false)}>
            Deny
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onDecide(true)}>
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}
