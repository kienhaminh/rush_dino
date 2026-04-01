// Static model catalog — mirrors crates/providers/src/catalog.rs
// Update both files when models are added or removed.

export interface CatalogModel {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  isReasoning?: boolean;
}

// Regular OpenAI API Key models (non-Codex)
const OPENAI_APIKEY_MODELS: CatalogModel[] = [
  // --- GPT-5.4 family ---
  {
    id: 'gpt-5.4-pro',
    name: 'GPT-5.4 Pro',
    description: 'Extended-context frontier reasoning model',
    contextWindow: 1_050_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    description: 'Frontier reasoning model',
    contextWindow: 272_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    description: 'Fast frontier reasoning model',
    contextWindow: 400_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5.4-nano',
    name: 'GPT-5.4 Nano',
    description: 'Lightweight frontier reasoning model',
    contextWindow: 400_000,
    isReasoning: true,
  },
  // --- GPT-5.x family ---
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    description: 'Strong reasoning model',
    contextWindow: 400_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    description: 'Solid general-purpose reasoning model',
    contextWindow: 400_000,
    isReasoning: true,
  },
  // --- GPT-5 family ---
  {
    id: 'gpt-5',
    name: 'GPT-5',
    description: 'Flagship reasoning model',
    contextWindow: 400_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5-pro',
    name: 'GPT-5 Pro',
    description: 'Professional reasoning model',
    contextWindow: 400_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    description: 'Lightweight flagship reasoning model',
    contextWindow: 400_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5-nano',
    name: 'GPT-5 Nano',
    description: 'Smallest flagship reasoning model',
    contextWindow: 400_000,
    isReasoning: true,
  },
  // --- GPT-4.1 family ---
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    description: 'Large-context non-reasoning model',
    contextWindow: 1_047_576,
  },
  {
    id: 'gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    description: 'Fast, efficient non-reasoning model',
    contextWindow: 1_047_576,
  },
  {
    id: 'gpt-4.1-nano',
    name: 'GPT-4.1 Nano',
    description: 'Cheapest non-reasoning model',
    contextWindow: 1_047_576,
  },
  // --- o-series reasoning ---
  {
    id: 'o4-mini',
    name: 'o4 Mini',
    description: 'Compact reasoning model',
    contextWindow: 200_000,
    isReasoning: true,
  },
  {
    id: 'o3',
    name: 'o3',
    description: 'Strong reasoning model',
    contextWindow: 200_000,
    isReasoning: true,
  },
  {
    id: 'o3-pro',
    name: 'o3 Pro',
    description: 'Pro-tier reasoning model',
    contextWindow: 200_000,
    isReasoning: true,
  },
  {
    id: 'o3-mini',
    name: 'o3 Mini',
    description: 'Fast reasoning model for coding/math',
    contextWindow: 200_000,
    isReasoning: true,
  },
  // --- Legacy ---
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Omni model (Legacy)',
    contextWindow: 128_000,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Small omni model (Legacy)',
    contextWindow: 128_000,
  },
  {
    id: 'o1',
    name: 'o1',
    description: 'Reasoning model (Legacy)',
    contextWindow: 200_000,
    isReasoning: true,
  },
];

// Codex (OAuth) models — only available via ChatGPT OAuth
// Spreads all API key models + adds Codex-only variants
const OPENAI_CODEX_ONLY_MODELS: CatalogModel[] = [
  {
    id: 'gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    description: 'Codex model — requires Codex (OAuth) authentication',
    contextWindow: 400_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5.3-codex-spark',
    name: 'GPT-5.3 Codex Spark',
    description: 'Lightweight Codex model — requires Codex (OAuth) authentication',
    contextWindow: 128_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5.2-codex',
    name: 'GPT-5.2 Codex',
    description: 'Codex model — requires Codex (OAuth) authentication',
    contextWindow: 400_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5.2-pro',
    name: 'GPT-5.2 Pro',
    description: 'Pro-tier Codex model — requires Codex (OAuth) authentication',
    contextWindow: 400_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5.1-codex-max',
    name: 'GPT-5.1 Codex Max',
    description: 'High-capacity Codex model — requires Codex (OAuth) authentication',
    contextWindow: 400_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5.1-codex-mini',
    name: 'GPT-5.1 Codex Mini',
    description: 'Compact Codex model — requires Codex (OAuth) authentication',
    contextWindow: 400_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5-codex',
    name: 'GPT-5 Codex',
    description: 'Codex model — requires Codex (OAuth) authentication',
    contextWindow: 400_000,
    isReasoning: true,
  },
];

// Merged: API key models + Codex-only models (Codex overrides where IDs overlap)
const OPENAI_CODEX_MODELS: CatalogModel[] = (() => {
  const merged = [...OPENAI_APIKEY_MODELS];
  for (const codex of OPENAI_CODEX_ONLY_MODELS) {
    const idx = merged.findIndex((m) => m.id === codex.id);
    if (idx !== -1) {
      merged[idx] = codex;
    } else {
      merged.push(codex);
    }
  }
  return merged;
})();

const ANTHROPIC_MODELS: CatalogModel[] = [
  // --- Claude 4.6 family ---
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    description: 'Flagship Claude model for complex reasoning and tool use',
    contextWindow: 1_000_000,
    isReasoning: true,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    description: 'High-intelligence model for fast, strong reasoning',
    contextWindow: 1_000_000,
    isReasoning: true,
  },
  // --- Claude 4.5 family ---
  {
    id: 'claude-opus-4-5-20250620',
    name: 'Claude Opus 4.5',
    description: 'Powerful reasoning model with extended thinking',
    contextWindow: 200_000,
    isReasoning: true,
  },
  {
    id: 'claude-sonnet-4-5-20250514',
    name: 'Claude Sonnet 4.5',
    description: 'Balanced intelligence and speed with extended thinking',
    contextWindow: 200_000,
    isReasoning: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    description: 'Fast, cost-effective model for lightweight tasks',
    contextWindow: 200_000,
    isReasoning: true,
  },
  // --- Legacy ---
  {
    id: 'claude-3-7-sonnet-20250219',
    name: 'Claude 3.7 Sonnet',
    description: 'Extended thinking model with hybrid reasoning (Legacy)',
    contextWindow: 200_000,
    isReasoning: true,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    description: 'High-intelligence model (Legacy 2024 version)',
    contextWindow: 200_000,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    description: 'Fastest, most cost-effective model',
    contextWindow: 200_000,
  },
  {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    description: 'Powerful model for highly complex tasks',
    contextWindow: 200_000,
  },
];

/**
 * Returns the static catalog models for a given provider kind and auth method.
 * For Ollama, returns an empty array (models are discovered dynamically).
 */
export function getCatalogModels(
  providerKind: string,
  authMethod: string,
): CatalogModel[] {
  if (providerKind === 'anthropic') return ANTHROPIC_MODELS;
  if (providerKind === 'openai_codex' || authMethod === 'oauth') return OPENAI_CODEX_MODELS;
  if (providerKind === 'openai') return OPENAI_APIKEY_MODELS;
  return [];
}

/**
 * Returns the recommended default model ID for a given provider kind and auth method.
 */
export function getDefaultModelId(providerKind: string, authMethod: string): string {
  if (providerKind === 'anthropic') return 'claude-sonnet-4-6';
  if (providerKind === 'openai_codex' || authMethod === 'oauth') return 'gpt-5.3-codex';
  if (providerKind === 'openai') return 'gpt-4.1-mini';
  return 'llama3.2:latest';
}
