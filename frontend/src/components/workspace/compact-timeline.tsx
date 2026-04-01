import { memo, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AssistantRichContent } from './assistant-rich-content';
import { ThinkingBlock } from './thinking-block';
import { ToolUseBlock } from './tool-use-block';
import { ToolUseGroup } from './tool-use-group';
import { DelegateBlock } from './delegate-block';
import { agentColor } from './agent-colors';
import type { ConversationItem } from '@/lib/types';

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
    if (items[i].kind === 'thinking') {
      const thinking: ThinkingItem[] = [];
      while (i < items.length && items[i].kind === 'thinking') {
        thinking.push(items[i] as ThinkingItem);
        i++;
      }
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
          for (const t of thinking) result.push({ type: 'item', item: t });
        }
        if (delegates.length > 0) {
          result.push({ type: 'delegate_group', delegates, id: delegates[0].id });
        }
      } else {
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

interface CompactTimelineProps {
  items: ConversationItem[];
  agentName: string;
  isRunning?: boolean;
}

/** A compact, nested timeline for displaying a delegate agent's internal
 *  conversation inline. Reuses the same rendering components as the main
 *  timeline but with tighter spacing and a colored left border accent. */
export const CompactTimeline = memo(function CompactTimeline({
  items,
  agentName,
  isRunning,
}: CompactTimelineProps) {
  const colorClasses = agentColor(agentName);
  const displayGroups = useMemo(() => groupItems(items), [items]);

  if (items.length === 0 && !isRunning) {
    return (
      <p className="text-[11px] text-muted-foreground/40 px-3 py-2">
        No internal conversation recorded.
      </p>
    );
  }

  return (
    <div className={cn('border-l-2 pl-3 space-y-0.5', colorClasses.split(' ')[0] ? 'border-current' : 'border-muted-foreground/20')}>
      {displayGroups.map((group) => {
        if (group.type === 'tool_group') {
          return <ToolUseGroup key={group.id} thinking={group.thinking} tools={group.tools} />;
        }

        if (group.type === 'delegate_group') {
          return <DelegateBlock key={group.id} items={group.delegates} />;
        }

        const { item } = group;

        if (item.kind === 'user') {
          return null; // Skip the task prompt — already shown in the header
        }

        if (item.kind === 'assistant') {
          return (
            <div key={item.id} className="py-0.5">
              <div className="text-[12px] leading-relaxed text-foreground/80">
                <AssistantRichContent
                  content={item.content}
                  richContent={item.richContent ?? null}
                />
              </div>
            </div>
          );
        }

        if (item.kind === 'thinking') {
          return <ThinkingBlock key={item.id} content={item.content} done={item.done} />;
        }

        if (item.kind === 'tool_use') {
          return <ToolUseBlock key={item.id} item={item} />;
        }

        if (item.kind === 'error') {
          return (
            <div key={item.id} className="text-[11px] text-destructive bg-destructive/10 rounded px-2 py-1">
              {item.message}
            </div>
          );
        }

        return null;
      })}

      {isRunning && items.length === 0 && (
        <div className="flex items-center gap-1.5 py-1.5 text-[11px] text-muted-foreground/50">
          <Loader2 size={10} className="animate-spin" />
          <span>Agent is working…</span>
        </div>
      )}
    </div>
  );
});
