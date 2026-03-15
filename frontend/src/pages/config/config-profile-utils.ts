import type { AuthMethod, ProviderKind, ProviderProfile } from '../../lib/types';

export type UIProvider = 'openai' | 'anthropic' | 'ollama';
export type OpenAIAuthChoice = 'apikey' | 'codex_oauth';

export function isCodexOAuthProfile(
  profile: Pick<ProviderProfile, 'provider_kind' | 'auth_method'>,
): boolean {
  return (
    profile.auth_method === 'oauth' &&
    (profile.provider_kind === 'openai' || profile.provider_kind === 'openai_codex')
  );
}

export function formatAuthLabel(profile: Pick<ProviderProfile, 'provider_kind' | 'auth_method'>) {
  if (isCodexOAuthProfile(profile)) return 'Codex (OAuth)';
  if (profile.auth_method === 'apikey') return 'API Key';
  if (profile.auth_method === 'oauth') return 'OAuth';
  return profile.auth_method;
}

export function resolveProviderKindAndAuth(
  uiProvider: UIProvider,
  openAIAuthChoice: OpenAIAuthChoice,
): { provider_kind: ProviderKind; auth_method: AuthMethod } {
  if (uiProvider === 'openai') {
    if (openAIAuthChoice === 'codex_oauth') {
      return { provider_kind: 'openai', auth_method: 'oauth' };
    }
    return { provider_kind: 'openai', auth_method: 'apikey' };
  }
  if (uiProvider === 'anthropic') {
    return { provider_kind: 'anthropic', auth_method: 'apikey' };
  }
  return { provider_kind: 'ollama', auth_method: 'none' };
}
