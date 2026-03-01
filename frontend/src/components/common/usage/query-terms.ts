import type { UsageQueryTerm } from "./query-types.ts";

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
