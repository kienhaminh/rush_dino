// Dashboard authentication API — status, code exchange, and logout.

import { parseJsonOrThrow } from './client';
import type { DashboardAuthStatusResponse } from '../types';

export async function fetchDashboardAuthStatus(): Promise<DashboardAuthStatusResponse> {
  const response = await fetch('/api/dashboard-auth/status');
  return parseJsonOrThrow(response, '/api/dashboard-auth/status');
}

export async function exchangeDashboardAuthCode(
  code: string,
): Promise<DashboardAuthStatusResponse> {
  const response = await fetch('/api/dashboard-auth/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return parseJsonOrThrow(response, '/api/dashboard-auth/exchange');
}

export async function logoutDashboardAuthSession(): Promise<void> {
  const response = await fetch('/api/dashboard-auth/logout', { method: 'POST' });
  if (!response.ok) {
    await parseJsonOrThrow(response, '/api/dashboard-auth/logout');
  }
}
