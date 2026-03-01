import { QUERY_KEYS, normalizeQueryText, parseQueryNumber } from "./query-core.ts";
import { matchesUsageQuery } from "./query-match.ts";
import { extractQueryTerms } from "./query-terms.ts";
import type { UsageQueryResult, UsageSessionQueryTarget } from "./query-types.ts";

export const filterSessionsByQuery = <TSession extends UsageSessionQueryTarget>(
  sessions: TSession[],
  query: string,
): UsageQueryResult<TSession> => {
  const terms = extractQueryTerms(query);
  if (terms.length === 0) {
    return { sessions, warnings: [] };
  }

  const warnings: string[] = [];
  for (const term of terms) {
    if (!term.key) {
      continue;
    }
    const normalizedKey = normalizeQueryText(term.key);
    if (!QUERY_KEYS.has(normalizedKey)) {
      warnings.push(`Unknown filter: ${term.key}`);
      continue;
    }
    if (term.value === "") {
      warnings.push(`Missing value for ${term.key}`);
    }
    if (normalizedKey === "has") {
      const allowed = new Set([
        "tools",
        "errors",
        "context",
        "usage",
        "model",
        "provider",
      ]);
      if (term.value && !allowed.has(normalizeQueryText(term.value))) {
        warnings.push(`Unknown has:${term.value}`);
      }
    }
    if (
      [
        "mintokens",
        "maxtokens",
        "mincost",
        "maxcost",
        "minmessages",
        "maxmessages",
      ].includes(normalizedKey)
    ) {
      if (term.value && parseQueryNumber(term.value) === null) {
        warnings.push(`Invalid number for ${term.key}`);
      }
    }
  }

  const filtered = sessions.filter((session) =>
    terms.every((term) => matchesUsageQuery(session, term)),
  );
  return { sessions: filtered, warnings };
};
