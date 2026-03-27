import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface SubAgentMarkdownProps {
  content: string;
}

const compactComponents: Components = {
  p: ({ children }) => (
    <p className="leading-relaxed my-0.5">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground/90">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="text-foreground/60">{children}</em>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[hsl(var(--brand-cyan)/0.8)] underline decoration-[hsl(var(--brand-cyan)/0.3)]"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-0.5 space-y-0.5 list-none pl-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-0.5 space-y-0.5 list-none pl-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="flex items-start gap-1.5">
      <span className="shrink-0 mt-[6px] w-1 h-1 rounded-full bg-[hsl(var(--brand-cyan)/0.4)]" />
      <span className="flex-1 min-w-0">{children}</span>
    </li>
  ),
  code: ({ children, className }) => {
    if (className) return <code className={className}>{children}</code>;
    return (
      <code className="rounded bg-muted/40 px-1 py-px text-[10px] text-[hsl(var(--brand-cyan)/0.7)]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-1 rounded-lg bg-muted/20 border border-border/20 px-2 py-1.5 overflow-x-auto text-[10px] leading-relaxed scrollbar-thin [&>code]:text-foreground/70">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-1 pl-2 border-l-2 border-[hsl(var(--brand-cyan)/0.2)] text-foreground/60 [&>p]:my-0">
      {children}
    </blockquote>
  ),
  h1: ({ children }) => <p className="font-semibold text-foreground/85 my-0.5">{children}</p>,
  h2: ({ children }) => <p className="font-semibold text-foreground/85 my-0.5">{children}</p>,
  h3: ({ children }) => <p className="font-semibold text-foreground/80 my-0.5">{children}</p>,
};

export function SubAgentMarkdown({ content }: SubAgentMarkdownProps) {
  return (
    <div className="max-w-none break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={compactComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
