import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search as SearchIcon, MessageCircle, Users } from 'lucide-react'

import { listAgents, type AgentListItem } from '@/api/agents'
import { listConversations, type ConversationSummary } from '@/api/chat'
import { PageTopbar } from '@/components/shell/PageTopbar'

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
      <div className="page__body search-page">
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
    <li className="search-item">
      <Link to={`/agents/${encodeURIComponent(agent.id)}`} className="search-item__link">
        <span className="search-item__sigil">{agent.emoji || '•'}</span>
        <div className="search-item__body">
          <div className="search-item__title">{agent.name}</div>
          {agent.description && (
            <div className="search-item__desc">{agent.description}</div>
          )}
        </div>
        <span className="search-item__kind mono">agent</span>
      </Link>
    </li>
  )
}

function ConvoResult({ convo }: { convo: ConversationSummary }) {
  return (
    <li className="search-item">
      <Link to={`/?conversation=${encodeURIComponent(convo.id)}`} className="search-item__link">
        <MessageCircle size={14} strokeWidth={1.6} className="search-item__icon" />
        <div className="search-item__body">
          <div className="search-item__title">{convo.title || 'Untitled'}</div>
          <div className="search-item__desc mono">
            {convo.id.slice(0, 12)}…
            {convo.updated_at && ` · ${new Date(convo.updated_at).toLocaleString()}`}
          </div>
        </div>
        <span className="search-item__kind mono">chat</span>
      </Link>
    </li>
  )
}
