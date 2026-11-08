import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashAppCode, newAppCode } from "@/lib/app-code";
import { admin, anon, createTestUser, deleteTestUser, type TestUser } from "./helpers";

// One-time codes that sign the phone app in from a website tab (..._app_handoff.sql).
const redeem = async (code: string) => {
  const { data, error } = await admin.rpc("redeem_app_handoff", { p_code_hash: hashAppCode(code) });
  if (error) throw error;
  return (data as { out_user: string | null; out_status: string }[])[0];
};

describe("app hand-off codes", () => {
  let me: TestUser;
  beforeAll(async () => {
    me = await createTestUser();
  });
  afterAll(async () => {
    await deleteTestUser(me);
  });

  const make = async (user: TestUser) => {
    const code = newAppCode();
    const { data, error } = await user.client.rpc("create_app_handoff", { p_code_hash: hashAppCode(code) });
    if (error) throw error;
    return { code, expiresAt: new Date(data as string) };
  };

  it("works once, for the account that made it, for about 10 minutes", async () => {
    const { code, expiresAt } = await make(me);
    const minutes = (expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(9);
    expect(minutes).toBeLessThanOrEqual(10.1);
    expect(await redeem(code)).toEqual({ out_user: me.id, out_status: "ok" });
    expect(await redeem(code)).toEqual({ out_user: null, out_status: "used" });
  });

  it("refuses a code that was never made", async () => {
    expect(await redeem(newAppCode())).toEqual({ out_user: null, out_status: "invalid" });
  });

  it("a new code retires the previous one", async () => {
    const first = await make(me);
    const second = await make(me);
    expect((await redeem(first.code)).out_status).toBe("used");
    expect((await redeem(second.code)).out_status).toBe("ok");
  });

  it("refuses an expired code", async () => {
    const { code } = await make(me);
    const { error } = await admin
      .from("app_handoffs")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("code_hash", hashAppCode(code));
    if (error) throw error;
    expect((await redeem(code)).out_status).toBe("expired");
  });

  it("only the server can redeem, nobody can read the table, and you must be signed in to make one", async () => {
    const { code } = await make(me);
    expect((await me.client.rpc("redeem_app_handoff", { p_code_hash: hashAppCode(code) })).error?.code).toBe("42501");
    expect((await anon().rpc("redeem_app_handoff", { p_code_hash: hashAppCode(code) })).error?.code).toBe("42501");
    expect((await me.client.from("app_handoffs").select("*")).error?.code).toBe("42501");
    expect((await anon().rpc("create_app_handoff", { p_code_hash: hashAppCode(newAppCode()) })).error?.code).toBe("42501");
    expect((await me.client.rpc("create_app_handoff", { p_code_hash: "not-a-hash" })).error?.code).toBe("22023");
  });

  it("stops at 10 codes an hour", async () => {
    const busy = await createTestUser();
    try {
      for (let i = 0; i < 10; i++) await make(busy);
      const { error } = await busy.client.rpc("create_app_handoff", { p_code_hash: hashAppCode(newAppCode()) });
      expect(error?.code).toBe("53400");
    } finally {
      await deleteTestUser(busy);
    }
  });

  it("deleting the account removes its codes", async () => {
    const gone = await createTestUser();
    const { code } = await make(gone);
    await deleteTestUser(gone);
    expect((await redeem(code)).out_status).toBe("invalid");
  });
});
