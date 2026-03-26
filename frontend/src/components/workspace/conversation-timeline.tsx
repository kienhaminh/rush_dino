import { memo, useEffect, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AssistantRichContent } from './assistant-rich-content';
import { ThinkingBlock } from './thinking-block';
import { ToolUseBlock } from './tool-use-block';
import type { ConversationItem } from '@/lib/types';

interface ConversationTimelineProps {
  items: ConversationItem[];
  isStreaming?: boolean;
}

interface TimelineItemProps {
  item: ConversationItem;
  showCursor?: boolean;
}

// Memoized so it only re-renders when its own `item` or `showCursor` ref changes.
// `showCursor` changes for at most two items per streaming event (new last + old last),
// preserving the O(1) re-render property during streaming.
const TimelineItem = memo(function TimelineItem({ item, showCursor }: TimelineItemProps) {
  if (item.kind === 'user') {
    return (
      <div className={cn('flex justify-end py-1', 'mt-6')}>
        <div className="max-w-[80%] flex flex-col items-end gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 pr-1">
            You
          </span>
          <div className="bg-primary/90 text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed shadow-lg shadow-primary/10">
            {item.content}
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === 'assistant') {
    return (
      <div className="flex justify-start py-1">
        <div className="max-w-[85%] flex flex-col items-start gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 pl-1">
            Assistant
          </span>
          <div className="bg-card text-foreground border border-border/40 rounded-[18px] rounded-bl-md px-4 py-3 text-sm shadow-sm">
            <AssistantRichContent
              content={item.content}
              richContent={item.richContent ?? null}
              showCursor={showCursor}
            />
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === 'thinking') {
    return <ThinkingBlock content={item.content} done={item.done} />;
  }

  if (item.kind === 'tool_use') {
    return <ToolUseBlock item={item} />;
  }

  if (item.kind === 'error') {
    return (
      <div className="flex items-center gap-2 py-1 px-2">
        <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          ⚠ {item.message}
        </div>
      </div>
    );
  }

  if (item.kind === 'approval') {
    return (
      <div className="flex justify-start py-1">
        <div className="bg-warning/10 border border-warning/30 rounded-xl px-4 py-3 text-sm space-y-1 max-w-[85%]">
          <p className="font-semibold text-warning text-[12px]">⚡ Approval Required</p>
          <p className="text-muted-foreground/80 text-[12px]">
            Tool: <span className="font-mono text-foreground/70">{item.tool}</span>
          </p>
        </div>
      </div>
    );
  }

  return null;
});

export const ConversationTimeline = memo(function ConversationTimeline({
  items,
  isStreaming,
}: ConversationTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items, isStreaming]);

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-2">
          <MessageSquare size={22} className="text-primary/60" />
        </div>
        <p className="text-sm font-medium text-foreground/70">Start a conversation</p>
        <p className="text-[12px] text-muted-foreground/60 max-w-xs">
          Send a message and watch the agent team work in real time.
        </p>
      </div>
    );
  }

  const hasLiveThinking = items.some((item) => item.kind === 'thinking' && !item.done);
  const showTypingBubble = isStreaming && !hasLiveThinking;

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-8 md:px-8">
      <div className="max-w-3xl mx-auto space-y-2 min-h-full flex flex-col justify-end">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const showCursor = isStreaming === true && isLast && item.kind === 'assistant';
          return (
            <TimelineItem
              key={item.id}
              item={item}
              showCursor={showCursor}
            />
          );
        })}

        {showTypingBubble && (
          <div className="flex justify-start py-1 animate-in fade-in duration-200">
            <div className="bg-card border border-border/40 rounded-xl px-4 py-3 shadow-sm">
              <div className="w-16 h-1 rounded-full bg-muted-foreground/30 animate-pulse" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
