// Core HTTP client utilities — event constants and the JSON parsing helper.

export const DASHBOARD_AUTH_REQUIRED_EVENT = 'rushdino:dashboard-auth-required';

export async function parseJsonOrThrow(response: Response, endpoint: string) {
  const contentType = response.headers.get('content-type') ?? '';
  const raw = await response.text();

  if (!response.ok) {
    if (contentType.includes('application/json')) {
      try {
        const data = JSON.parse(raw);
        if (response.status === 401 && data?.error === 'dashboard_auth_required') {
          window.dispatchEvent(new CustomEvent(DASHBOARD_AUTH_REQUIRED_EVENT));
        }
        const errorMessage =
          typeof data?.error === 'string'
            ? data.error
            : typeof data?.message === 'string'
              ? data.message
              : null;
        if (errorMessage) {
          throw new Error(errorMessage);
        }
      } catch (error) {
        if (error instanceof Error && error.message) {
          throw error;
        }
      }
    }
    throw new Error(`Request failed for ${endpoint} (${response.status})`);
  }

  if (!contentType.includes('application/json')) {
    if (raw.trimStart().startsWith('<')) {
      throw new Error(
        `API ${endpoint} returned HTML instead of JSON. Ensure rushdino-server is running with the new agents routes.`,
      );
    }
    throw new Error(`API ${endpoint} did not return JSON.`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`API ${endpoint} returned invalid JSON.`);
  }
}
