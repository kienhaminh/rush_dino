import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { LinkTarget, RichContent } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AssistantRichContentProps {
  content: string;
  richContent?: RichContent | null;
  showCursor?: boolean;
}

function blockKey(block: RichContent['blocks'][number]): string {
  // Create stable key from block type and content slice
  const content = (block as Record<string, unknown>).text as string | undefined ??
                  (block as Record<string, unknown>).code as string | undefined ??
                  (block as Record<string, unknown>).url as string | undefined ??
                  String(((block as Record<string, unknown>).items as unknown[] | undefined)?.length ?? '');
  return `${block.type}::${content.slice(0, 30)}`;
}

export function AssistantRichContent({ content, richContent, showCursor }: AssistantRichContentProps) {
  if (!richContent || !richContent.blocks || richContent.blocks.length === 0) {
    return (
      <div>
        <MarkdownBlock content={content} />
        {showCursor && <TypingCursor />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {richContent.blocks.map((block) => {
        if (block.type === 'formatted_text') {
          if (block.format === 'plain_text') {
            return (
              <p key={blockKey(block)} className="whitespace-pre-wrap leading-relaxed text-sm">
                {block.text}
              </p>
            );
          }
          return <MarkdownBlock key={blockKey(block)} content={block.text} />;
        }

        if (block.type === 'code_block') {
          return <CodeBlock key={blockKey(block)} language={block.language ?? undefined} code={block.code} />;
        }

        if (block.type === 'image') {
          return (
            <a
              key={blockKey(block)}
              href={block.url}
              target="_blank"
              rel="noreferrer"
              className="group/img block overflow-hidden rounded-xl border border-border/30 bg-background/50 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              <img
                src={block.url}
                alt={block.alt ?? 'Assistant image'}
                className="max-h-80 w-full object-cover transition-transform duration-300 group-hover/img:scale-[1.02]"
              />
              <div className="px-3 py-2 text-[11px] text-muted-foreground/60 border-t border-border/20">
                {block.alt ?? block.url}
              </div>
            </a>
          );
        }

        if (block.type === 'link_list') {
          return (
            <div key={blockKey(block)} className="space-y-1.5">
              {block.items.map((item) => (
                <LinkCard key={`${item.url}-${item.label}`} item={item} />
              ))}
            </div>
          );
        }

        return (
          <div key={blockKey(block)} className="flex flex-wrap gap-2">
            {block.items.map((item) => (
              <a
                key={`${item.url}-${item.label}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-all',
                  'hover:border-primary/40 hover:bg-primary/10 hover:shadow-sm hover:shadow-primary/5',
                )}
              >
                <span className="w-1 h-1 rounded-full bg-primary/60" />
                {item.label}
              </a>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function TypingCursor() {
  return (
    <span className="inline-block w-[2px] h-[14px] bg-[hsl(var(--brand-cyan))] animate-pulse ml-0.5 align-middle rounded-full shadow-[0_0_6px_hsl(var(--brand-cyan)/0.5)]" />
  );
}

function CodeBlock({ language, code }: { language?: string; code: string }) {
  return (
    <div className="relative group/code rounded-xl border border-border/30 bg-[hsl(var(--background))] overflow-hidden">
      {language && (
        <div className="flex items-center border-b border-border/20 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--brand-cyan)/0.6)]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
              {language}
            </span>
          </div>
        </div>
      )}
      <pre className="overflow-x-auto px-3 py-3 text-[12.5px] leading-relaxed scrollbar-thin">
        <code className="text-foreground/80">{code}</code>
      </pre>
    </div>
  );
}

function LinkCard({ item }: { item: LinkTarget }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'group/link flex items-center justify-between rounded-xl border border-border/25 bg-background/40 px-3.5 py-2.5 transition-all',
        'hover:border-primary/25 hover:bg-background/70 hover:shadow-sm hover:shadow-primary/5',
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="shrink-0 w-5 h-5 rounded-md bg-primary/10 border border-primary/15 flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-primary/70">
            <path d="M3.5 8.5L8.5 3.5M8.5 3.5H4.5M8.5 3.5V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="text-[13px] font-medium text-foreground/80 group-hover/link:text-foreground/95 transition-colors truncate">
          {item.label}
        </span>
      </div>
      <span className="ml-3 shrink-0 text-[10px] text-muted-foreground/40 truncate max-w-[160px] font-mono">
        {item.url.replace(/^https?:\/\//, '').split('/')[0]}
      </span>
    </a>
  );
}

// ── Custom markdown components ───────────────────────────────────────────────

const markdownComponents: Components = {
  // Headings — accent bar + strong hierarchy
  h1: ({ children }) => (
    <h1 className="flex items-center gap-2.5 text-[15px] font-bold text-foreground mt-5 mb-2 tracking-tight">
      <span className="shrink-0 w-1 h-5 rounded-full bg-gradient-to-b from-[hsl(var(--brand-cyan))] to-[hsl(var(--brand-teal)/0.4)]" />
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="flex items-center gap-2 text-[14px] font-semibold text-foreground/95 mt-4 mb-1.5 tracking-tight">
      <span className="shrink-0 w-0.5 h-4 rounded-full bg-[hsl(var(--brand-cyan)/0.5)]" />
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[13px] font-semibold text-foreground/90 mt-3 mb-1 tracking-tight pl-[3px] border-l-2 border-[hsl(var(--brand-cyan)/0.2)]">
      <span className="ml-2">{children}</span>
    </h3>
  ),

  // Paragraphs
  p: ({ children }) => (
    <p className="text-sm leading-[1.75] text-foreground/85 my-1.5">{children}</p>
  ),

  // Strong — slightly brighter so it pops against body text
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),

  // Emphasis
  em: ({ children }) => (
    <em className="text-foreground/70 not-italic border-b border-dotted border-foreground/20">{children}</em>
  ),

  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[hsl(var(--brand-cyan))] font-medium no-underline border-b border-[hsl(var(--brand-cyan)/0.3)] hover:border-[hsl(var(--brand-cyan)/0.7)] transition-colors"
    >
      {children}
    </a>
  ),

  // Unordered list
  ul: ({ children }) => (
    <ul className="my-2 space-y-1 list-none pl-0">{children}</ul>
  ),

  // Ordered list
  ol: ({ children }) => (
    <ol className="my-2 space-y-1 list-none pl-0 counter-reset-[md-ol]">{children}</ol>
  ),

  // List items — custom bullet/number with brand color
  li: ({ children, ...props }) => {
    const isOrdered = (props as { node?: { parentNode?: { tagName?: string } } }).node?.parentNode?.tagName === 'ol';
    return (
      <li className="flex items-start gap-2.5 text-sm leading-[1.7] text-foreground/85">
        <span className="shrink-0 mt-[9px]">
          {isOrdered ? (
            <span className="inline-flex items-center justify-center w-[18px] h-[18px] -mt-[5px] rounded-md bg-[hsl(var(--brand-cyan)/0.1)] text-[10px] font-semibold text-[hsl(var(--brand-cyan)/0.7)] border border-[hsl(var(--brand-cyan)/0.15)]">
              &bull;
            </span>
          ) : (
            <span className="block w-1.5 h-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-cyan)/0.6)] to-[hsl(var(--brand-teal)/0.3)]" />
          )}
        </span>
        <span className="flex-1 min-w-0">{children}</span>
      </li>
    );
  },

  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="relative my-3 rounded-lg border border-[hsl(var(--brand-cyan)/0.1)] bg-[hsl(var(--brand-cyan)/0.03)] overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[hsl(var(--brand-cyan)/0.5)] to-[hsl(var(--brand-teal)/0.2)]" />
      <div className="pl-4 pr-3 py-2 text-foreground/70 [&>p]:my-0.5">{children}</div>
    </blockquote>
  ),

  // Inline code
  code: ({ children, className }) => {
    // If it has a language class, it's inside a <pre> — render plain
    if (className) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded-md bg-muted/50 border border-border/30 px-1.5 py-0.5 text-[12px] text-[hsl(var(--brand-cyan)/0.85)] font-normal">
        {children}
      </code>
    );
  },

  // Code blocks (from markdown fences)
  pre: ({ children }) => (
    <div className="my-2.5 rounded-xl border border-border/30 bg-[hsl(var(--background))] overflow-hidden">
      <pre className="overflow-x-auto px-3 py-3 text-[12.5px] leading-relaxed scrollbar-thin [&>code]:text-foreground/80">
        {children}
      </pre>
    </div>
  ),

  // Horizontal rule
  hr: () => (
    <div className="my-4 flex items-center gap-2">
      <div className="flex-1 h-px bg-gradient-to-r from-border/50 via-[hsl(var(--brand-cyan)/0.2)] to-border/50" />
      <span className="w-1 h-1 rounded-full bg-[hsl(var(--brand-cyan)/0.3)]" />
      <div className="flex-1 h-px bg-gradient-to-r from-border/50 via-[hsl(var(--brand-cyan)/0.2)] to-border/50" />
    </div>
  ),

  // Tables
  table: ({ children }) => (
    <div className="my-3 rounded-xl border border-border/30 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">{children}</table>
      </div>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/30 border-b border-border/30">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-foreground/70">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-[13px] text-foreground/80 border-t border-border/15">{children}</td>
  ),
};

// ── MarkdownBlock ────────────────────────────────────────────────────────────

function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
