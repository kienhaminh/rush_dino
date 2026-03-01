import { describe, expect, it, vi } from "vitest";

import { detectTextDirection } from "./text-direction.ts";
import { generateUUID } from "./uuid.ts";

describe("uuid/text-direction characterization", () => {
  it("keeps text direction detection", () => {
    expect(detectTextDirection(null)).toBe("ltr");
    expect(detectTextDirection("שלום עולם")).toBe("rtl");
    expect(detectTextDirection("Hello world")).toBe("ltr");
    expect(detectTextDirection("**שלום")).toBe("rtl");
  });

  it("keeps UUID generation paths", () => {
    const viaRandomUuid = generateUUID({
      randomUUID: () => "randomuuid",
      getRandomValues: () => {
        throw new Error("should not be called");
      },
    });
    expect(viaRandomUuid).toBe("randomuuid");

    const viaGetRandomValues = generateUUID({
      getRandomValues: (bytes) => {
        // @ts-expect-error deterministic byte fill for characterization
        for (let i = 0; i < bytes.length; i++) bytes[i] = i;
        return bytes;
      },
    });
    expect(viaGetRandomValues).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const viaFallback = generateUUID(null);
    expect(viaFallback).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
