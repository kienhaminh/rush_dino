import { createContext, isValidElement, useContext, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'

/* ── List context so li knows whether it's inside ul or ol ─────────── */
const ListTypeCtx = createContext<'ul' | 'ol'>('ul')

/* ── Inline code ────────────────────────────────────────────────────── */
function InlineCode({ children }: { children?: ReactNode }) {
  return (
    <code style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '12.5px',
      padding: '1px 6px',
      borderRadius: '4px',
      background: 'rgba(34, 211, 200, 0.08)',
      color: 'var(--ds-teal-300)',
      border: '1px solid rgba(34, 211, 200, 0.14)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </code>
  )
}

/* ── Fenced code block ──────────────────────────────────────────────── */
function CodeBlock({ lang, children }: { lang?: string; children: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  function copy() {
    void navigator.clipboard.writeText(preRef.current?.textContent?.trim() ?? '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{
      margin: '0.55em 0 0.85em',
      border: '1px solid var(--ds-border-strong)',
      borderLeft: '2px solid var(--ds-teal-800)',
      borderRadius: '6px',
      background: 'var(--ds-bg-card)',
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 12px',
        borderBottom: '1px solid var(--ds-border-subtle)',
        background: 'rgba(0,0,0,0.18)',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: lang ? 'var(--ds-teal-600)' : 'var(--ds-text-dim)',
        }}>
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: copied ? 'var(--ds-teal-400)' : 'var(--ds-text-dim)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: '3px',
            transition: 'color 0.15s',
          }}
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre
        ref={preRef}
        style={{
          margin: 0,
          padding: '12px 16px',
          fontFamily: 'var(--font-mono)',
          fontSize: '12.5px',
          lineHeight: '1.65',
          color: 'var(--ds-text-primary)',
          overflowX: 'auto',
        }}
      >
        {children}
      </pre>
    </div>
  )
}

/* ── List item — reads context to decide bullet style ───────────────── */
function ListItem({ children }: ComponentPropsWithoutRef<'li'> & { node?: unknown }) {
  const listType = useContext(ListTypeCtx)

  if (listType === 'ol') {
    return (
      <li style={{ marginBottom: '0.22em', lineHeight: '1.72', paddingLeft: '0.15em' }}>
        {children}
      </li>
    )
  }

  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '0.28em', listStyle: 'none' }}>
      {/* Rotated square diamond marker in teal */}
      <span style={{
        width: '5px',
        height: '5px',
        flexShrink: 0,
        marginTop: '0.6em',
        borderRadius: '1px',
        background: 'var(--ds-teal-700, #0e7a72)',
        transform: 'rotate(45deg)',
      }} />
      <span style={{ flex: 1, lineHeight: '1.72' }}>{children}</span>
    </li>
  )
}

/* ── Main renderer ──────────────────────────────────────────────────── */
export function MarkdownRenderer({ children }: { children: string }) {
  return (
    <div className="prose-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          /* Paragraph */
          p: ({ children }) => (
            <p style={{ margin: '0 0 0.6em', lineHeight: '1.72' }}>{children}</p>
          ),

          /* Headings */
          h1: ({ children }) => (
            <h1 style={{
              fontSize: '17px', fontWeight: 700, letterSpacing: '-0.02em',
              color: 'var(--ds-text-primary)', margin: '1.3em 0 0.5em', lineHeight: 1.2,
            }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 style={{
              fontSize: '15px', fontWeight: 600, letterSpacing: '-0.01em',
              color: 'var(--ds-text-primary)', margin: '1.2em 0 0.45em',
              paddingBottom: '0.3em', borderBottom: '1px solid var(--ds-border-subtle)',
              lineHeight: 1.3,
            }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{
              fontSize: '13.5px', fontWeight: 600,
              color: 'var(--ds-teal-300)', margin: '1em 0 0.3em', lineHeight: 1.4,
            }}>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--ds-text-secondary)',
              margin: '0.8em 0 0.25em',
            }}>
              {children}
            </h4>
          ),

          /* Lists */
          ul: ({ children }) => (
            <ListTypeCtx.Provider value="ul">
              <ul style={{ margin: '0 0 0.65em', padding: 0, listStyle: 'none' }}>
                {children}
              </ul>
            </ListTypeCtx.Provider>
          ),
          ol: ({ children }) => (
            <ListTypeCtx.Provider value="ol">
              <ol style={{ margin: '0 0 0.65em', paddingLeft: '1.5em' }}>
                {children}
              </ol>
            </ListTypeCtx.Provider>
          ),
          li: ListItem,

          /* Code */
          pre: ({ children }) => {
            let lang: string | undefined
            const codeChild = Array.isArray(children) ? children[0] : children
            if (isValidElement(codeChild)) {
              lang = (codeChild.props as { className?: string }).className?.replace('language-', '')
            }
            return <CodeBlock lang={lang}>{children}</CodeBlock>
          },
          code: ({ className, children }) => {
            if (className) {
              return (
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px', lineHeight: '1.65' }}>
                  {children}
                </code>
              )
            }
            return <InlineCode>{children}</InlineCode>
          },

          /* Blockquote */
          blockquote: ({ children }) => (
            <blockquote style={{
              margin: '0 0 0.7em',
              padding: '8px 14px',
              borderLeft: '2px solid var(--ds-teal-600)',
              background: 'rgba(34, 211, 200, 0.04)',
              borderRadius: '0 6px 6px 0',
              color: 'var(--ds-text-secondary)',
            }}>
              {children}
            </blockquote>
          ),

          /* Table */
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '0 0 0.75em' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '13px',
                border: '1px solid var(--ds-border-strong)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{ background: 'var(--ds-bg-elevated)', borderBottom: '1px solid var(--ds-border-strong)' }}>
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th style={{
              padding: '7px 12px', textAlign: 'left',
              fontWeight: 600, fontSize: '11px', letterSpacing: '0.05em',
              textTransform: 'uppercase', color: 'var(--ds-text-secondary)',
            }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td style={{
              padding: '7px 12px',
              borderBottom: '1px solid var(--ds-border-subtle)',
              color: 'var(--ds-text-primary)',
            }}>
              {children}
            </td>
          ),

          /* Misc */
          hr: () => (
            <hr style={{ border: 'none', borderTop: '1px solid var(--ds-border-strong)', margin: '1em 0' }} />
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{
              color: 'var(--ds-teal-300)',
              textDecoration: 'none',
              borderBottom: '1px solid rgba(34, 211, 200, 0.28)',
              transition: 'border-color 0.12s',
            }}>
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}>{children}</strong>
          ),
          em: ({ children }) => (
            <em style={{ fontStyle: 'italic', color: 'var(--ds-text-secondary)' }}>{children}</em>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
