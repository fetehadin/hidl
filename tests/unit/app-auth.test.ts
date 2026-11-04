import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
const { openFromApp, sealForApp } = await import("@/lib/app-auth");

const session = { access_token: "a.b.c", refresh_token: "r1", expires_at: 123 };
const secret = "s".repeat(43);

describe("sealing a session for the phone app", () => {
  it("round-trips with the right secret", () => {
    expect(openFromApp(sealForApp(session, secret), secret)).toEqual(session);
  });

  it("can't be opened with any other secret", () => {
    expect(openFromApp(sealForApp(session, secret), "t".repeat(43))).toBeNull();
  });

  it("rejects tampering and junk", () => {
    const blob = sealForApp(session, secret);
    const flipped = blob.slice(0, -2) + (blob.at(-2) === "A" ? "B" : "A") + blob.at(-1);
    expect(openFromApp(flipped, secret)).toBeNull();
    expect(openFromApp("not-a-blob", secret)).toBeNull();
  });

  it("expires after two minutes", () => {
    vi.useFakeTimers();
    const blob = sealForApp(session, secret);
    vi.advanceTimersByTime(2 * 60_000 + 1);
    expect(openFromApp(blob, secret)).toBeNull();
    vi.useRealTimers();
  });
});
