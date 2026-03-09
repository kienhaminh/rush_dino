import { describe, expect, it } from 'vitest';

import { defaultDmPolicyForChannel, getOpenClawChannelFields } from './channel-openclaw-settings';

function dmPolicyValues(channel: Parameters<typeof getOpenClawChannelFields>[0]) {
  return (
    getOpenClawChannelFields(channel)
      .find((field) => field.key === 'dmPolicy')
      ?.options?.map((option) => option.value) ?? []
  );
}

describe('channel pairing option visibility', () => {
  it('shows pairing for telegram and discord', () => {
    expect(dmPolicyValues('telegram')).toContain('pairing');
    expect(dmPolicyValues('discord')).toContain('pairing');
  });

  it('does not show pairing for slack', () => {
    expect(dmPolicyValues('slack')).not.toContain('pairing');
  });

  it('defaults telegram and discord connects to pairing', () => {
    expect(defaultDmPolicyForChannel('telegram')).toBe('pairing');
    expect(defaultDmPolicyForChannel('discord')).toBe('pairing');
  });

  it('keeps slack on open by default', () => {
    expect(defaultDmPolicyForChannel('slack')).toBe('open');
  });
});
