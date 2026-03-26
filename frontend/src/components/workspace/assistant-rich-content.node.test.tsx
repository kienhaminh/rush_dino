import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantRichContent } from './assistant-rich-content';

describe('AssistantRichContent', () => {
  it('renders cursor span when showCursor=true and no richContent', () => {
    const html = renderToStaticMarkup(
      <AssistantRichContent content="hello" richContent={null} showCursor={true} />,
    );
    // cursor is an inline-block span with animate-pulse
    expect(html).toContain('animate-pulse');
    expect(html).toContain('inline-block');
  });

  it('does not render cursor when showCursor=false', () => {
    const html = renderToStaticMarkup(
      <AssistantRichContent content="hello" richContent={null} showCursor={false} />,
    );
    expect(html).not.toContain('animate-pulse');
  });

  it('does not render cursor when richContent has blocks even if showCursor=true', () => {
    const html = renderToStaticMarkup(
      <AssistantRichContent
        content="hello"
        richContent={{ blocks: [{ type: 'formatted_text', format: 'markdown', text: 'hi' }] }}
        showCursor={true}
      />,
    );
    expect(html).not.toContain('animate-pulse');
  });

  it('renders cursor when showCursor=true and richContent has zero blocks', () => {
    const html = renderToStaticMarkup(
      <AssistantRichContent content="" richContent={{ blocks: [] }} showCursor={true} />,
    );
    expect(html).toContain('animate-pulse');
  });
});
