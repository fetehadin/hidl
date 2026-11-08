import { describe, expect, it } from "vitest";
import { APP_CODE_ALPHABET, formatAppCode, hashAppCode, newAppCode, normalizeAppCode } from "@/lib/app-code";

describe("app hand-off codes", () => {
  it("are eight characters from the look-alike-free alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = newAppCode();
      expect(code).toHaveLength(8);
      expect([...code].every((c) => APP_CODE_ALPHABET.includes(c))).toBe(true);
    }
    expect(APP_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("accept spaces, dashes and lower case, and reject anything else", () => {
    expect(normalizeAppCode("k7m2-q9xp")).toBe("K7M2Q9XP");
    expect(normalizeAppCode(" K7M2 Q9XP ")).toBe("K7M2Q9XP");
    expect(normalizeAppCode("K7M2Q9X")).toBeNull();
    expect(normalizeAppCode("K7M2Q9XPP")).toBeNull();
    expect(normalizeAppCode("K7M2Q9X!")).toBeNull();
  });

  it("reject the look-alikes that are never in a code", () => {
    for (const c of ["0", "O", "1", "I", "L"]) expect(normalizeAppCode(`K7M2Q9X${c}`)).toBeNull();
  });

  it("format as two groups of four and hash to 64 hex characters", () => {
    expect(formatAppCode("K7M2Q9XP")).toBe("K7M2-Q9XP");
    expect(hashAppCode("K7M2Q9XP")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAppCode("K7M2Q9XP")).toBe(hashAppCode("K7M2Q9XP"));
  });
});
