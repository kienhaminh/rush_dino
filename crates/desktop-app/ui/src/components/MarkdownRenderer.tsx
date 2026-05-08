import { createContext, isValidElement, useContext, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'

/* ── List context so li knows whether it's inside ul or ol ─────────── */
const ListTypeCtx = createContext<'ul' | 'ol'>('ul')

/* ── Inline code ──────────────────────────────────────────────────────
   Background = --ds-teal-soft (rgba 34,211,200,0.08).
   Border 0.14 alpha has no token — keep it as an arbitrary value to
   preserve fidelity (--ds-teal-line is 0.25, too strong here). */
function InlineCode({ children }: { children?: ReactNode }) {
  return (
    <code className="font-mono text-[12.5px] px-[6px] py-[1px] rounded-[4px] bg-teal-soft text-teal-300 border border-[rgba(34,211,200,0.14)] whitespace-nowrap">
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
    <div className="mt-[0.55em] mb-[0.85em] border border-border-strong border-l-2 border-l-teal-800 rounded-[6px] bg-bg-card overflow-hidden">
      {/* Header bar — semi-opaque black sits on top of card surface */}
      <div className="flex items-center justify-between px-3 py-[5px] border-b border-border-subtle bg-[rgba(0,0,0,0.18)]">
        <span
          className={`font-mono text-[10px] tracking-[0.1em] uppercase ${
            lang ? 'text-teal-600' : 'text-text-dim'
          }`}
        >
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          className={`flex items-center gap-1 font-mono text-[10px] bg-transparent border-none cursor-pointer px-[6px] py-[2px] rounded-[3px] transition-colors duration-150 ${
            copied ? 'text-teal-400' : 'text-text-dim'
          }`}
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre
        ref={preRef}
        className="m-0 px-4 py-3 font-mono text-[12.5px] leading-[1.65] text-text-primary overflow-x-auto"
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
      <li className="mb-[0.22em] leading-[1.72] pl-[0.15em]">
        {children}
      </li>
    )
  }

  return (
    <li className="flex items-start gap-2 mb-[0.28em] list-none">
      {/* Rotated square diamond marker in teal-800 (#0e7a72 — original used
          --ds-teal-700 fallback which equals teal-800 in tokens.css). */}
      <span className="w-[5px] h-[5px] shrink-0 mt-[0.6em] rounded-[1px] bg-teal-800 rotate-45" />
      <span className="flex-1 leading-[1.72]">{children}</span>
    </li>
  )
}

/* ── Main renderer ──────────────────────────────────────────────────── */
export function MarkdownRenderer({ children }: { children: string }) {
  /* The `prose-md` class is intentionally retained: chat.css scopes
     user-bubble overrides through `.bubble--user .prose-md code` and
     `.bubble--user .prose-md > div`. Removing this class regresses the
     user-side code/code-block rendering. */
  return (
    <div className="prose-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          /* Paragraph */
          p: ({ children }) => (
            <p className="m-0 mb-[0.6em] leading-[1.72]">{children}</p>
          ),

          /* Headings */
          h1: ({ children }) => (
            <h1 className="text-[17px] font-bold tracking-[-0.02em] text-text-primary mt-[1.3em] mb-[0.5em] leading-[1.2]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary mt-[1.2em] mb-[0.45em] pb-[0.3em] border-b border-border-subtle leading-[1.3]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[13.5px] font-semibold text-teal-300 mt-[1em] mb-[0.3em] leading-[1.4]">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[11px] font-bold tracking-[0.08em] uppercase text-text-secondary mt-[0.8em] mb-[0.25em]">
              {children}
            </h4>
          ),

          /* Lists */
          ul: ({ children }) => (
            <ListTypeCtx.Provider value="ul">
              <ul className="m-0 mb-[0.65em] p-0 list-none">
                {children}
              </ul>
            </ListTypeCtx.Provider>
          ),
          ol: ({ children }) => (
            <ListTypeCtx.Provider value="ol">
              <ol className="m-0 mb-[0.65em] pl-[1.5em] list-decimal">
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
              /* Inside a fenced block — let CodeBlock's <pre> drive color/size.
                 We only set font-mono + size/leading to prevent the default
                 react-markdown styles from sneaking in. */
              return (
                <code className="font-mono text-[12.5px] leading-[1.65]">
                  {children}
                </code>
              )
            }
            return <InlineCode>{children}</InlineCode>
          },

          /* Blockquote — alpha 0.04 is half of teal-soft (0.08); keep it
             as an arbitrary value rather than reusing teal-soft. */
          blockquote: ({ children }) => (
            <blockquote className="m-0 mb-[0.7em] py-2 px-[14px] border-l-2 border-l-teal-600 bg-[rgba(34,211,200,0.04)] rounded-r-[6px] text-text-secondary">
              {children}
            </blockquote>
          ),

          /* Table */
          table: ({ children }) => (
            <div className="overflow-x-auto m-0 mb-[0.75em]">
              <table className="w-full border-collapse text-[13px] border border-border-strong rounded-[6px] overflow-hidden">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-bg-elevated border-b border-border-strong">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-[7px] text-left font-semibold text-[11px] tracking-[0.05em] uppercase text-text-secondary">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-[7px] border-b border-border-subtle text-text-primary">
              {children}
            </td>
          ),

          /* Misc */
          hr: () => (
            <hr className="border-0 border-t border-t-border-strong my-[1em]" />
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-300 no-underline border-b border-b-teal-line transition-colors duration-[120ms]"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-text-primary">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-text-secondary">{children}</em>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
