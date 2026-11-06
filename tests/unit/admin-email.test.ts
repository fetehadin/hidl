import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
const { isAdminEmail } = await import("@/lib/env");

describe("isAdminEmail", () => {
  afterEach(() => vi.stubEnv("ADMIN_EMAIL", ""));

  it("is false when ADMIN_EMAIL is unset or empty", () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    expect(isAdminEmail("a@x.com")).toBe(false);
  });

  it("matches any listed address, ignoring case and spaces", () => {
    vi.stubEnv("ADMIN_EMAIL", " A@x.com , b@y.com ");
    expect(isAdminEmail("a@X.com")).toBe(true);
    expect(isAdminEmail("b@y.com")).toBe(true);
    expect(isAdminEmail("c@z.com")).toBe(false);
  });

  it("never matches a missing email, and * is not a wildcard here", () => {
    vi.stubEnv("ADMIN_EMAIL", "*");
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("a@x.com")).toBe(false);
  });
});
