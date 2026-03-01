import { globToRegex, normalizeQueryText, parseQueryNumber } from "./query-core.ts";
import type { UsageQueryTerm, UsageSessionQueryTarget } from "./query-types.ts";

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
    case "mintokens": {
      const threshold = parseQueryNumber(value);
      if (threshold === null) {
        return true;
      }
      return (session.usage?.totalTokens ?? 0) >= threshold;
    }
    case "maxtokens": {
      const threshold = parseQueryNumber(value);
      if (threshold === null) {
        return true;
      }
      return (session.usage?.totalTokens ?? 0) <= threshold;
    }
    case "mincost": {
      const threshold = parseQueryNumber(value);
      if (threshold === null) {
        return true;
      }
      return (session.usage?.totalCost ?? 0) >= threshold;
    }
    case "maxcost": {
      const threshold = parseQueryNumber(value);
      if (threshold === null) {
        return true;
      }
      return (session.usage?.totalCost ?? 0) <= threshold;
    }
    case "minmessages": {
      const threshold = parseQueryNumber(value);
      if (threshold === null) {
        return true;
      }
      return (session.usage?.messageCounts?.total ?? 0) >= threshold;
    }
    case "maxmessages": {
      const threshold = parseQueryNumber(value);
      if (threshold === null) {
        return true;
      }
      return (session.usage?.messageCounts?.total ?? 0) <= threshold;
    }
    default:
      return true;
  }
};
