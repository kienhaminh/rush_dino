import { describe, expect, it, vi } from "vitest";

import { openExternalUrlSafe, resolveSafeExternalUrl } from "./open-external-url.ts";

describe("open-external-url characterization", () => {
  const baseHref = "https://openclaw.ai/chat";

  it("preserves safe URL decisions", () => {
    expect(resolveSafeExternalUrl("https://example.com/x", baseHref)).toBe(
      "https://example.com/x",
    );
    expect(resolveSafeExternalUrl("/assets/pic.png", baseHref)).toBe(
      "https://openclaw.ai/assets/pic.png",
    );
    expect(resolveSafeExternalUrl("javascript:alert(1)", baseHref)).toBeNull();
    expect(
      resolveSafeExternalUrl("data:image/png;base64,iVBORw0KGgo=", baseHref),
    ).toBeNull();
  });

  it("keeps opener hardening behavior", () => {
    const openedLikeProxy = {
      opener: { postMessage: () => void 0 },
    } as unknown as WindowProxy;
    const openMock = vi.fn(() => openedLikeProxy);
    vi.stubGlobal("window", {
      location: { href: "https://openclaw.ai/chat" },
      open: openMock,
    } as unknown as Window & typeof globalThis);

    const opened = openExternalUrlSafe("https://example.com/safe.png");

    expect(opened).toBe(openedLikeProxy);
    expect(openedLikeProxy.opener).toBeNull();
    expect(openMock).toHaveBeenCalledWith(
      "https://example.com/safe.png",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
