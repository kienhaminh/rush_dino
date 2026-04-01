import { useEffect, useState } from 'react';
import { Bot, ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { agentColor } from './agent-colors';
import { CompactTimeline } from './compact-timeline';
import { SubAgentMarkdown } from './sub-agent-markdown';
import { fetchConversation } from '@/lib/api';
import { messagesToItems } from '@/lib/message-converter';
import { useChatWs } from '@/hooks/use-chat-ws';
import type { ConversationItem } from '@/lib/types';

type ToolItem = Extract<ConversationItem, { kind: 'tool_use' }>;

interface DelegateBlockProps {
  items: ToolItem[];
}

export function DelegateBlock({ items }: DelegateBlockProps) {
  return (
    <div className="py-1 space-y-1.5 animate-in fade-in duration-200">
      {items.map((item) => (
        <DelegateRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function DelegateRow({ item }: { item: ToolItem }) {
  const [expanded, setExpanded] = useState(false);
  const [fetchedItems, setFetchedItems] = useState<ConversationItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const { delegateItems, delegateItemsRevision } = useChatWs();

  const args = item.args as Record<string, string>;
  const agentName = args.agent_name ?? 'Agent';
  const task = args.task ?? '';
  const isRunning = item.status === 'running';
  const isDone = item.status === 'done';
  const isError = item.status === 'error';
  const colorClasses = agentColor(agentName);

  // Derive the delegate conversation ID (matches backend logic).
  const delegateConvId = agentName.toLowerCase().replace(/ /g, '-');

  // Get live-streamed items from the WS delegate items map.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const liveItems = delegateItems.get(delegateConvId) ?? null;

  // Determine which items to show: prefer live WS items, fall back to fetched.
  const timelineItems = liveItems ?? fetchedItems;
  const hasTimeline = timelineItems != null && timelineItems.length > 0;

  // Auto-expand while the delegate is running and has live items.
  useEffect(() => {
    if (isRunning && liveItems && liveItems.length > 0) {
      setExpanded(true);
    }
  }, [isRunning, liveItems]);

  // Lazy-fetch from REST when expanded and no live items available (e.g. after page refresh).
  useEffect(() => {
    if (!expanded || liveItems || fetchedItems || loading) return;
    if (!isDone && !isError) return;

    setLoading(true);
    fetchConversation(delegateConvId)
      .then((detail) => {
        const items = messagesToItems(detail.messages, [], null).filter(
          (it) => it.kind !== 'user', // skip the task prompt
        );
        setFetchedItems(items);
      })
      .catch(() => setFetchedItems([]))
      .finally(() => setLoading(false));
  }, [expanded, liveItems, fetchedItems, loading, isDone, isError, delegateConvId]);

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden transition-colors',
      isRunning ? 'border-amber-400/20 bg-amber-400/[0.02]' : 'border-border/25 bg-muted/[0.03]',
    )}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/10 transition-colors"
      >
        {/* Agent icon */}
        <div className="shrink-0 w-5 h-5 rounded-md bg-muted/30 flex items-center justify-center">
          <Bot size={11} className="text-muted-foreground/50" />
        </div>

        {/* Agent badge */}
        <span className={cn(
          'text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 border',
          colorClasses,
        )}>
          {agentName}
        </span>

        {/* Task description */}
        <span className="text-[11px] text-foreground/60 truncate flex-1 min-w-0">
          {task}
        </span>

        {/* Status */}
        <span className="shrink-0">
          {isRunning && <Loader2 size={12} className="text-amber-400 animate-spin" />}
          {isDone && <CheckCircle2 size={12} className="text-emerald-400/70" />}
          {isError && <XCircle size={12} className="text-red-400/70" />}
        </span>

        {/* Expand chevron */}
        <span className="shrink-0">
          {expanded
            ? <ChevronDown size={10} className="text-muted-foreground/30" />
            : <ChevronRight size={10} className="text-muted-foreground/30" />}
        </span>
      </button>

      {/* Expanded internal conversation */}
      {expanded && (
        <div className="border-t border-border/15 px-3 py-2 max-h-80 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 size={14} className="animate-spin text-muted-foreground/40" />
            </div>
          ) : hasTimeline ? (
            <CompactTimeline
              items={timelineItems}
              agentName={agentName}
              isRunning={isRunning}
            />
          ) : isRunning ? (
            <CompactTimeline items={[]} agentName={agentName} isRunning />
          ) : item.result ? (
            /* Fallback: show the plain result text if no timeline is available */
            <div className="text-[11px] text-muted-foreground/70">
              <SubAgentMarkdown content={item.result} />
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">No details available.</p>
          )}
        </div>
      )}

      {/* Running indicator bar */}
      {isRunning && (
        <div className="h-[2px] bg-gradient-to-r from-transparent via-amber-400/30 to-transparent animate-pulse" />
      )}
    </div>
  );
}
