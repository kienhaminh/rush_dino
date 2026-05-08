import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink, useSearchParams } from 'react-router-dom'
import {
  Sparkles,
  Lock,
  Server,
  Search,
  Plus,
  ExternalLink,
  Puzzle,
} from 'lucide-react'

import { listSkills, type SkillRecord } from '@/api/skills'
import { getConfig } from '@/api/config'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { SkeletonCard } from '@/components/Skeleton'
import { cn } from '@/lib/cn'

type Tab = 'plugins' | 'skills'

type McpServer = {
  name?: string
  url?: string
  enabled?: boolean
  transport?: string
  [key: string]: unknown
}

export default function Plugins() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') as Tab) ?? 'plugins'
  const [query, setQuery] = useState('')

  function switchTab(t: Tab) {
    setSearchParams({ tab: t }, { replace: true })
    setQuery('')
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg-main">
      {/* Header: switcher replaces the plain title */}
      <header
        className="flex items-center h-10 px-6 shrink-0 bg-bg-main"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        data-tauri-drag-region
      >
        <div
          className="flex items-center gap-0.5 p-[3px] rounded-[8px] bg-black/[0.05] dark:bg-white/[0.06]"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          role="tablist"
        >
          {(['plugins', 'skills'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => switchTab(t)}
              className={cn(
                'px-3 py-[3px] rounded-[6px] text-[12px] font-medium capitalize transition-all duration-[140ms] cursor-pointer border-0',
                tab === t
                  ? 'bg-bg-main text-text-primary shadow-sm'
                  : 'bg-transparent text-text-muted hover:text-text-secondary',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {tab === 'plugins' ? (
          <PluginsTab query={query} setQuery={setQuery} />
        ) : (
          <SkillsTab query={query} setQuery={setQuery} />
        )}
      </div>
    </div>
  )
}

/* ── Search bar ──────────────────────────────────────────────────────────── */
function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative max-w-[340px] w-full">
      <Search
        size={13}
        strokeWidth={1.7}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Search…'}
        className="w-full pl-8 pr-3 py-[6px] text-[13px] text-text-primary placeholder:text-text-dim bg-bg-panel border border-border-base rounded-[8px] outline-none focus:border-border-strong transition-colors duration-[120ms]"
      />
    </div>
  )
}

/* ── Plugins (MCP) tab ───────────────────────────────────────────────────── */
function PluginsTab({ query, setQuery }: { query: string; setQuery: (v: string) => void }) {
  const q = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const servers = (q.data?.mcp_servers ?? []) as McpServer[]

  const filtered = useMemo(() => {
    const lower = query.toLowerCase()
    return servers.filter(
      (s) =>
        !lower ||
        (s.name ?? '').toLowerCase().includes(lower) ||
        (s.url ?? '').toLowerCase().includes(lower),
    )
  }, [servers, query])

  return (
    <div className="flex flex-col gap-5 max-w-[960px] w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Search plugins…" />
        <NavLink
          to="/settings/mcp"
          className="inline-flex items-center gap-1.5 px-3 py-[6px] rounded-[8px] text-[12px] font-medium text-text-secondary border border-border-base bg-bg-panel no-underline hover:text-text-primary hover:border-border-strong transition-colors duration-[120ms]"
        >
          <Plus size={13} strokeWidth={2} /> Add server
        </NavLink>
      </div>

      {q.isLoading && (
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!q.isLoading && servers.length === 0 && (
        <EmptyState
          icon={<Puzzle size={28} strokeWidth={1.3} className="text-text-dim" />}
          title="No plugins connected"
          description={<>Add an MCP server entry to <span className="font-mono">~/.rushdino/config.toml</span> and it will appear here.</>}
          cta={{ label: 'Configure servers', to: '/settings/mcp' }}
        />
      )}

      {!q.isLoading && servers.length > 0 && filtered.length === 0 && (
        <p className="text-[13px] text-text-muted px-0.5 py-2">No results for "{query}"</p>
      )}

      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
        {filtered.map((s, i) => (
          <PluginCard key={s.name ?? `mcp-${i}`} server={s} index={i} />
        ))}
      </div>
    </div>
  )
}

function PluginCard({ server: s, index: i }: { server: McpServer; index: number }) {
  return (
    <GlassPanel variant="body" className="flex flex-col gap-2 group">
      {/* Head */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] uppercase px-[8px] py-[3px] rounded-full border border-border-strong text-text-muted">
          <Server size={11} strokeWidth={1.8} /> MCP
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.08em] uppercase',
            s.enabled === false ? 'text-text-dim' : 'text-teal-400',
          )}
        >
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              s.enabled === false ? 'bg-text-dim' : 'bg-teal-400',
            )}
          />
          {s.enabled === false ? 'disabled' : 'enabled'}
        </span>
      </div>

      {/* Name */}
      <h3 className="text-[15px] font-semibold text-text-primary m-0 mt-0.5">
        {s.name ?? `server ${i + 1}`}
      </h3>

      {/* Spec */}
      <dl className="flex flex-col gap-1 mt-1">
        {s.transport && (
          <div className="flex justify-between gap-2 font-mono text-[11px]">
            <dt className="text-text-dim tracking-[0.1em] uppercase text-[10px]">Transport</dt>
            <dd className="m-0 text-text-secondary max-w-[60%] truncate">{s.transport as string}</dd>
          </div>
        )}
        {s.url && (
          <div className="flex justify-between gap-2 font-mono text-[11px]">
            <dt className="text-text-dim tracking-[0.1em] uppercase text-[10px]">URL</dt>
            <dd className="m-0 text-text-muted max-w-[60%] truncate">{s.url}</dd>
          </div>
        )}
      </dl>

      <NavLink
        to="/settings/mcp"
        className="mt-auto pt-2 inline-flex items-center gap-1 text-[11px] text-text-dim no-underline hover:text-teal-400 transition-colors duration-[120ms] opacity-0 group-hover:opacity-100"
      >
        <ExternalLink size={11} strokeWidth={1.7} /> Configure
      </NavLink>
    </GlassPanel>
  )
}

/* ── Skills tab ──────────────────────────────────────────────────────────── */
function SkillsTab({ query, setQuery }: { query: string; setQuery: (v: string) => void }) {
  const q = useQuery({ queryKey: ['skills'], queryFn: listSkills })

  const { system, custom } = useMemo(() => {
    const lower = query.toLowerCase()
    const items = (q.data ?? []).filter(
      (s) =>
        !lower ||
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower),
    )
    return {
      system: items.filter((s) => s.isBuiltIn),
      custom: items.filter((s) => !s.isBuiltIn),
    }
  }, [q.data, query])

  return (
    <div className="flex flex-col gap-6 max-w-[960px] w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Search skills…" />
        <NavLink
          to="/settings/skills"
          className="inline-flex items-center gap-1.5 px-3 py-[6px] rounded-[8px] text-[12px] font-medium text-text-secondary border border-border-base bg-bg-panel no-underline hover:text-text-primary hover:border-border-strong transition-colors duration-[120ms]"
        >
          <Plus size={13} strokeWidth={2} /> Create skill
        </NavLink>
      </div>

      {q.isLoading && (
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!q.isLoading && (q.data ?? []).length === 0 && (
        <EmptyState
          icon={<Sparkles size={28} strokeWidth={1.3} className="text-text-dim" />}
          title="No skills registered"
          description="Skills extend what the agent can do. Add a SKILL.md file or create one here."
          cta={{ label: 'Create skill', to: '/settings/skills' }}
        />
      )}

      {!q.isLoading && query && system.length === 0 && custom.length === 0 && (
        <p className="text-[13px] text-text-muted px-0.5 py-2">No results for "{query}"</p>
      )}

      {system.length > 0 && (
        <SkillSection title="System" skills={system} />
      )}

      {custom.length > 0 && (
        <SkillSection title="Custom" skills={custom} />
      )}
    </div>
  )
}

function SkillSection({ title, skills }: { title: string; skills: SkillRecord[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-text-dim">{title}</span>
        <span className="text-[11px] text-text-faint font-mono">{skills.length}</span>
      </div>
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
        {skills.map((s) => <SkillCard key={s.name} skill={s} />)}
      </div>
    </div>
  )
}

function SkillCard({ skill: s }: { skill: SkillRecord }) {
  return (
    <section className="bg-bg-panel border border-border-strong rounded-lg px-5 py-[18px] flex flex-col gap-2 group">
      {/* Head */}
      <div className="flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-[14px] font-semibold text-text-primary m-0">
          <Sparkles size={13} strokeWidth={1.8} className="text-teal-400 shrink-0" />
          {s.name}
        </h3>
        {s.isBuiltIn && (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] text-text-dim uppercase">
            <Lock size={9} strokeWidth={2} /> built-in
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-[12.5px] text-text-muted leading-[1.5] m-0 line-clamp-2">
        {s.description || '—'}
      </p>

      {/* Tool badges */}
      {s.tools && s.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-0.5">
          {s.tools.slice(0, 5).map((t) => (
            <span key={t} className="font-mono text-[10px] tracking-[0.04em] text-text-muted bg-[rgba(255,255,255,0.04)] border border-border-subtle px-1.5 py-0.5 rounded">
              {t}
            </span>
          ))}
          {s.tools.length > 5 && (
            <span className="font-mono text-[10px] tracking-[0.04em] text-text-dim border border-border-subtle px-1.5 py-0.5 rounded">
              +{s.tools.length - 5}
            </span>
          )}
        </div>
      )}
    </section>
  )
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
function EmptyState({
  icon,
  title,
  description,
  cta,
}: {
  icon: React.ReactNode
  title: string
  description: React.ReactNode
  cta: { label: string; to: string }
}) {
  return (
    <GlassPanel variant="compact" className="flex flex-col items-center gap-3 py-10 text-center">
      {icon}
      <div>
        <p className="text-[14px] font-medium text-text-primary m-0">{title}</p>
        <p className="text-[12.5px] text-text-muted mt-1 m-0 max-w-[360px]">{description}</p>
      </div>
      <NavLink
        to={cta.to}
        className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] text-[12px] font-medium bg-teal-400/10 text-teal-400 border border-teal-400/20 no-underline hover:bg-teal-400/15 transition-colors duration-[120ms]"
      >
        {cta.label}
      </NavLink>
    </GlassPanel>
  )
}
