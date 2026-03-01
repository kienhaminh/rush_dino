import { describe, expect, it } from "vitest";

import {
  extractQueryTerms,
  filterSessionsByQuery,
  parseToolSummary,
} from "../usage-helpers.ts";

describe("usage query characterization", () => {
  it("keeps tokenization and filtering behavior", () => {
    const terms = extractQueryTerms('agent:main "model:gpt-5.2" has:errors');
    expect(terms.map((term) => term.raw)).toEqual([
      "agent:main",
      "model:gpt-5.2",
      "has:errors",
    ]);

    const a = {
      key: "agent:main:cron:16234bc?token=dev-token",
      label: "A",
      usage: { totalTokens: 100, totalCost: 0, messageCounts: { total: 10 } },
    };
    const b = {
      key: "agent:ops:cron:222",
      label: "B",
      usage: { totalTokens: 5, totalCost: 0, messageCounts: { total: 1 } },
    };

    expect(filterSessionsByQuery([a, b], "key:agent:main:cron*").sessions).toEqual([
      a,
    ]);
    expect(filterSessionsByQuery([a, b], "minTokens:10").sessions).toEqual([a]);
    expect(filterSessionsByQuery([a, b], "maxTokens:10").sessions).toEqual([b]);
  });

  it("keeps warning and tool-summary behavior", () => {
    const session = { key: "a", usage: { totalTokens: 10, totalCost: 0 } };
    const res = filterSessionsByQuery([session], "wat:1 minTokens:wat");
    expect(res.warnings.some((warning) => warning.includes("Unknown filter"))).toBe(
      true,
    );
    expect(res.warnings.some((warning) => warning.includes("Invalid number"))).toBe(
      true,
    );

    const summary = parseToolSummary(
      "[Tool: read]\n[Tool Result]\n[Tool: exec]\n[Tool: read]\n[Tool Result]",
    );
    expect(summary.summary).toContain("read×2");
    expect(summary.summary).toContain("exec×1");
    expect(summary.tools[0]).toEqual(["read", 2]);
  });
});
