import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SandboxInboundFilterEditor } from './sandbox-inbound-filter-editor';
import type { SandboxInboundFilter } from '@/lib/types';

const baseFilter: SandboxInboundFilter = {
  max_size_kb: 64,
  strip_patterns: ['AKIA[A-Z0-9]{16}', 'sk-[A-Za-z0-9]{32,}'],
  block_on_match: true,
};

describe('SandboxInboundFilterEditor', () => {
  it('renders max_size_kb value', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxInboundFilterEditor, { value: baseFilter, onChange: () => {} }),
    );
    expect(html).toContain('64');
  });

  it('renders strip patterns', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxInboundFilterEditor, { value: baseFilter, onChange: () => {} }),
    );
    expect(html).toContain('AKIA[A-Z0-9]{16}');
    expect(html).toContain('sk-[A-Za-z0-9]{32,}');
  });

  it('renders block_on_match label', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxInboundFilterEditor, { value: baseFilter, onChange: () => {} }),
    );
    expect(html).toContain('Block on match');
  });

  it('renders empty strip patterns without crashing', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxInboundFilterEditor, {
        value: { ...baseFilter, strip_patterns: [] },
        onChange: () => {},
      }),
    );
    expect(html).toContain('No patterns');
  });
});
