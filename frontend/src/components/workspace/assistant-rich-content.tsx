import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { LinkTarget, RichContent } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AssistantRichContentProps {
  content: string;
  richContent?: RichContent | null;
}

export function AssistantRichContent({ content, richContent }: AssistantRichContentProps) {
  if (!richContent || richContent.blocks.length === 0) {
    return <MarkdownBlock content={content} />;
  }

  return (
    <div className="space-y-3">
      {richContent.blocks.map((block, index) => {
        if (block.type === 'formatted_text') {
          if (block.format === 'plain_text') {
            return (
              <p key={`${block.type}-${index}`} className="whitespace-pre-wrap leading-relaxed text-sm">
                {block.text}
              </p>
            );
          }
          return <MarkdownBlock key={`${block.type}-${index}`} content={block.text} />;
        }

        if (block.type === 'code_block') {
          return (
            <div key={`${block.type}-${index}`} className="space-y-1">
              {block.language ? (
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                  {block.language}
                </div>
              ) : null}
              <pre className="overflow-x-auto rounded-xl border border-border/40 bg-muted/40 px-3 py-3 text-[13px] leading-relaxed">
                <code>{block.code}</code>
              </pre>
            </div>
          );
        }

        if (block.type === 'image') {
          return (
            <a
              key={`${block.type}-${index}`}
              href={block.url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-2xl border border-border/40 bg-background/70 transition-colors hover:border-primary/40"
            >
              <img src={block.url} alt={block.alt ?? 'Assistant image'} className="max-h-80 w-full object-cover" />
              <div className="px-3 py-2 text-xs text-muted-foreground/70">
                {block.alt ?? block.url}
              </div>
            </a>
          );
        }

        if (block.type === 'link_list') {
          return (
            <div key={`${block.type}-${index}`} className="space-y-2">
              {block.items.map((item) => (
                <LinkCard key={`${item.url}-${item.label}`} item={item} />
              ))}
            </div>
          );
        }

        return (
          <div key={`${block.type}-${index}`} className="flex flex-wrap gap-2">
            {block.items.map((item) => (
              <a
                key={`${item.url}-${item.label}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors',
                  'hover:border-primary/40 hover:bg-primary/15',
                )}
              >
                {item.label}
              </a>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function LinkCard({ item }: { item: LinkTarget }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between rounded-xl border border-border/40 bg-background/60 px-3 py-2 transition-colors hover:border-primary/35 hover:bg-background/80"
    >
      <span className="text-sm font-medium text-foreground/85">{item.label}</span>
      <span className="ml-3 truncate text-[11px] text-muted-foreground/70">{item.url}</span>
    </a>
  );
}

function MarkdownBlock({ content }: { content: string }) {
  return (
    <div
      className={cn(
        'prose prose-invert prose-sm max-w-none',
        'prose-p:my-1 prose-p:leading-relaxed',
        'prose-pre:rounded-lg prose-pre:border prose-pre:border-border/40 prose-pre:bg-muted/50',
        'prose-code:rounded prose-code:bg-muted/40 prose-code:px-1 prose-code:text-primary/90',
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
