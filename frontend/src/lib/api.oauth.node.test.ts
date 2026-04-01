import { afterEach, describe, expect, it, vi } from 'vitest';

import { completeOAuthConnect, startOAuthConnect } from './api';

describe('OAuth connect API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts OAuth by requesting an auth URL and session id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ session_id: 'session-1', auth_url: 'https://auth.test/link' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const response = await startOAuthConnect('profile-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/providers/profile-1/connect-oauth/start', {
      method: 'POST',
    });
    expect(response).toEqual({
      session_id: 'session-1',
      auth_url: 'https://auth.test/link',
    });
  });

  it('completes OAuth by posting the session id and pasted redirect URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'connected' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const response = await completeOAuthConnect('profile-1', {
      session_id: 'session-1',
      redirect_url: 'http://localhost:1455/auth/callback?code=abc123&state=expected',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/providers/profile-1/connect-oauth/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_id: 'session-1',
        redirect_url: 'http://localhost:1455/auth/callback?code=abc123&state=expected',
      }),
    });
    expect(response).toEqual({ status: 'connected' });
  });
});
