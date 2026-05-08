import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search as SearchIcon, MessageCircle, Users } from 'lucide-react'

import { listAgents, type AgentListItem } from '@/api/agents'
import { listConversations, type ConversationSummary } from '@/api/chat'
import { PageTopbar } from '@/components/shell/PageTopbar'
import { cn } from '@/lib/cn'

// Shared search-item link layout (12 px gap, hover wash, theme-aware).
// Replaces the legacy `.search-item__link` BEM rule. The hover wash uses
// dark: + light defaults so it survives without theme-light overrides.
const SEARCH_LINK_CLASSES =
  'flex items-center gap-3 rounded-[8px] px-3.5 py-2.5 text-text-primary no-underline transition-colors hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.05)]'

const SEARCH_ITEM_TITLE = 'truncate font-sans text-sm text-text-primary'
const SEARCH_ITEM_DESC = 'truncate text-xs text-text-muted'
const SEARCH_ITEM_KIND =
  'shrink-0 rounded-pill border border-border-strong px-2 py-[3px] text-[10px] uppercase tracking-[0.12em] text-text-dim'

/**
 * Client-side fuzzy-ish search across conversations and agents. The server
 * doesn't yet expose a full-text endpoint, so this matches substrings in
 * the data we already pull for the sidebar — cheap, instant, and works
 * offline. A real /api/search endpoint can supersede this later.
 */
export default function Search() {
  const [query, setQuery] = useState('')

  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
    staleTime: 10_000,
  })
  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: listAgents,
    staleTime: 30_000,
  })

  const q = query.trim().toLowerCase()

  const matchedConvos = useMemo(() => {
    if (!conversations.data) return []
    if (!q) return conversations.data.slice(0, 20)
    return conversations.data.filter((c) =>
      (c.title ?? '').toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q),
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

  return (
    <div className="page--framed">
      <PageTopbar eyebrow="Browse" title="Search" />
      <div className="page__body mx-auto w-full max-w-[860px]">
        <div className="search-bar">
          <SearchIcon size={16} strokeWidth={1.7} className="search-bar__icon" />
          <input
            type="text"
            className="search-bar__input"
            placeholder="Search chats and agents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button
              type="button"
              className="search-bar__clear"
              onClick={() => setQuery('')}
              aria-label="Clear"
            >
              clear
            </button>
          )}
        </div>

        <p className="mx-0.5 mt-2.5 text-xs leading-[1.5] text-text-dim">
          Search matches cached chats and agent metadata already loaded in this desktop app. It is
          local filtering, not server-side full-text search.
        </p>

        {empty && (
          <p className="kg-hint">Nothing matches <span className="mono">{query}</span>.</p>
        )}

        {matchedAgents.length > 0 && (
          <section className="search-group">
            <h2 className="search-group__label">
              <Users size={13} strokeWidth={1.7} /> Agents
            </h2>
            <ul className="search-list">
              {matchedAgents.map((a) => (
                <AgentResult key={a.id} agent={a} />
              ))}
            </ul>
          </section>
        )}

        {matchedConvos.length > 0 && (
          <section className="search-group">
            <h2 className="search-group__label">
              <MessageCircle size={13} strokeWidth={1.7} /> Chats
              {q && (
                <span className="search-group__count mono">
                  {matchedConvos.length}
                </span>
              )}
            </h2>
            <ul className="search-list">
              {matchedConvos.map((c) => (
                <ConvoResult key={c.id} convo={c} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

function AgentResult({ agent }: { agent: AgentListItem }) {
  return (
    <li>
      <Link
        to={`/agents/${encodeURIComponent(agent.id)}`}
        className={SEARCH_LINK_CLASSES}
      >
        <span className="w-7 text-center text-[20px] leading-none">
          {agent.emoji || '•'}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className={SEARCH_ITEM_TITLE}>{agent.name}</div>
          {agent.description && (
            <div className={SEARCH_ITEM_DESC}>{agent.description}</div>
          )}
        </div>
        <span className={cn(SEARCH_ITEM_KIND, 'mono')}>agent</span>
      </Link>
    </li>
  )
}

function ConvoResult({ convo }: { convo: ConversationSummary }) {
  return (
    <li>
      <Link
        to={`/?conversation=${encodeURIComponent(convo.id)}`}
        className={SEARCH_LINK_CLASSES}
      >
        <MessageCircle
          size={14}
          strokeWidth={1.6}
          className="shrink-0 text-text-muted"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className={SEARCH_ITEM_TITLE}>{convo.title || 'Untitled'}</div>
          <div className={cn(SEARCH_ITEM_DESC, 'mono')}>
            {convo.id.slice(0, 12)}…
            {convo.updated_at && ` · ${new Date(convo.updated_at).toLocaleString()}`}
          </div>
        </div>
        <span className={cn(SEARCH_ITEM_KIND, 'mono')}>chat</span>
      </Link>
    </li>
  )
}

