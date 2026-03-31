export interface DashboardAuthStatusResponse {
  enabled: boolean;
  authenticated: boolean;
  expiresAt?: string | null;
}
