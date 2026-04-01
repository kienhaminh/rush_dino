import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConversationMetricsBar } from './conversation-metrics-bar';
import type { ConversationMetrics } from '@/lib/types';

const baseMetrics: ConversationMetrics = {
  provider: 'anthropic',
  model: 'claude-opus-4-6',
  promptTokens: 12450,
  completionTokens: 843,
  totalTokens: 13293,
  limitTokens: 200000,
  inputCost: 0.018675,
  outputCost: 0.012645,
  totalCost: 0.03132,
  responseTimeMs: 4200,
  measuredAt: '2026-03-30T00:00:00Z',
};

describe('ConversationMetricsBar', () => {
  it('renders context percentage when limitTokens is set', () => {
    const html = renderToStaticMarkup(<ConversationMetricsBar metrics={baseMetrics} />);
    // 13293 / 200000 = 6.6%
    expect(html).toContain('6.6%');
  });

  it('renders the circular SVG ring', () => {
    const html = renderToStaticMarkup(<ConversationMetricsBar metrics={baseMetrics} />);
    expect(html).toContain('<svg');
    expect(html).toContain('stroke-dasharray');
  });

  it('renders response time in seconds when >= 1000ms', () => {
    const html = renderToStaticMarkup(<ConversationMetricsBar metrics={baseMetrics} />);
    expect(html).toContain('4.2s');
  });

  it('renders response time in ms when < 1000ms', () => {
    const html = renderToStaticMarkup(
      <ConversationMetricsBar metrics={{ ...baseMetrics, responseTimeMs: 350 }} />,
    );
    expect(html).toContain('350ms');
  });

  it('renders abbreviated token counts above 10k', () => {
    const html = renderToStaticMarkup(<ConversationMetricsBar metrics={baseMetrics} />);
    expect(html).toContain('12.5k');
    expect(html).toContain('843');
  });

  it('renders model and provider', () => {
    const html = renderToStaticMarkup(<ConversationMetricsBar metrics={baseMetrics} />);
    expect(html).toContain('claude-opus-4-6');
    expect(html).toContain('anthropic');
  });

  it('renders cost when totalCost > 0', () => {
    const html = renderToStaticMarkup(<ConversationMetricsBar metrics={baseMetrics} />);
    expect(html).toContain('$0.0313');
  });

  it('omits cost when totalCost is 0', () => {
    const html = renderToStaticMarkup(
      <ConversationMetricsBar metrics={{ ...baseMetrics, totalCost: 0 }} />,
    );
    expect(html).not.toContain('$');
  });

  it('omits context ring when limitTokens is null', () => {
    const html = renderToStaticMarkup(
      <ConversationMetricsBar metrics={{ ...baseMetrics, limitTokens: null }} />,
    );
    expect(html).not.toContain('<svg');
  });

  it('omits response time when responseTimeMs is null', () => {
    const html = renderToStaticMarkup(
      <ConversationMetricsBar metrics={{ ...baseMetrics, responseTimeMs: null }} />,
    );
    expect(html).not.toContain('⏱');
  });
});
