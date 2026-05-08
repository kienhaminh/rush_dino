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
    <div className="flex flex-col font-sans">
      <div className="w-full p-4 bg-[rgb(245_193_24_/_0.08)] border border-[rgb(245_193_24_/_0.35)] rounded-lg flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-warning">
            APPROVAL NEEDED
          </span>
          <span className="rd-mono text-[11px] text-text-primary">{approval.tool}</span>
        </div>
        <p className="m-0 text-[13px] text-text-primary">
          The agent wants to run{' '}
          <code className="font-mono text-xs px-1.5 py-px bg-bg-card rounded text-warning">
            {approval.tool}
          </code>{' '}
          with these arguments.
        </p>
        <pre className="rd-mono m-0 px-2.5 py-2 bg-bg-base border border-border-line rounded-md text-[11px] text-text-muted max-h-[220px] overflow-auto whitespace-pre-wrap break-words">
          {JSON.stringify(approval.args, null, 2)}
        </pre>
        <div className="flex justify-end gap-2">
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
