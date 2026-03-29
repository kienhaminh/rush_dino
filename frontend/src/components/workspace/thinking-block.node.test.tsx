import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThinkingBlock } from './thinking-block';

describe('ThinkingBlock', () => {
  it('shows "Thinking…" label when not done', () => {
    const html = renderToStaticMarkup(<ThinkingBlock content="some text" done={false} />);
    expect(html).toContain('Thinking');
    expect(html).not.toContain('Thought for a moment');
  });

  it('shows "Thought for a moment" label when done', () => {
    const html = renderToStaticMarkup(<ThinkingBlock content="some text" done={true} />);
    expect(html).toContain('Thought for a moment');
    expect(html).not.toContain('Thinking…');
  });

  it('uses left-border accent container (no rounded bubble)', () => {
    const html = renderToStaticMarkup(<ThinkingBlock content="abc" done={false} />);
    expect(html).toContain('border-l-2');
    // Should NOT use the old rounded bubble class
    expect(html).not.toContain('rounded-[18px]');
  });

  it('shows content text when not done (live streaming state)', () => {
    const html = renderToStaticMarkup(<ThinkingBlock content="my thoughts" done={false} />);
    expect(html).toContain('my thoughts');
  });

  it('renders nothing below header when content is empty and not done', () => {
    const html = renderToStaticMarkup(<ThinkingBlock content="" done={false} />);
    // Dots animation only in header; content <p> should not render when content is empty
    expect(html).not.toContain('whitespace-pre-wrap');
  });
});
