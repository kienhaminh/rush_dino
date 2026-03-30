import { memo, useEffect, useMemo, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import { AssistantRichContent } from './assistant-rich-content';
import { DelegateBlock } from './delegate-block';
import { ThinkingBlock } from './thinking-block';
import { ToolUseBlock } from './tool-use-block';
import { ToolUseGroup } from './tool-use-group';
import { ConversationMetricsBar } from './conversation-metrics-bar';
import type { ConversationItem, ConversationMetrics } from '@/lib/types';

interface ConversationTimelineProps {
  items: ConversationItem[];
  isStreaming?: boolean;
  latestMetrics?: ConversationMetrics | null;
  onResolveInputRequest?: (
    requestId: string,
    status: 'submitted' | 'cancelled',
    values?: Record<string, unknown> | null,
  ) => void;
}

// ── Grouping ─────────────────────────────────────────────────────────────────
// Consecutive tool_use items are bundled into a single collapsible group so
// the timeline stays clean even when the agent calls many tools in a turn.
// Thinking items that immediately precede a tool group are bundled into that
// same group so they appear inside the collapsible alongside the tool calls.

type ToolItem = Extract<ConversationItem, { kind: 'tool_use' }>;
type ThinkingItem = Extract<ConversationItem, { kind: 'thinking' }>;

const DELEGATE_TOOLS = new Set(['delegate', 'delegate_to_agent', 'spawn_agents']);

function isDelegate(item: ConversationItem): item is ToolItem {
  return item.kind === 'tool_use' && DELEGATE_TOOLS.has(item.tool_name);
}

type DisplayGroup =
  | { type: 'item'; item: ConversationItem }
  | { type: 'tool_group'; thinking: ThinkingItem[]; tools: ToolItem[]; id: string }
  | { type: 'delegate_group'; delegates: ToolItem[]; id: string };

function groupItems(items: ConversationItem[]): DisplayGroup[] {
  const result: DisplayGroup[] = [];
  let i = 0;
  while (i < items.length) {
    // Collect a run of thinking items, then decide whether to attach them to
    // the following tool group or emit them as standalone items.
    if (items[i].kind === 'thinking') {
      const thinking: ThinkingItem[] = [];
      while (i < items.length && items[i].kind === 'thinking') {
        thinking.push(items[i] as ThinkingItem);
        i++;
      }
      // Peek: are the next items tool_use? If so, bundle thinking with them.
      if (i < items.length && items[i].kind === 'tool_use') {
        const tools: ToolItem[] = [];
        const delegates: ToolItem[] = [];
        while (i < items.length && items[i].kind === 'tool_use') {
          if (isDelegate(items[i])) {
            delegates.push(items[i] as ToolItem);
          } else {
            tools.push(items[i] as ToolItem);
          }
          i++;
        }
        if (tools.length > 0) {
          result.push({ type: 'tool_group', thinking, tools, id: thinking[0]?.id ?? tools[0].id });
        } else {
          // Only delegates — emit thinking standalone, then delegates.
          for (const t of thinking) result.push({ type: 'item', item: t });
        }
        if (delegates.length > 0) {
          result.push({ type: 'delegate_group', delegates, id: delegates[0].id });
        }
      } else {
        // Not followed by tools — keep thinking as standalone items.
        for (const t of thinking) result.push({ type: 'item', item: t });
      }
    } else if (items[i].kind === 'tool_use') {
      const tools: ToolItem[] = [];
      const delegates: ToolItem[] = [];
      while (i < items.length && items[i].kind === 'tool_use') {
        if (isDelegate(items[i])) {
          delegates.push(items[i] as ToolItem);
        } else {
          tools.push(items[i] as ToolItem);
        }
        i++;
      }
      if (tools.length > 0) {
        result.push({ type: 'tool_group', thinking: [], tools, id: tools[0].id });
      }
      if (delegates.length > 0) {
        result.push({ type: 'delegate_group', delegates, id: delegates[0].id });
      }
    } else {
      result.push({ type: 'item', item: items[i] });
      i++;
    }
  }
  return result;
}

// ── Single item renderers ─────────────────────────────────────────────────────

interface TimelineItemProps {
  item: ConversationItem;
  showCursor?: boolean;
}

const TimelineItem = memo(function TimelineItem({
  item,
  showCursor,
}: TimelineItemProps) {
  if (item.kind === 'user') {
    return (
      <div className="flex justify-end py-1 mt-6">
        <div className="max-w-[80%] flex flex-col items-end gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 pr-1">
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
      <div className="flex justify-start py-1 mt-2">
        <div className="max-w-[85%] flex flex-col items-start gap-1">
          <div className="text-sm leading-relaxed text-foreground/90">
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

  // Standalone tool_use (should not appear — groups handle this — but kept as safety).
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

// ── Main timeline ─────────────────────────────────────────────────────────────

export const ConversationTimeline = memo(function ConversationTimeline({
  items,
  isStreaming,
  latestMetrics,
  onResolveInputRequest,
}: ConversationTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items, isStreaming]);

  // input_request items are never rendered in the timeline (they live in the
  // bottom panel while pending and are dismissed after resolution). Exclude them
  // before grouping so they don't break the thinking↔tool bundling logic.
  const timelineItems = useMemo(
    () => items.filter((item) => item.kind !== 'input_request'),
    [items],
  );
  const displayGroups = useMemo(() => groupItems(timelineItems), [timelineItems]);

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
  const hasPendingInputRequest = items.some(
    (item) => item.kind === 'input_request' && item.status === 'pending',
  );
  const showTypingBubble = isStreaming && !hasLiveThinking && !hasPendingInputRequest;

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-8 md:px-8">
      <div className="max-w-3xl mx-auto space-y-1 min-h-full flex flex-col justify-end">
        {displayGroups.map((group, index) => {
          const isLast = index === displayGroups.length - 1;

          if (group.type === 'tool_group') {
            return <ToolUseGroup key={group.id} thinking={group.thinking} tools={group.tools} />;
          }

          if (group.type === 'delegate_group') {
            return <DelegateBlock key={group.id} items={group.delegates} />;
          }

          const { item } = group;
          const showCursor = isStreaming === true && isLast && item.kind === 'assistant';
          const showMetrics =
            !isStreaming && latestMetrics != null && isLast && item.kind === 'assistant';

          return (
            <div key={item.id}>
              <TimelineItem
                item={item}
                showCursor={showCursor}
              />
              {showMetrics && <ConversationMetricsBar metrics={latestMetrics} />}
            </div>
          );
        })}

        {showTypingBubble && (
          <div className="flex justify-start py-1 animate-in fade-in duration-200">
            <div className="flex items-center gap-1.5 py-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
