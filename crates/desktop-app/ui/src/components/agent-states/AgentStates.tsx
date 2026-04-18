import { useState, type CSSProperties, type ReactNode } from 'react'

/* ================================================================
   RushDino Agent States — 10 canonical components
   Ported from rushdino-design-system/ui_kits/agent-states/AgentStates.jsx
   Shared dark/teal tokens via index.css. Click to expand/collapse.
   ================================================================ */

const TEAL = 'var(--ds-teal-400)'
const SUCCESS = 'var(--ds-success)'
const WARN = 'var(--ds-warning)'
const ERROR = 'var(--ds-error)'
const INK = 'var(--ds-text-primary)'
const MUTED = 'var(--ds-text-muted)'
const DIM = 'var(--ds-text-dim)'
const LINE = 'var(--ds-border-line)'
const LINE_STRONG = 'var(--ds-border-strong)'
const SURFACE = 'var(--ds-bg-surface)'
const SURFACE_2 = 'var(--ds-bg-card)'
const MONO = 'var(--font-mono)'

type StatusKey = 'running' | 'done' | 'error' | 'idle'

const STATUS: Record<StatusKey, { dot: string; label: string; pulse: boolean }> = {
  running: { dot: WARN, label: 'Running', pulse: true },
  done: { dot: SUCCESS, label: 'Done', pulse: false },
  error: { dot: ERROR, label: 'Error', pulse: false },
  idle: { dot: DIM, label: 'Idle', pulse: false },
}

export function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: 999,
        background: color,
        display: 'inline-block',
        flexShrink: 0,
        boxShadow: `0 0 8px ${color}`,
        opacity: 0.95,
        animation: pulse ? 'rd-pulse 1.4s ease-in-out infinite' : undefined,
      }}
    />
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke={MUTED}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? 'rotate(90deg)' : 'none',
        transition: 'transform .15s ease',
        flexShrink: 0,
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

type CardProps = {
  kind: string
  title: string
  meta?: string | null
  status?: StatusKey
  defaultOpen?: boolean
  compact?: string | null
  accent?: string
  children?: ReactNode
}

function Card({ kind, title, meta, status, defaultOpen = false, compact, accent, children }: CardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const s = status ? STATUS[status] : null
  const borderLeft = accent ?? (s ? s.dot : TEAL)

  return (
    <div
      style={{
        border: `1px solid ${LINE}`,
        borderLeft: `2px solid ${borderLeft}`,
        background: SURFACE,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          fontSize: 12,
        }}
      >
        <Chevron open={open} />
        <span
          style={{
            color: borderLeft,
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: '.12em',
            fontWeight: 700,
            textTransform: 'uppercase',
            minWidth: 58,
            flexShrink: 0,
          }}
        >
          {kind}
        </span>
        <span
          style={{
            color: INK,
            fontWeight: 500,
            fontSize: 13,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {compact && !open ? (
          <span
            style={{
              color: DIM,
              fontFamily: MONO,
              fontSize: 11,
              flexShrink: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 180,
            }}
          >
            {compact}
          </span>
        ) : null}
        {meta ? (
          <span style={{ color: MUTED, fontFamily: MONO, fontSize: 11, flexShrink: 0 }}>{meta}</span>
        ) : null}
        {s ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, color: MUTED, fontSize: 11 }}>
            <Dot color={s.dot} pulse={s.pulse} />
            {s.label}
          </span>
        ) : null}
      </button>
      {open ? <div style={{ padding: '4px 12px 14px', borderTop: `1px solid ${LINE}` }}>{children}</div> : null}
    </div>
  )
}

/* 1. Tool call ─────────────────────────────────────────── */
type ToolCallProps = {
  name?: string
  status?: StatusKey
  args?: Record<string, unknown>
  result?: ReactNode
  defaultOpen?: boolean
}
export function ToolCall({
  name = 'github.create_issue',
  status = 'running',
  args = {},
  result,
  defaultOpen = true,
}: ToolCallProps) {
  const entries = Object.entries(args)
  return (
    <Card
      kind="TOOL"
      title={name}
      status={status}
      defaultOpen={defaultOpen}
      compact={entries.length ? `${entries.length} arg${entries.length > 1 ? 's' : ''}` : null}
    >
      {entries.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <ArgLabel>Arguments</ArgLabel>
          <div
            style={{
              background: SURFACE_2,
              border: `1px solid ${LINE}`,
              borderRadius: 6,
              padding: '10px 12px',
              fontFamily: MONO,
              fontSize: 12,
              lineHeight: 1.6,
              color: INK,
              overflowX: 'auto',
            }}
          >
            {entries.map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', gap: 10, whiteSpace: 'nowrap' }}>
                <span style={{ color: TEAL, minWidth: 90, flexShrink: 0 }}>{k}:</span>
                <span style={{ color: 'rgba(255,255,255,.82)' }}>
                  {typeof v === 'string' ? `"${v}"` : String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {result != null && (
        <div style={{ marginTop: 12 }}>
          <ArgLabel>Result</ArgLabel>
          <div
            style={{
              background: SURFACE_2,
              border: `1px solid ${LINE}`,
              borderRadius: 6,
              padding: '10px 12px',
              fontFamily: MONO,
              fontSize: 12,
              color: SUCCESS,
            }}
          >
            {typeof result === 'object' ? JSON.stringify(result) : String(result)}
          </div>
        </div>
      )}
    </Card>
  )
}

function ArgLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        color: DIM,
        fontSize: 10,
        letterSpacing: '.14em',
        textTransform: 'uppercase',
        fontWeight: 600,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  )
}

/* 2. Reasoning ─────────────────────────────────────────── */
export function Reasoning({
  duration = '4.2s',
  steps = [],
  defaultOpen = false,
}: {
  duration?: string
  steps?: string[]
  defaultOpen?: boolean
}) {
  return (
    <Card
      kind="THINK"
      title="Reasoning"
      meta={duration}
      defaultOpen={defaultOpen}
      accent="rgba(255,255,255,.2)"
      compact={`${steps.length} steps`}
    >
      <div
        style={{
          marginTop: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          fontSize: 13,
          lineHeight: 1.6,
          color: 'rgba(255,255,255,.65)',
          fontStyle: 'italic',
        }}
      >
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span
              style={{
                color: DIM,
                fontFamily: MONO,
                fontSize: 11,
                fontStyle: 'normal',
                width: 22,
                flexShrink: 0,
                lineHeight: 1.7,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>{s}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* 3. Streaming ─────────────────────────────────────────── */
export function Streaming({ text = 'Analyzing the request' }: { text?: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        background: SURFACE_2,
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        fontSize: 13,
        color: INK,
      }}
    >
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: 999,
              background: TEAL,
              animation: `rd-shimmer 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </span>
      <span>{text}</span>
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 14,
          background: TEAL,
          animation: 'rd-blink 1s step-end infinite',
          marginLeft: 2,
          verticalAlign: 'middle',
        }}
      />
    </div>
  )
}

/* 4. Plan / Todo list ──────────────────────────────────── */
export type PlanItem = { label: string; done?: boolean; running?: boolean }
export function Plan({
  title = 'Deploy new adapter',
  items = [],
  defaultOpen = true,
}: {
  title?: string
  items?: PlanItem[]
  defaultOpen?: boolean
}) {
  const done = items.filter((i) => i.done).length
  return (
    <Card
      kind="PLAN"
      title={title}
      defaultOpen={defaultOpen}
      meta={`${done}/${items.length}`}
      accent={TEAL}
      compact={items.find((i) => !i.done)?.label ?? null}
    >
      <ol
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '10px 0 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {items.map((it, i) => {
          const running = !!it.running
          const d = !!it.done
          const color = d ? SUCCESS : running ? WARN : DIM
          return (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
                color: d ? MUTED : INK,
                textDecoration: d ? 'line-through' : 'none',
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: `1.5px solid ${color}`,
                  background: d ? color : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {d && (
                  <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#080c10" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              <span style={{ flex: 1 }}>{it.label}</span>
              {running && <Dot color={WARN} pulse />}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

/* 5. File operation ────────────────────────────────────── */
type FileOpKind = 'read' | 'write' | 'edit' | 'del'
const FILE_ICON: Record<FileOpKind, [string, string]> = {
  read: ['', TEAL],
  write: ['', SUCCESS],
  edit: ['', WARN],
  del: ['', ERROR],
}
export function FileOp({
  op = 'edit',
  path = 'src/engine/router.rs',
  additions = 12,
  deletions = 3,
  preview,
  defaultOpen = false,
}: {
  op?: FileOpKind
  path?: string
  additions?: number
  deletions?: number
  preview?: string
  defaultOpen?: boolean
}) {
  const [, c] = FILE_ICON[op] ?? FILE_ICON.edit
  return (
    <Card
      kind={op.toUpperCase()}
      title={path}
      defaultOpen={defaultOpen}
      accent={c}
      meta={op === 'read' ? null : `+${additions} -${deletions}`}
      compact={op === 'read' ? 'read-only' : null}
    >
      {preview && (
        <pre
          style={{
            margin: '10px 0 0',
            padding: '10px 12px',
            background: SURFACE_2,
            border: `1px solid ${LINE}`,
            borderRadius: 6,
            fontFamily: MONO,
            fontSize: 12,
            lineHeight: 1.6,
            color: INK,
            overflow: 'auto',
          }}
        >
          {preview}
        </pre>
      )}
    </Card>
  )
}

/* 6. Terminal ──────────────────────────────────────────── */
type TermLine = { kind?: 'err' | 'ok' | 'warn'; text: string } | string
export function Terminal({
  cmd = 'cargo test',
  lines = [],
  defaultOpen = true,
  exit = 0,
}: {
  cmd?: string
  lines?: TermLine[]
  defaultOpen?: boolean
  exit?: number
}) {
  const status: StatusKey = exit === 0 ? 'done' : 'error'
  return (
    <Card kind="SHELL" title={cmd} status={status} defaultOpen={defaultOpen} meta={`exit ${exit}`}>
      <div
        style={{
          marginTop: 10,
          background: '#050709',
          border: `1px solid ${LINE}`,
          borderRadius: 6,
          padding: '12px 14px',
          fontFamily: MONO,
          fontSize: 12,
          lineHeight: 1.7,
          color: INK,
          overflow: 'auto',
        }}
      >
        <div style={{ color: TEAL }}>$ {cmd}</div>
        {lines.map((l, i) => {
          const line = typeof l === 'string' ? { text: l } : l
          const color =
            line.kind === 'err'
              ? ERROR
              : line.kind === 'ok'
                ? SUCCESS
                : line.kind === 'warn'
                  ? WARN
                  : 'rgba(255,255,255,.78)'
          return (
            <div key={i} style={{ color }}>
              {line.text}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/* 7. Code diff ─────────────────────────────────────────── */
export type DiffHunk = { line: string | number; text: string; kind?: '+' | '-' }
export function Diff({
  file = 'Cargo.toml',
  hunks = [],
  defaultOpen = true,
}: {
  file?: string
  hunks?: DiffHunk[]
  defaultOpen?: boolean
}) {
  return (
    <Card
      kind="DIFF"
      title={file}
      defaultOpen={defaultOpen}
      accent={TEAL}
      meta={`${hunks.length} hunk${hunks.length > 1 ? 's' : ''}`}
    >
      <div
        style={{
          marginTop: 10,
          background: SURFACE_2,
          border: `1px solid ${LINE}`,
          borderRadius: 6,
          fontFamily: MONO,
          fontSize: 12,
          lineHeight: 1.7,
          overflow: 'auto',
        }}
      >
        {hunks.map((h, i) => (
          <div key={i} style={{ display: 'flex', borderTop: i ? `1px solid ${LINE}` : 'none' }}>
            <div
              style={{
                padding: '8px 10px',
                color: DIM,
                background: 'rgba(0,0,0,.2)',
                minWidth: 38,
                textAlign: 'right',
                userSelect: 'none',
                fontSize: 11,
              }}
            >
              {h.line}
            </div>
            <div
              style={{
                padding: '8px 12px',
                flex: 1,
                background:
                  h.kind === '+' ? 'rgba(74,222,128,.08)' : h.kind === '-' ? 'rgba(248,113,113,.08)' : 'transparent',
                color: h.kind === '+' ? SUCCESS : h.kind === '-' ? ERROR : INK,
                whiteSpace: 'pre',
              }}
            >
              {`${h.kind ?? ' '} ${h.text}`}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* 8. Artifact preview ──────────────────────────────────── */
function artBtn(primary: boolean): CSSProperties {
  return {
    fontFamily: 'inherit',
    fontSize: 11,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    padding: '6px 12px',
    borderRadius: 999,
    cursor: 'pointer',
    background: primary ? TEAL : 'transparent',
    color: primary ? 'var(--ds-bg-base)' : MUTED,
    border: primary ? 'none' : `1px solid ${LINE_STRONG}`,
    fontWeight: 600,
  }
}
export function Artifact({
  kind = 'Image',
  name = 'chart.png',
  size = '42 KB',
  thumb,
  defaultOpen = false,
}: {
  kind?: string
  name?: string
  size?: string
  thumb?: string
  defaultOpen?: boolean
}) {
  return (
    <Card kind="ARTIFACT" title={name} meta={size} defaultOpen={defaultOpen} accent={TEAL} compact={kind}>
      <div style={{ marginTop: 10, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 120,
            height: 80,
            flexShrink: 0,
            borderRadius: 6,
            background: thumb ?? 'linear-gradient(135deg, rgba(34,211,200,.15), rgba(34,211,200,.3))',
            border: `1px solid ${LINE_STRONG}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: TEAL,
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: '.12em',
          }}
        >
          {kind.toUpperCase()}
        </div>
        <div style={{ flex: 1, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          <div style={{ color: INK, marginBottom: 4 }}>{name}</div>
          <div style={{ fontFamily: MONO, fontSize: 11 }}>
            {kind} · {size}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button type="button" style={artBtn(true)}>
              Open
            </button>
            <button type="button" style={artBtn(false)}>
              Download
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

/* 9. Citation / source ─────────────────────────────────── */
export function Citation({
  num = 1,
  title = 'Rust async-trait RFC',
  domain = 'rust-lang.github.io',
  excerpt,
}: {
  num?: number
  title?: string
  domain?: string
  excerpt?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          borderRadius: 999,
          background: open ? 'rgba(34,211,200,.15)' : 'rgba(34,211,200,.08)',
          border: `1px solid rgba(34,211,200,.25)`,
          color: TEAL,
          fontSize: 11,
          cursor: 'pointer',
          fontWeight: 600,
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 10 }}>{String(num).padStart(2, '0')}</span>
        <span>{domain}</span>
      </button>
      {open && (
        <div
          style={{
            marginTop: 8,
            padding: '10px 12px',
            background: SURFACE,
            border: `1px solid ${LINE_STRONG}`,
            borderRadius: 8,
            maxWidth: 360,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <div style={{ color: INK, fontWeight: 600, marginBottom: 4 }}>{title}</div>
          <div style={{ color: TEAL, fontFamily: MONO, fontSize: 10, marginBottom: 6 }}>{domain}</div>
          {excerpt && <div style={{ color: MUTED, fontStyle: 'italic' }}>{`"${excerpt}"`}</div>}
        </div>
      )}
    </div>
  )
}

/* 10. Error + retry ────────────────────────────────────── */
export function ErrorBlock({
  title = 'Tool call failed',
  detail = 'connect ECONNREFUSED 127.0.0.1:28847',
  onRetry,
  defaultOpen = true,
}: {
  title?: string
  detail?: string
  onRetry?: () => void
  defaultOpen?: boolean
}) {
  return (
    <Card kind="ERROR" title={title} status="error" defaultOpen={defaultOpen} accent={ERROR}>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            background: 'rgba(248,113,113,.06)',
            border: `1px solid rgba(248,113,113,.25)`,
            borderRadius: 6,
            padding: '10px 12px',
            fontFamily: MONO,
            fontSize: 12,
            color: ERROR,
            lineHeight: 1.5,
          }}
        >
          {detail}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onRetry} style={artBtn(true)}>
            Retry
          </button>
          <button type="button" style={artBtn(false)}>
            Copy error
          </button>
        </div>
      </div>
    </Card>
  )
}
