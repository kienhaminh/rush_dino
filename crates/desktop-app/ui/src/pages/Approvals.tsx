import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'

import {
  listApprovals,
  resolveApproval,
  type ApprovalQueueItem,
} from '@/api/approvals'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { PageTopbar } from '@/components/shell/PageTopbar'
import { Skeleton } from '@/components/Skeleton'

// Card surface — page-extras.css `.approval-card` (padding + flex stack).
const APPROVAL_CARD_CLASSES =
  'flex flex-col gap-2.5 px-[22px] py-[18px]'
// Header row — wraps a yellow tool pill and the conv/run IDs.
const APPROVAL_HEAD_CLASSES =
  'flex flex-wrap items-center justify-between gap-3'
// Yellow tool pill — `rgba(245,193,24,0.14)` has no token; arbitrary value.
const APPROVAL_TOOL_CLASSES =
  'font-mono text-[11px] tracking-[0.04em] text-warning bg-[rgba(245,193,24,0.14)] rounded-full px-[9px] py-[3px]'
// Mono ID line.
const APPROVAL_IDS_CLASSES = 'font-mono text-[10px] text-text-dim'
// JSON args block — fixed-height scroller on bg-base with strong border.
const APPROVAL_ARGS_CLASSES =
  'm-0 px-3 py-2.5 max-h-[220px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11.5px] text-text-muted bg-bg-base border border-border-strong rounded-md'
// Footer button row.
const APPROVAL_ACTIONS_CLASSES = 'flex justify-end gap-2.5'
// Pill button — shared base + variant. Mirrors page-extras `.approval-btn`.
const APPROVAL_BTN_BASE =
  'inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md border font-sans text-xs uppercase tracking-[0.05em] cursor-pointer transition-[background-color,border-color] duration-[140ms] ease-ease-cubic disabled:opacity-40 disabled:cursor-default'
const APPROVAL_BTN_DENY =
  'text-error border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.08)] hover:enabled:bg-[rgba(248,113,113,0.18)]'
const APPROVAL_BTN_APPROVE =
  'font-semibold text-bg-base bg-teal-400 border-teal-400 hover:enabled:bg-teal-300 hover:enabled:border-teal-300'

export default function Approvals() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['approvals'],
    queryFn: listApprovals,
    refetchInterval: 3000,
  })
  const resolve = useMutation({
    mutationFn: ({ requestId, sessionId, approved }: { requestId: string; sessionId: string; approved: boolean }) =>
      resolveApproval(requestId, sessionId, approved),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }),
  })

  const count = q.data?.length ?? 0

  return (
    <div className="page--framed">
      <PageTopbar
        eyebrow="Human loop"
        title="Approvals"
        actions={
          count > 0 ? (
            <span className="pill">
              <span className="status-dot status-dot--warn status-dot--pulse" />
              {count} waiting
            </span>
          ) : undefined
        }
      />
      <div className="page__body">
        {!q.isLoading && q.data && q.data.length === 0 && (
          <GlassPanel variant="compact">
            <p className="kg-hint">Queue is clear. Nothing waiting.</p>
          </GlassPanel>
        )}

        <ul className="list-none m-0 p-0 flex flex-col gap-3">
          {q.isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <li key={i}>
                  <GlassPanel variant="body" className={APPROVAL_CARD_CLASSES}>
                    <header className={APPROVAL_HEAD_CLASSES}>
                      <Skeleton width={84} height={14} rounded />
                      <Skeleton width={160} height={10} />
                    </header>
                    <Skeleton width="100%" height={56} />
                    <footer className={APPROVAL_ACTIONS_CLASSES}>
                      <Skeleton width={72} height={28} rounded />
                      <Skeleton width={90} height={28} rounded />
                    </footer>
                  </GlassPanel>
                </li>
              ))
            : q.data?.map((item) => (
                <ApprovalCard
                  key={item.requestId}
                  item={item}
                  busy={resolve.isPending}
                  onApprove={() =>
                    resolve.mutate({ requestId: item.requestId, sessionId: item.sessionId, approved: true })
                  }
                  onDeny={() =>
                    resolve.mutate({ requestId: item.requestId, sessionId: item.sessionId, approved: false })
                  }
                />
              ))}
        </ul>
      </div>
    </div>
  )
}

function ApprovalCard({
  item,
  busy,
  onApprove,
  onDeny,
}: {
  item: ApprovalQueueItem
  busy: boolean
  onApprove: () => void
  onDeny: () => void
}) {
  return (
    <li>
      <GlassPanel variant="body" className={APPROVAL_CARD_CLASSES}>
        <header className={APPROVAL_HEAD_CLASSES}>
          <span className={APPROVAL_TOOL_CLASSES}>{item.tool}</span>
          <span className={APPROVAL_IDS_CLASSES}>
            conv {item.conversationId.slice(0, 8)}… · run {item.runId?.slice(0, 8) ?? '—'}
          </span>
        </header>
        <pre className={APPROVAL_ARGS_CLASSES}>{JSON.stringify(item.args, null, 2)}</pre>
        <footer className={APPROVAL_ACTIONS_CLASSES}>
          <button
            type="button"
            className={`${APPROVAL_BTN_BASE} ${APPROVAL_BTN_DENY}`}
            onClick={onDeny}
            disabled={busy}
          >
            <X size={13} strokeWidth={2} /> deny
          </button>
          <button
            type="button"
            className={`${APPROVAL_BTN_BASE} ${APPROVAL_BTN_APPROVE}`}
            onClick={onApprove}
            disabled={busy}
          >
            <Check size={13} strokeWidth={2} /> approve
          </button>
        </footer>
      </GlassPanel>
    </li>
  )
}
