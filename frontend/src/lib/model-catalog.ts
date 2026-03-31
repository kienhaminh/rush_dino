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
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    description: 'Frontier model for complex professional work',
    contextWindow: 1_050_000,
    isReasoning: true,
  },
  {
    id: 'gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    description: 'Fast, efficient iteration of 4.1',
    contextWindow: 128_000,
  },
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    description: 'Advanced GPT-4 capability',
    contextWindow: 128_000,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Omni model, most capable and versatile',
    contextWindow: 128_000,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast, affordable small model for lightweight tasks',
    contextWindow: 128_000,
  },
  {
    id: 'o4-mini',
    name: 'o4 Mini',
    description: 'Latest compact reasoning model',
    contextWindow: 200_000,
    isReasoning: true,
  },
  {
    id: 'o3',
    name: 'o3',
    description: 'Fastest reasoning model framework',
    contextWindow: 200_000,
    isReasoning: true,
  },
  {
    id: 'o3-mini',
    name: 'o3 Mini',
    description: 'Fastest reasoning model for coding/math',
    contextWindow: 200_000,
    isReasoning: true,
  },
  {
    id: 'o1',
    name: 'o1',
    description: 'Reasoning model for complex technical tasks',
    contextWindow: 128_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5',
    name: 'GPT-5',
    description: 'Next-generation flagship model',
    contextWindow: 256_000,
  },
  {
    id: 'gpt-5-pro',
    name: 'GPT-5 Pro',
    description: 'Highly capable professional model',
    contextWindow: 256_000,
    isReasoning: true,
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    description: 'Incremental update to GPT-5',
    contextWindow: 256_000,
  },
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    description: 'Latest GPT-5 iteration',
    contextWindow: 256_000,
  },
];

// Codex (OAuth) models — only available via ChatGPT OAuth
const OPENAI_CODEX_MODELS: CatalogModel[] = [
  ...OPENAI_APIKEY_MODELS,
  {
    id: 'gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    description: 'Codex model — requires Codex (OAuth) authentication',
    contextWindow: 256_000,
  },
  {
    id: 'gpt-5.1-codex-max',
    name: 'GPT-5.1 Codex Max',
    description: 'High-capacity Codex model — requires Codex (OAuth) authentication',
    contextWindow: 256_000,
  },
];

const ANTHROPIC_MODELS: CatalogModel[] = [
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
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    description: 'Fast, cost-effective model for lightweight tasks',
    contextWindow: 200_000,
    isReasoning: false,
  },
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
