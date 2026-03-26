import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToolUseBlock } from './tool-use-block';
import type { ConversationItem } from '@/lib/types';

type ToolItem = Extract<ConversationItem, { kind: 'tool_use' }>;

function makeItem(overrides: Partial<ToolItem>): ToolItem {
  return {
    kind: 'tool_use',
    id: 'test-id',
    tool_name: 'read_file',
    args: { path: '/foo/bar.ts' },
    result: undefined,
    status: 'running',
    ...overrides,
  };
}

describe('ToolUseBlock', () => {
  it('does not render the old circular terminal icon', () => {
    const html = renderToStaticMarkup(<ToolUseBlock item={makeItem({ status: 'running' })} />);
    // The old icon was in a w-7 h-7 rounded-full div
    expect(html).not.toContain('rounded-full');
  });

  it('uses amber border while running', () => {
    const html = renderToStaticMarkup(<ToolUseBlock item={makeItem({ status: 'running' })} />);
    expect(html).toContain('border-amber-400');
  });

  it('uses green border when done', () => {
    const html = renderToStaticMarkup(<ToolUseBlock item={makeItem({ status: 'done' })} />);
    expect(html).toContain('border-emerald-400');
  });

  it('uses red border on error', () => {
    const html = renderToStaticMarkup(<ToolUseBlock item={makeItem({ status: 'error' })} />);
    expect(html).toContain('border-red-400');
  });

  it('shows tool name in header', () => {
    const html = renderToStaticMarkup(<ToolUseBlock item={makeItem({ tool_name: 'bash' })} />);
    expect(html).toContain('bash');
  });

  it('formats path args with INPUT label', () => {
    const html = renderToStaticMarkup(
      <ToolUseBlock item={makeItem({ status: 'running', args: { path: '/src/foo.ts' } })} />,
    );
    expect(html).toContain('INPUT');
    expect(html).toContain('/src/foo.ts');
  });

  it('formats command args as code block', () => {
    const html = renderToStaticMarkup(
      <ToolUseBlock item={makeItem({ status: 'running', args: { command: 'ls -la' } })} />,
    );
    expect(html).toContain('ls -la');
  });
});
