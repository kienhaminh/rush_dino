/**
 * Model pricing table — sourced from docs/provider-model-prices.json.
 * Prices are USD per 1 million tokens.
 */
interface ModelPrices {
  input: number;
  output: number;
}

type ProviderPriceMap = Record<string, ModelPrices>;

const PRICES: Record<string, ProviderPriceMap> = {
  openai: {
    'gpt-5': { input: 1.25, output: 10 },
    'gpt-5-pro': { input: 15, output: 120 },
    'gpt-5.1': { input: 1.25, output: 10 },
    'gpt-5.2': { input: 1.75, output: 14 },
    'gpt-4.1': { input: 2, output: 8 },
    'gpt-4.1-mini': { input: 0.4, output: 1.6 },
    'o4-mini': { input: 1.1, output: 4.4 },
    o3: { input: 2, output: 8 },
    'o3-mini': { input: 1.1, output: 4.4 },
    'gpt-5.3-codex': { input: 1.75, output: 14 },
    'gpt-5.1-codex-max': { input: 1.25, output: 10 },
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    o1: { input: 15, output: 60 },
  },
  openai_codex: {
    'gpt-5': { input: 1.25, output: 10 },
    'gpt-5-pro': { input: 15, output: 120 },
    'gpt-5.1': { input: 1.25, output: 10 },
    'gpt-5.2': { input: 1.75, output: 14 },
    'gpt-4.1': { input: 2, output: 8 },
    'gpt-4.1-mini': { input: 0.4, output: 1.6 },
    'o4-mini': { input: 1.1, output: 4.4 },
    o3: { input: 2, output: 8 },
    'o3-mini': { input: 1.1, output: 4.4 },
    'gpt-5.3-codex': { input: 1.75, output: 14 },
    'gpt-5.1-codex-max': { input: 1.25, output: 10 },
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    o1: { input: 15, output: 60 },
  },
  anthropic: {
    'claude-3-7-sonnet-20250219': { input: 3, output: 15 },
    'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
    'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
    'claude-3-opus-20240229': { input: 15, output: 75 },
  },
};

/**
 * Compute estimated cost in USD for a single API call.
 * Returns 0 when the provider/model combination is not in the price table.
 */
export function computeCost(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const providerKey = provider.toLowerCase().replace(/-/g, '_');
  const providerPrices = PRICES[providerKey] ?? PRICES[provider.toLowerCase()];
  if (!providerPrices) return 0;
  const prices = providerPrices[model];
  if (!prices) return 0;
  return (promptTokens * prices.input + completionTokens * prices.output) / 1_000_000;
}

/**
 * Look up model prices by model name only, searching all providers.
 * Returns the first match found (useful when provider is unknown).
 */
export function lookupModelPriceAnyProvider(model: string): ModelPrices | null {
  for (const providerPrices of Object.values(PRICES)) {
    if (providerPrices[model]) return providerPrices[model];
  }
  return null;
}

/** Format a USD cost value for display. */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0.0000';
  if (usd < 0.0001) return '<$0.0001';
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}
