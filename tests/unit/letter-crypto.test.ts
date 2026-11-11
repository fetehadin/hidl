import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { isServerSealed, openLetterBody, sealLetterBody } from "@/lib/letter-crypto";

const me = "8f0b2c1e-1111-4222-8333-944455556666";
const someoneElse = "8f0b2c1e-1111-4222-8333-000000000000";

beforeAll(() => {
  process.env.LETTER_SECRET_KEY = randomBytes(32).toString("base64");
});

describe("letter-crypto", () => {
  it("seals into the format the database accepts, and opens back", () => {
    const text = "Dear me,\n\nሰላም! You made it. 🎉";
    const sealed = sealLetterBody(text, me);
    expect(sealed).toMatch(/^srv1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$/);
    expect(sealed).not.toContain("Dear me");
    expect(isServerSealed(sealed)).toBe(true);
    expect(openLetterBody(sealed, me)).toBe(text);
  });

  it("never seals the same text the same way twice", () => {
    expect(sealLetterBody("same", me)).not.toBe(sealLetterBody("same", me));
  });

  it("won't open for another account, or once changed", () => {
    const sealed = sealLetterBody("private", me);
    expect(() => openLetterBody(sealed, someoneElse)).toThrow();
    const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => openLetterBody(tampered, me)).toThrow();
  });

  it("leaves older plain-text letters as they are", () => {
    expect(openLetterBody("An old letter", me)).toBe("An old letter");
    expect(isServerSealed("An old letter")).toBe(false);
  });

  it("refuses to work without a proper key", () => {
    const saved = process.env.LETTER_SECRET_KEY;
    process.env.LETTER_SECRET_KEY = "short";
    expect(() => sealLetterBody("x", me)).toThrow(/LETTER_SECRET_KEY/);
    process.env.LETTER_SECRET_KEY = saved;
  });
});
