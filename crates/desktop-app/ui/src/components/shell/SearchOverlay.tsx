import { useMemo, useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search as SearchIcon, MessageCircle, Users, X } from 'lucide-react'

import { listAgents, type AgentListItem } from '@/api/agents'
import { listConversations, type ConversationSummary } from '@/api/chat'
import { cn } from '@/lib/cn'

type Props = {
  open: boolean
  onClose: () => void
}

export function SearchOverlay({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
    staleTime: 10_000,
    enabled: open,
  })
  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: listAgents,
    staleTime: 30_000,
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 40)

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const q = query.trim().toLowerCase()

  const matchedConvos = useMemo(() => {
    if (!conversations.data) return []
    if (!q) return conversations.data.slice(0, 20)
    return conversations.data.filter(
      (c) => (c.title ?? '').toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    )
  }, [conversations.data, q])

  const matchedAgents = useMemo(() => {
    if (!agents.data) return []
    if (!q) return []
    return agents.data.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q) ||
        (a.workspace ?? '').toLowerCase().includes(q),
    )
  }, [agents.data, q])

  const empty = q.length > 0 && matchedConvos.length === 0 && matchedAgents.length === 0

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Search"
      className="fixed inset-0 z-[2000] flex items-start justify-center pt-[12vh] bg-[rgb(8_12_16_/_0.55)] backdrop-blur-[20px] backdrop-saturate-[1.3] animate-[rd-fade-up_160ms_var(--ease-cubic)]"
      onClick={onClose}
    >
      <div
        className="w-[min(600px,92vw)] bg-bg-panel border border-border-strong rounded-xl overflow-hidden shadow-[0_40px_80px_-30px_rgba(0,0,0,0.7)] animate-[rd-fade-up_200ms_var(--ease-cubic)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-[14px] border-b border-border-line">
          <SearchIcon size={16} strokeWidth={1.7} className="shrink-0 text-text-dim" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-0 outline-none text-text-primary font-sans text-[15px] tracking-[-0.01em] placeholder:text-text-dim"
            placeholder="Search chats and agents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear"
              className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-text-dim hover:text-text-primary transition-colors duration-[120ms]"
            >
              <X size={13} strokeWidth={2} />
            </button>
          ) : (
            <kbd className="shrink-0 font-mono text-[10px] text-text-muted border border-border-strong px-1.5 py-0.5 rounded tracking-[0.05em]">
              Esc
            </kbd>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {empty && (
            <p className="py-6 text-center font-sans text-[13px] text-text-dim">
              Nothing matches <span className="font-mono">{query}</span>.
            </p>
          )}

          {matchedAgents.length > 0 && (
            <section className="mb-1">
              <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1">
                <Users size={11} strokeWidth={1.7} className="text-text-dim" />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-bold text-text-dim">
                  Agents
                </span>
              </div>
              <ul className="flex flex-col gap-0.5">
                {matchedAgents.map((a) => (
                  <AgentResult key={a.id} agent={a} onClose={onClose} />
                ))}
              </ul>
            </section>
          )}

          {matchedConvos.length > 0 && (
            <section className="mb-1">
              <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1">
                <MessageCircle size={11} strokeWidth={1.7} className="text-text-dim" />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-bold text-text-dim">
                  Chats
                </span>
                {q && (
                  <span className="font-mono text-[10px] text-text-dim ml-1">
                    {matchedConvos.length}
                  </span>
                )}
              </div>
              <ul className="flex flex-col gap-0.5">
                {matchedConvos.map((c) => (
                  <ConvoResult key={c.id} convo={c} onClose={onClose} />
                ))}
              </ul>
            </section>
          )}

          {!q && !conversations.isLoading && matchedConvos.length === 0 && (
            <p className="py-6 text-center font-sans text-[13px] text-text-dim">No chats yet.</p>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border-line flex items-center gap-1.5">
          <span className="font-sans text-[11px] text-text-dim">
            Local search — cached data only
          </span>
        </div>
      </div>
    </div>
  )
}

const RESULT_ROW =
  'flex items-center gap-3 rounded-[8px] px-3 py-2.5 no-underline transition-colors duration-[120ms] hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.05)]'
const RESULT_TITLE = 'truncate font-sans text-[13.5px] text-text-primary'
const RESULT_DESC = 'truncate text-xs text-text-muted'
const RESULT_KIND =
  'shrink-0 rounded-full border border-border-strong px-2 py-[3px] text-[10px] uppercase tracking-[0.12em] text-text-dim font-mono'

function AgentResult({ agent, onClose }: { agent: AgentListItem; onClose: () => void }) {
  return (
    <li>
      <Link
        to={`/agents/${encodeURIComponent(agent.id)}`}
        className={RESULT_ROW}
        onClick={onClose}
      >
        <span className="w-7 text-center text-[18px] leading-none shrink-0">
          {agent.emoji || '•'}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className={RESULT_TITLE}>{agent.name}</div>
          {agent.description && <div className={RESULT_DESC}>{agent.description}</div>}
        </div>
        <span className={RESULT_KIND}>agent</span>
      </Link>
    </li>
  )
}

function ConvoResult({ convo, onClose }: { convo: ConversationSummary; onClose: () => void }) {
  return (
    <li>
      <Link
        to={`/?conversation=${encodeURIComponent(convo.id)}`}
        className={RESULT_ROW}
        onClick={onClose}
      >
        <MessageCircle size={14} strokeWidth={1.6} className="shrink-0 text-text-muted" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className={RESULT_TITLE}>{convo.title || 'Untitled'}</div>
          <div className={cn(RESULT_DESC, 'font-mono')}>
            {convo.id.slice(0, 12)}…
            {convo.updated_at && ` · ${new Date(convo.updated_at).toLocaleString()}`}
          </div>
        </div>
        <span className={RESULT_KIND}>chat</span>
      </Link>
    </li>
  )
}
