const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  openai_codex: 'Codex (ChatGPT)',
  anthropic: 'Anthropic',
  ollama: 'Ollama (Local)',
  plugin: 'Plugin',
};

export function formatProviderLabel(provider: string | null | undefined): string {
  if (!provider) return 'Unknown';

  return (
    PROVIDER_LABELS[provider] ??
    provider
      .split(/[_-]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ')
  );
}
