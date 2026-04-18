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

        <ul className="approvals-list">
          {q.isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <li key={i}>
                  <GlassPanel variant="body" className="approval-card">
                    <header className="approval-card__head">
                      <Skeleton width={84} height={14} rounded />
                      <Skeleton width={160} height={10} />
                    </header>
                    <Skeleton width="100%" height={56} />
                    <footer className="approval-card__actions">
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
      <GlassPanel variant="body" className="approval-card">
        <header className="approval-card__head">
          <span className="approval-card__tool mono">{item.tool}</span>
          <span className="approval-card__ids mono">
            conv {item.conversationId.slice(0, 8)}… · run {item.runId?.slice(0, 8) ?? '—'}
          </span>
        </header>
        <pre className="approval-card__args mono">{JSON.stringify(item.args, null, 2)}</pre>
        <footer className="approval-card__actions">
          <button type="button" className="approval-btn approval-btn--deny" onClick={onDeny} disabled={busy}>
            <X size={13} strokeWidth={2} /> deny
          </button>
          <button type="button" className="approval-btn approval-btn--approve" onClick={onApprove} disabled={busy}>
            <Check size={13} strokeWidth={2} /> approve
          </button>
        </footer>
      </GlassPanel>
    </li>
  )
}
