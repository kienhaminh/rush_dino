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
        <div className="kg-stats">
          <StatCard label="Sources" value={stats.data?.sources} />
          <StatCard label="Entities" value={stats.data?.entities} />
          <StatCard label="Relations" value={stats.data?.relations} />
          <StatCard label="Evidence" value={stats.data?.evidence} />
        </div>

        <GlassPanel variant="compact" className="kg-toolbar">
          <form
            className="kg-search"
            onSubmit={(e) => {
              e.preventDefault()
              setSubmittedQuery(query.trim())
            }}
          >
            <Search size={14} strokeWidth={1.8} className="kg-search__icon" />
            <input
              type="text"
              className="kg-search__input"
              placeholder="e.g. rushdino server provider…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="btn">
              search
            </button>
          </form>
        </GlassPanel>

        <IridescentLine className="kg-divider" opacity={0.3} />

        <section className="kg-facts">
          {!submittedQuery && (
            <p className="kg-hint">
              Enter a query above to see facts. The graph ranks by confidence × support.
            </p>
          )}
          {submittedQuery && facts.isLoading && (
            <ul className="kg-fact-list">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="kg-fact">
                  <Skeleton width="80%" height={14} className="skeleton--line" />
                  <Skeleton width="50%" height={11} className="skeleton--line" />
                </li>
              ))}
            </ul>
          )}
          {submittedQuery && facts.data && facts.data.length === 0 && (
            <p className="kg-hint">No facts match this query yet.</p>
          )}
          <ul className="kg-fact-list">
            {facts.data?.map((fact, i) => (
              <li key={`${fact.subject}-${fact.predicate}-${i}`} className="kg-fact">
                <div className="kg-fact__triple">
                  <span className="kg-fact__subject">{fact.subject}</span>
                  <span className="kg-fact__predicate">—{fact.predicate}→</span>
                  <span className="kg-fact__object">{fact.object}</span>
                </div>
                <div className="kg-fact__meta mono">
                  <span>conf · {(fact.confidence ?? 0).toFixed(2)}</span>
                  <span>support · {fact.support_count ?? 0}</span>
                  {fact.evidence && fact.evidence[0] && (
                    <span className="kg-fact__evidence">{fact.evidence[0]}</span>
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
    <GlassPanel variant="compact" className="kg-stat">
      <p className="kg-stat__label mono">{label}</p>
      {value === undefined ? (
        <Skeleton width={58} height={26} />
      ) : (
        <p className="metric-numeral kg-stat__value">{value.toLocaleString()}</p>
      )}
    </GlassPanel>
  )
}
