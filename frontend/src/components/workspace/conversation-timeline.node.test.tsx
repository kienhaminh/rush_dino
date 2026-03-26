import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConversationTimeline } from './conversation-timeline';
import type { ConversationItem } from '@/lib/types';

const userItem: ConversationItem = {
  kind: 'user', id: 'u1', content: 'Hello',
};
const assistantItem: ConversationItem = {
  kind: 'assistant', id: 'a1', content: 'World', richContent: null, runId: null,
};

describe('ConversationTimeline', () => {
  it('uses py-8 container padding', () => {
    const html = renderToStaticMarkup(
      <ConversationTimeline items={[userItem]} isStreaming={false} />,
    );
    expect(html).toContain('py-8');
  });

  it('renders typing indicator as pulse bar (not bouncing dots) when streaming', () => {
    const html = renderToStaticMarkup(
      <ConversationTimeline items={[assistantItem]} isStreaming={true} />,
    );
    // Pulse bar uses animate-pulse with a width class
    expect(html).toContain('animate-pulse');
    // Old dots used animationDelay style — should NOT appear on the typing indicator
    expect(html).not.toContain('animationDelay');
  });

  it('passes showCursor to the last assistant item when streaming', () => {
    const html = renderToStaticMarkup(
      <ConversationTimeline items={[userItem, assistantItem]} isStreaming={true} />,
    );
    // The cursor span should appear (injected by AssistantRichContent when showCursor=true)
    expect(html).toContain('animate-pulse');
    expect(html).toContain('inline-block');
  });

  it('does not show cursor on non-last items', () => {
    const assistantFirst: ConversationItem = {
      kind: 'assistant', id: 'a0', content: 'First', richContent: null, runId: null,
    };
    const assistantLast: ConversationItem = {
      kind: 'assistant', id: 'a1', content: 'Last', richContent: null, runId: null,
    };
    const html = renderToStaticMarkup(
      <ConversationTimeline items={[assistantFirst, assistantLast]} isStreaming={true} />,
    );
    // Cursor should appear exactly once (only for the last item)
    const cursorCount = (html.match(/w-\[2px\]/g) ?? []).length;
    expect(cursorCount).toBe(1);
  });
});
