import { describe, expect, it } from "vitest";

import { formatRelativeTimestamp, stripThinkingTags } from "./format.ts";
import {
  formatCronPayload,
  formatCronSchedule,
  formatEventPayload,
  formatPresenceAge,
  formatPresenceSummary,
  formatSessionTokens,
} from "./presenter.ts";

describe("format/presenter characterization", () => {
  it("keeps relative-time and tag stripping behavior", () => {
    expect(formatRelativeTimestamp(Date.now() + 30_000)).toBe("in <1m");
    expect(formatRelativeTimestamp(Date.now() - 10_000)).toBe("just now");
    expect(stripThinkingTags("<think>secret</think>\n\n<final>Hello</final>")).toBe(
      "Hello",
    );
  });

  it("keeps presenter formatting behavior", () => {
    expect(formatPresenceSummary({ host: "h", ip: "1.1.1.1", mode: "m", version: "v" })).toBe(
      "h (1.1.1.1) m v",
    );
    expect(formatPresenceAge({ ts: null })).toBe("n/a");
    expect(formatSessionTokens({ totalTokens: 10, contextTokens: 20 } as never)).toBe(
      "10 / 20",
    );
    expect(formatEventPayload({ ok: true })).toContain('"ok": true');

    expect(
      formatCronSchedule({ schedule: { kind: "every", everyMs: 1_800_000 } } as never),
    ).toBe("Every 30m");
    expect(
      formatCronPayload({ payload: { kind: "systemEvent", text: "hello" } } as never),
    ).toBe("System: hello");
  });
});
