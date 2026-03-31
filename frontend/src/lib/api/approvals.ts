// Approvals API — resolve pending tool-use approval requests.

import { parseJsonOrThrow } from './client';

export async function resolveApproval(
  requestId: string,
  payload: { approved: boolean; sessionId: string },
): Promise<{ request_id: string; status: string }> {
  const endpoint = `/api/approval/${encodeURIComponent(requestId)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      approved: payload.approved,
      session_id: payload.sessionId,
    }),
  });
  return parseJsonOrThrow(response, endpoint);
}
