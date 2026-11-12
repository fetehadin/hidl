import { describe, expect, it } from "vitest";
import { isAppleMobile } from "@/lib/user-agent";

describe("isAppleMobile", () => {
  it("is true for iPhones and iPads", () => {
    expect(isAppleMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15")).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
  });

  it("is false for Android, the Hidl app and desktops", () => {
    expect(isAppleMobile("Mozilla/5.0 (Linux; Android 15; SM-S921B) Chrome/131.0 Mobile")).toBe(false);
    expect(isAppleMobile("Mozilla/5.0 (Linux; Android 15) Chrome/131.0 hidl-app/0.4")).toBe(false);
    expect(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(false);
    expect(isAppleMobile(null)).toBe(false);
  });
});
