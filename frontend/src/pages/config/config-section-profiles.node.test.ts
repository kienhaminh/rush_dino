import { describe, expect, it } from 'vitest';

import {
  formatAuthLabel,
  isAnthropicOAuthProfile,
  isCodexOAuthProfile,
  normalizeOAuthRedirectInput,
  resolveProviderKindAndAuth,
} from './config-profile-utils';

describe('config-section-profiles helpers', () => {
  it('maps Codex OAuth selection to OpenAI plus OAuth', () => {
    expect(resolveProviderKindAndAuth('openai', 'codex_oauth')).toEqual({
      provider_kind: 'openai',
      auth_method: 'oauth',
    });
  });

  it('treats OpenAI OAuth profiles as Codex profiles in the UI', () => {
    const profile = {
      id: 'profile-1',
      name: 'Codex',
      provider_kind: 'openai',
      auth_method: 'oauth',
      default_model: 'gpt-5.3-codex',
    } as const;

    expect(isCodexOAuthProfile(profile)).toBe(true);
    expect(formatAuthLabel(profile)).toBe('Codex (OAuth)');
  });

  it('trims pasted OAuth redirect input before submit', () => {
    expect(normalizeOAuthRedirectInput('  http://localhost:1455/auth/callback?code=abc123  ')).toBe(
      'http://localhost:1455/auth/callback?code=abc123',
    );
    expect(normalizeOAuthRedirectInput('   ')).toBe('');
  });

  // Test isAnthropicOAuthProfile
  it('identifies Anthropic OAuth profiles correctly', () => {
    expect(isAnthropicOAuthProfile({ provider_kind: 'anthropic', auth_method: 'oauth' })).toBe(true);
  });

  it('rejects non-Anthropic profiles for isAnthropicOAuthProfile', () => {
    expect(isAnthropicOAuthProfile({ provider_kind: 'openai', auth_method: 'oauth' })).toBe(false);
    expect(isAnthropicOAuthProfile({ provider_kind: 'anthropic', auth_method: 'apikey' })).toBe(false);
  });

  // Test resolveProviderKindAndAuth for Anthropic
  it('maps Anthropic OAuth to anthropic+oauth', () => {
    expect(resolveProviderKindAndAuth('anthropic', 'anthropic_oauth')).toEqual({
      provider_kind: 'anthropic',
      auth_method: 'oauth',
    });
  });

  it('maps Anthropic apikey to anthropic+apikey', () => {
    expect(resolveProviderKindAndAuth('anthropic', 'apikey')).toEqual({
      provider_kind: 'anthropic',
      auth_method: 'apikey',
    });
  });

  // Test formatAuthLabel for Anthropic OAuth
  it('returns Anthropic OAuth label for anthropic oauth profiles', () => {
    expect(formatAuthLabel({ provider_kind: 'anthropic', auth_method: 'oauth' })).toBe('Anthropic OAuth');
  });
});
