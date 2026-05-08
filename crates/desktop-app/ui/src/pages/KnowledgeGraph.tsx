import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, RefreshCw, Zap } from 'lucide-react'

import { getStats, searchFacts, triggerBackfill } from '@/api/graph'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { IridescentLine } from '@/components/glass/IridescentLine'
import { PageTopbar } from '@/components/shell/PageTopbar'
import { Skeleton } from '@/components/Skeleton'

export default function KnowledgeGraph() {
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')

  const stats = useQuery({ queryKey: ['graph', 'stats'], queryFn: getStats })
  const facts = useQuery({
    queryKey: ['graph', 'facts', submittedQuery],
    queryFn: () => searchFacts(submittedQuery, 30),
    enabled: submittedQuery.length > 0,
  })
  const backfill = useMutation({
    mutationFn: triggerBackfill,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['graph', 'stats'] }),
  })

  return (
    <div className="page--framed">
      <PageTopbar
        eyebrow="Graph"
        title="Knowledge Graph"
        actions={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => qc.invalidateQueries({ queryKey: ['graph', 'stats'] })}
              disabled={stats.isFetching}
            >
              <RefreshCw size={12} strokeWidth={1.8} /> refresh
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => backfill.mutate()}
              disabled={backfill.isPending}
            >
              <Zap size={12} strokeWidth={1.8} />
              {backfill.isPending ? 'backfilling…' : 'backfill'}
            </button>
          </>
        }
      />
      <div className="page__body">
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Sources" value={stats.data?.sources} />
          <StatCard label="Entities" value={stats.data?.entities} />
          <StatCard label="Relations" value={stats.data?.relations} />
          <StatCard label="Evidence" value={stats.data?.evidence} />
        </div>

        <GlassPanel
          variant="compact"
          className="flex flex-wrap items-center justify-between gap-4"
        >
          <form
            className="flex min-w-[280px] flex-1 basis-[320px] items-center gap-2.5"
            onSubmit={(e) => {
              e.preventDefault()
              setSubmittedQuery(query.trim())
            }}
          >
            <Search size={14} strokeWidth={1.8} className="shrink-0 text-text-dim" />
            <input
              type="text"
              className="min-w-0 flex-1 border-0 border-b border-border-strong bg-transparent px-0 py-1.5 font-sans text-sm text-text-primary outline-none transition-colors focus:border-b-teal-400"
              placeholder="e.g. rushdino server provider…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="btn">
              search
            </button>
          </form>
        </GlassPanel>

        <IridescentLine className="my-1" opacity={0.3} />

        <section className="flex flex-col gap-2.5">
          {!submittedQuery && (
            <p className="kg-hint">
              Enter a query above to see facts. The graph ranks by confidence × support.
            </p>
          )}
          {submittedQuery && facts.isLoading && (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <li
                  key={i}
                  className="rounded-md border border-border-strong bg-bg-panel px-4 py-3.5"
                >
                  <Skeleton width="80%" height={14} className="skeleton--line" />
                  <Skeleton width="50%" height={11} className="skeleton--line" />
                </li>
              ))}
            </ul>
          )}
          {submittedQuery && facts.data && facts.data.length === 0 && (
            <p className="kg-hint">No facts match this query yet.</p>
          )}
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {facts.data?.map((fact, i) => (
              <li
                key={`${fact.subject}-${fact.predicate}-${i}`}
                className="rounded-md border border-border-strong bg-bg-panel px-4 py-3.5 transition-colors duration-150 ease-ease-cubic hover:border-teal-line"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-3 text-sm text-text-primary">
                  <span className="font-semibold">{fact.subject}</span>
                  <span className="mono rounded-full bg-teal-soft px-2 py-0.5 text-[11px] text-teal-400">
                    —{fact.predicate}→
                  </span>
                  <span className="font-semibold">{fact.object}</span>
                </div>
                <div className="mono flex flex-wrap gap-3.5 text-[11px] text-text-dim">
                  <span>conf · {(fact.confidence ?? 0).toFixed(2)}</span>
                  <span>support · {fact.support_count ?? 0}</span>
                  {fact.evidence && fact.evidence[0] && (
                    <span className="max-w-[56ch] overflow-hidden text-ellipsis whitespace-nowrap italic text-text-muted">
                      {fact.evidence[0]}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value?: number }) {
  return (
    <GlassPanel
      variant="compact"
      className="!rounded-md !border-border-strong !bg-bg-panel !p-[12px_14px]"
    >
      <p className="mono m-0 mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-text-dim">
        {label}
      </p>
      {value === undefined ? (
        <Skeleton width={58} height={26} />
      ) : (
        <p className="m-0 font-sans text-[30px] font-bold leading-none tracking-[-0.02em] text-text-primary [font-feature-settings:'tnum'_1,'zero'_1]">
          {value.toLocaleString()}
        </p>
      )}
    </GlassPanel>
  )
}
