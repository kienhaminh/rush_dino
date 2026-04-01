// System API — summary and doctor diagnostics report.

import { parseJsonOrThrow } from './client';
import type { SystemSummaryResponse, DoctorReportResponse } from '../types';

export async function fetchSystemSummary(): Promise<SystemSummaryResponse> {
  const endpoint = '/api/system/summary';
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchDoctorReport(): Promise<DoctorReportResponse> {
  const endpoint = '/api/system/doctor';
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}
