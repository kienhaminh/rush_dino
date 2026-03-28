import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  vi.clearAllMocks();
});

function makeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('fetchMcpStatus', () => {
  it('GET /api/mcp/status and returns server list', async () => {
    const { fetchMcpStatus } = await import('../api');
    mockFetch.mockResolvedValueOnce(
      makeResponse([{ name: 'fs-mcp', url: 'http://localhost:9001', connected: true, tool_count: 5 }]),
    );
    const result = await fetchMcpStatus();
    expect(mockFetch).toHaveBeenCalledWith('/api/mcp/status');
    expect(result[0].name).toBe('fs-mcp');
    expect(result[0].connected).toBe(true);
  });
});

describe('patchSessionMcpPolicy', () => {
  it('PATCH /api/sessions/{id}/sandbox/mcp with policy body', async () => {
    const { patchSessionMcpPolicy } = await import('../api');
    mockFetch.mockResolvedValueOnce(makeResponse({}));
    await patchSessionMcpPolicy('sess-1', {
      default: 'deny',
      servers: { 'fs-mcp': 'allow' },
      inbound: { max_size_kb: 64, strip_patterns: [], block_on_match: true },
    });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/sessions/sess-1/sandbox/mcp',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

describe('patchSessionBashPolicy', () => {
  it('PATCH /api/sessions/{id}/sandbox/process with policy body', async () => {
    const { patchSessionBashPolicy } = await import('../api');
    mockFetch.mockResolvedValueOnce(makeResponse({}));
    await patchSessionBashPolicy('sess-1', {
      allow_privileged: false,
      max_concurrent: 3,
      deny_commands: ['sudo'],
      timeout_seconds: 30,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/sessions/sess-1/sandbox/process',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
