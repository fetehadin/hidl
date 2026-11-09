import { describe, expect, it } from "vitest";
import { greetingName } from "@/lib/names";

describe("greetingName", () => {
  it("uses the first word of the display name", () => {
    expect(greetingName("Fetehadin Negash", "Someone Else")).toBe("Fetehadin");
    expect(greetingName("  hana  ", null)).toBe("hana");
  });

  it("falls back to the account's name, then to none", () => {
    expect(greetingName(null, "Abebe Kebede")).toBe("Abebe");
    expect(greetingName("   ", "Abebe")).toBe("Abebe");
    expect(greetingName(null, undefined)).toBeNull();
    expect(greetingName(null, 42)).toBeNull();
    expect(greetingName("", "")).toBeNull();
  });

  it("keeps a very long first word short", () => {
    expect(greetingName("a".repeat(40), null)).toBe(`${"a".repeat(23)}…`);
  });
});
