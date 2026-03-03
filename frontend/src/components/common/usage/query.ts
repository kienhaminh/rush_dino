export type UsageQueryTerm = {
  key?: string;
  value: string;
  raw: string;
};

export type UsageQueryResult<TSession> = {
  sessions: TSession[];
  warnings: string[];
};

// Minimal shape required for query filtering. The usage view's real session type contains more fields.
export type UsageSessionQueryTarget = {
  key: string;
  label?: string;
  sessionId?: string;
  agentId?: string;
  channel?: string;
  chatType?: string;
  modelProvider?: string;
  providerOverride?: string;
  origin?: { provider?: string };
  model?: string;
  contextWeight?: unknown;
  usage?: {
    totalTokens?: number;
    totalCost?: number;
    messageCounts?: { total?: number; errors?: number };
    toolUsage?: { totalCalls?: number; tools?: Array<{ name: string }> };
    modelUsage?: Array<{ provider?: string; model?: string }>;
  } | null;
};

export const QUERY_KEYS = new Set([
  "agent",
  "channel",
  "chat",
  "provider",
  "model",
  "tool",
  "label",
  "key",
  "session",
  "id",
  "has",
  "mintokens",
  "maxtokens",
  "mincost",
  "maxcost",
  "minmessages",
  "maxmessages",
]);

export const HAS_QUERY_VALUES = new Set([
  "tools",
  "errors",
  "context",
  "usage",
  "model",
  "provider",
]);

export const NUMERIC_QUERY_KEYS = new Set([
  "mintokens",
  "maxtokens",
  "mincost",
  "maxcost",
  "minmessages",
  "maxmessages",
]);

export const normalizeQueryText = (value: string): string =>
  value.trim().toLowerCase();

export const globToRegex = (pattern: string): RegExp => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
};

export const parseQueryNumber = (value: string): number | null => {
  let raw = value.trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (raw.startsWith("$")) {
    raw = raw.slice(1);
  }
  let multiplier = 1;
  if (raw.endsWith("k")) {
    multiplier = 1_000;
    raw = raw.slice(0, -1);
  } else if (raw.endsWith("m")) {
    multiplier = 1_000_000;
    raw = raw.slice(0, -1);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed * multiplier;
};

export const extractQueryTerms = (query: string): UsageQueryTerm[] => {
  // Tokenize by whitespace, but allow quoted values with spaces.
  const rawTokens = query.match(/"[^"]+"|\S+/g) ?? [];
  return rawTokens.map((token) => {
    const cleaned = token.replace(/^"|"$/g, "");
    const idx = cleaned.indexOf(":");
    if (idx > 0) {
      const key = cleaned.slice(0, idx);
      const value = cleaned.slice(idx + 1);
      return { key, value, raw: cleaned };
    }
    return { value: cleaned, raw: cleaned };
  });
};

const getSessionText = (session: UsageSessionQueryTarget): string[] => {
  const items: Array<string | undefined> = [
    session.label,
    session.key,
    session.sessionId,
  ];
  return items
    .filter((item): item is string => Boolean(item))
    .map((item) => item.toLowerCase());
};

const getSessionProviders = (session: UsageSessionQueryTarget): string[] => {
  const providers = new Set<string>();
  if (session.modelProvider) {
    providers.add(session.modelProvider.toLowerCase());
  }
  if (session.providerOverride) {
    providers.add(session.providerOverride.toLowerCase());
  }
  if (session.origin?.provider) {
    providers.add(session.origin.provider.toLowerCase());
  }
  for (const entry of session.usage?.modelUsage ?? []) {
    if (entry.provider) {
      providers.add(entry.provider.toLowerCase());
    }
  }
  return Array.from(providers);
};

const getSessionModels = (session: UsageSessionQueryTarget): string[] => {
  const models = new Set<string>();
  if (session.model) {
    models.add(session.model.toLowerCase());
  }
  for (const entry of session.usage?.modelUsage ?? []) {
    if (entry.model) {
      models.add(entry.model.toLowerCase());
    }
  }
  return Array.from(models);
};

const getSessionTools = (session: UsageSessionQueryTarget): string[] =>
  (session.usage?.toolUsage?.tools ?? []).map((tool) =>
    tool.name.toLowerCase(),
  );

const matchesNumericThreshold = (
  actual: number,
  rawThreshold: string,
  kind: "min" | "max",
): boolean => {
  const threshold = parseQueryNumber(rawThreshold);
  if (threshold === null) {
    return true;
  }
  return kind === "min" ? actual >= threshold : actual <= threshold;
};

export const matchesUsageQuery = (
  session: UsageSessionQueryTarget,
  term: UsageQueryTerm,
): boolean => {
  const value = normalizeQueryText(term.value ?? "");
  if (!value) {
    return true;
  }
  if (!term.key) {
    return getSessionText(session).some((text) => text.includes(value));
  }

  const key = normalizeQueryText(term.key);
  switch (key) {
    case "agent":
      return session.agentId?.toLowerCase().includes(value) ?? false;
    case "channel":
      return session.channel?.toLowerCase().includes(value) ?? false;
    case "chat":
      return session.chatType?.toLowerCase().includes(value) ?? false;
    case "provider":
      return getSessionProviders(session).some((provider) =>
        provider.includes(value),
      );
    case "model":
      return getSessionModels(session).some((model) => model.includes(value));
    case "tool":
      return getSessionTools(session).some((tool) => tool.includes(value));
    case "label":
      return session.label?.toLowerCase().includes(value) ?? false;
    case "key":
    case "session":
    case "id":
      if (value.includes("*") || value.includes("?")) {
        const regex = globToRegex(value);
        return (
          regex.test(session.key) ||
          (session.sessionId ? regex.test(session.sessionId) : false)
        );
      }
      return (
        session.key.toLowerCase().includes(value) ||
        (session.sessionId?.toLowerCase().includes(value) ?? false)
      );
    case "has":
      switch (value) {
        case "tools":
          return (session.usage?.toolUsage?.totalCalls ?? 0) > 0;
        case "errors":
          return (session.usage?.messageCounts?.errors ?? 0) > 0;
        case "context":
          return Boolean(session.contextWeight);
        case "usage":
          return Boolean(session.usage);
        case "model":
          return getSessionModels(session).length > 0;
        case "provider":
          return getSessionProviders(session).length > 0;
        default:
          return true;
      }
    case "mintokens":
      return matchesNumericThreshold(session.usage?.totalTokens ?? 0, value, "min");
    case "maxtokens":
      return matchesNumericThreshold(session.usage?.totalTokens ?? 0, value, "max");
    case "mincost":
      return matchesNumericThreshold(session.usage?.totalCost ?? 0, value, "min");
    case "maxcost":
      return matchesNumericThreshold(session.usage?.totalCost ?? 0, value, "max");
    case "minmessages":
      return matchesNumericThreshold(
        session.usage?.messageCounts?.total ?? 0,
        value,
        "min",
      );
    case "maxmessages":
      return matchesNumericThreshold(
        session.usage?.messageCounts?.total ?? 0,
        value,
        "max",
      );
    default:
      return true;
  }
};

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
    if (
      normalizedKey === "has" &&
      term.value &&
      !HAS_QUERY_VALUES.has(normalizeQueryText(term.value))
    ) {
      warnings.push(`Unknown has:${term.value}`);
    }
    if (NUMERIC_QUERY_KEYS.has(normalizedKey) && term.value) {
      if (parseQueryNumber(term.value) === null) {
        warnings.push(`Invalid number for ${term.key}`);
      }
    }
  }

  const filtered = sessions.filter((session) =>
    terms.every((term) => matchesUsageQuery(session, term)),
  );
  return { sessions: filtered, warnings };
};
