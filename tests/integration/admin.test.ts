import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAuditLog, getUserDetail, listFeedback, listUsers } from "@/lib/data/admin";
import { admin, anon, createTestUser, deleteTestUser, inSeconds, type TestUser } from "./helpers";

// ..._admin_and_feedback.sql: who's an admin, what admins can read and change, and the audit log.
describe("admin panel", () => {
  let boss: TestUser;
  let me: TestUser;
  beforeAll(async () => {
    [boss, me] = await Promise.all([createTestUser(), createTestUser()]);
    // A super admin: the account actions and admin changes below need one (..._super_admin.sql).
    const { error } = await admin.from("admins").insert({ user_id: boss.id, role: "super" });
    if (error) throw error;
  });
  afterAll(async () => {
    await Promise.all([deleteTestUser(boss), deleteTestUser(me)]);
  });

  it("is_admin answers for the caller only", async () => {
    expect((await boss.client.rpc("is_admin")).data).toBe(true);
    expect((await me.client.rpc("is_admin")).data).toBe(false);
    expect((await anon().rpc("is_admin")).error?.code).toBe("42501");
  });

  it("the service role can grant admin idempotently (how ADMIN_EMAIL works)", async () => {
    const grant = () => admin.from("admins").upsert({ user_id: me.id }, { onConflict: "user_id", ignoreDuplicates: true });
    expect((await grant()).error).toBeNull();
    expect((await grant()).error).toBeNull(); // a second visit must not fail
    expect((await me.client.rpc("is_admin")).data).toBe(true);
    // Leave `me` a plain user for the tests below.
    expect((await admin.from("admins").delete().eq("user_id", me.id)).error).toBeNull();
    expect((await me.client.rpc("is_admin")).data).toBe(false);
  });

  it("nobody can read or write admins or the audit log directly", async () => {
    for (const client of [me.client, boss.client, anon()]) {
      expect((await client.from("admins").select("*")).error?.code).toBe("42501");
      expect((await client.from("admin_audit").select("*")).error?.code).toBe("42501");
    }
    expect((await me.client.from("admins").insert({ user_id: me.id })).error?.code).toBe("42501");
    expect((await boss.client.from("admin_audit").insert({ admin_email: "x", action: "user.delete" })).error?.code).toBe("42501");
  });

  it("every admin function refuses a signed-in non-admin", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["admin_stats", {}],
      ["admin_users", {}],
      ["admin_user_detail", { p_id: me.id }],
      ["admin_feedback", {}],
      ["admin_update_feedback", { p_id: me.id, p_status: "resolved" }],
      ["admin_set_admin", { p_user: me.id, p_admin: true }],
      ["admin_set_role", { p_user: me.id, p_role: "admin" }],
      ["admin_audit_log", {}],
      ["admin_log", { p_action: "user.delete" }],
    ];
    for (const [fn, args] of calls) {
      const { error } = await me.client.rpc(fn, args);
      expect(error?.code, fn).toBe("42501");
    }
    expect((await me.client.rpc("is_admin")).data).toBe(false);
    expect((await me.client.rpc("my_admin_role")).data).toBeNull();
    expect((await anon().rpc("my_admin_role")).error?.code).toBe("42501");
  });

  it("lists and searches accounts with counts, never content", async () => {
    const made = await me.client.from("countdowns").insert({ kind: "deadline", title: "Scholarship", target_at: inSeconds(86400) });
    expect(made.error).toBeNull();
    const { rows, total } = await listUsers(boss.client, { search: me.email });
    expect(total).toBe(1);
    expect(rows[0]).toMatchObject({ id: me.id, email: me.email, countdowns: 1, is_admin: false });
    // LIKE wildcards in the search are literal.
    expect((await listUsers(boss.client, { search: "%" })).total).toBe(0);

    const detail = await getUserDetail(boss.client, me.id);
    expect(detail).toMatchObject({ email: me.email, countdowns: 1, letters: 0, storage_bytes: 0, is_admin: false });
    expect(JSON.stringify(detail)).not.toMatch(/body|caption/);
  });

  it("admins add and remove admins, can't remove themselves, and it's all logged", async () => {
    expect((await boss.client.rpc("admin_set_admin", { p_user: me.id, p_admin: true })).error).toBeNull();
    expect((await me.client.rpc("is_admin")).data).toBe(true);

    const self = await boss.client.rpc("admin_set_admin", { p_user: boss.id, p_admin: false });
    expect(self.error?.code).toBe("22023");
    expect((await boss.client.rpc("is_admin")).data).toBe(true);

    expect((await boss.client.rpc("admin_set_admin", { p_user: me.id, p_admin: false })).error).toBeNull();
    expect((await me.client.rpc("is_admin")).data).toBe(false);

    const log = await getAuditLog(boss.client, { target: me.id });
    expect(log.map((a) => a.action)).toEqual(["admin.revoke", "admin.grant"]);
    expect(log[0]).toMatchObject({ admin_email: boss.email, target_email: me.email });
  });

  it("regular admins see everything but can't act on accounts or admins; super admins can", async () => {
    const helper = await createTestUser();
    const target = await createTestUser();
    try {
      expect((await admin.from("admins").insert({ user_id: helper.id })).error).toBeNull(); // default role: admin
      expect((await helper.client.rpc("my_admin_role")).data).toBe("admin");
      expect((await boss.client.rpc("my_admin_role")).data).toBe("super");

      // Reading and feedback work for a regular admin...
      for (const fn of ["admin_stats", "admin_users", "admin_feedback", "admin_audit_log"]) {
        expect((await helper.client.rpc(fn, {})).error, fn).toBeNull();
      }
      expect((await helper.client.rpc("admin_log", { p_action: "feedback.reply", p_target: target.id })).error).toBeNull();
      // ...account actions and admin changes don't (the app logs before calling the Auth API).
      for (const action of ["user.suspend", "user.unsuspend", "user.delete"]) {
        expect((await helper.client.rpc("admin_log", { p_action: action, p_target: target.id })).error?.code, action).toBe("42501");
      }
      expect((await helper.client.rpc("admin_set_role", { p_user: target.id, p_role: "admin" })).error?.code).toBe("42501");
      expect((await helper.client.rpc("admin_set_admin", { p_user: target.id, p_admin: true })).error?.code).toBe("42501");
      expect((await helper.client.rpc("admin_set_role", { p_user: boss.id, p_role: null })).error?.code).toBe("42501");

      // A super admin grants, promotes, demotes and removes, each logged with the roles.
      expect((await boss.client.rpc("admin_set_role", { p_user: target.id, p_role: "admin" })).error).toBeNull();
      expect((await boss.client.rpc("admin_set_role", { p_user: target.id, p_role: "super" })).error).toBeNull();
      expect((await target.client.rpc("my_admin_role")).data).toBe("super");
      expect((await boss.client.rpc("admin_set_role", { p_user: target.id, p_role: "admin" })).error).toBeNull();
      expect((await getUserDetail(boss.client, target.id))?.admin_role).toBe("admin");
      expect((await boss.client.rpc("admin_set_role", { p_user: target.id, p_role: null })).error).toBeNull();
      expect((await target.client.rpc("my_admin_role")).data).toBeNull();
      const log = await getAuditLog(boss.client, { target: target.id });
      expect(log.map((a) => [a.action, a.details])).toEqual([
        ["admin.revoke", { role: "admin" }],
        ["admin.role", { from: "super", to: "admin" }],
        ["admin.role", { from: "admin", to: "super" }],
        ["admin.grant", { role: "admin" }],
        ["feedback.reply", {}],
      ]);

      // Nobody changes their own role (so there's always a super admin), and roles are checked.
      expect((await boss.client.rpc("admin_set_role", { p_user: boss.id, p_role: "admin" })).error?.code).toBe("22023");
      expect((await boss.client.rpc("admin_set_role", { p_user: target.id, p_role: "owner" })).error?.code).toBe("22023");
      // The old switch never lowers a super admin.
      expect((await boss.client.rpc("admin_set_role", { p_user: helper.id, p_role: "super" })).error).toBeNull();
      expect((await boss.client.rpc("admin_set_admin", { p_user: helper.id, p_admin: true })).error).toBeNull();
      expect((await helper.client.rpc("my_admin_role")).data).toBe("super");
    } finally {
      await Promise.all([deleteTestUser(helper), deleteTestUser(target)]);
    }
  });

  it("audit entries outlive the account they name", async () => {
    const gone = await createTestUser();
    await boss.client.rpc("admin_log", { p_action: "user.delete", p_target: gone.id });
    await deleteTestUser(gone);
    const [entry] = await getAuditLog(boss.client, { target: gone.id });
    expect(entry).toMatchObject({ action: "user.delete", target_email: gone.email, target_exists: false });
  });

  it("feedback: users send and read their own; the database owns status and reply", async () => {
    const sent = await me.client
      .from("feedback")
      .insert({ kind: "bug", message: "The calendar jumps", page: "/calendar", status: "resolved", reply: "fake" } as never);
    // status/reply have no INSERT grant.
    expect(sent.error?.code).toBe("42501");

    const ok = await me.client.from("feedback").insert({ kind: "bug", message: "The calendar jumps", page: "/calendar", user_agent: "test" });
    expect(ok.error).toBeNull();
    const mine = await me.client.from("feedback").select("id, status, reply, message");
    expect(mine.data).toEqual([expect.objectContaining({ status: "new", reply: null, message: "The calendar jumps" })]);
    // user_agent isn't readable back, and nobody can edit or delete once sent.
    expect((await me.client.from("feedback").select("user_agent")).error?.code).toBe("42501");
    const id = mine.data![0].id as string;
    expect((await me.client.from("feedback").update({ message: "changed" }).eq("id", id)).error?.code).toBe("42501");
    expect((await me.client.from("feedback").delete().eq("id", id)).error?.code).toBe("42501");

    // Someone else can't see it.
    const other = await createTestUser();
    expect((await other.client.from("feedback").select("id")).data).toEqual([]);
    await deleteTestUser(other);

    // An admin sees it with the sender's email and the device, and can answer.
    const inbox = await listFeedback(boss.client, { user: me.id });
    expect(inbox.rows[0]).toMatchObject({ id, email: me.email, user_agent: "test", status: "new" });
    expect((await boss.client.rpc("admin_update_feedback", { p_id: id, p_status: "resolved", p_reply: "  Fixed, thanks!  " })).error).toBeNull();
    const answered = await me.client.from("feedback").select("status, reply, replied_at").eq("id", id).single();
    expect(answered.data).toMatchObject({ status: "resolved", reply: "Fixed, thanks!" });
    expect(answered.data!.replied_at).not.toBeNull();

    // null keeps the reply; '' removes it.
    await boss.client.rpc("admin_update_feedback", { p_id: id, p_status: "archived", p_reply: null });
    expect((await me.client.from("feedback").select("reply").eq("id", id).single()).data!.reply).toBe("Fixed, thanks!");
    await boss.client.rpc("admin_update_feedback", { p_id: id, p_status: "archived", p_reply: "" });
    expect((await me.client.from("feedback").select("reply, replied_at").eq("id", id).single()).data).toEqual({ reply: null, replied_at: null });

    const bad = await boss.client.rpc("admin_update_feedback", { p_id: id, p_status: "nope" });
    expect(bad.error?.code).toBe("23514");
  });

  it("feedback: checks the message and limits each person to 10 a day", async () => {
    const u = await createTestUser();
    expect((await u.client.from("feedback").insert({ kind: "idea", message: "  " })).error?.code).toBe("23514");
    expect((await u.client.from("feedback").insert({ kind: "rant", message: "hello" })).error?.code).toBe("23514");
    expect((await u.client.from("feedback").insert({ kind: "idea", message: "hello", page: "https://evil.example" })).error?.code).toBe("23514");
    for (let i = 0; i < 10; i++) {
      expect((await u.client.from("feedback").insert({ kind: "idea", message: `idea ${i}` })).error).toBeNull();
    }
    expect((await u.client.from("feedback").insert({ kind: "idea", message: "one more" })).error?.code).toBe("53400");
    await deleteTestUser(u);
    // Deleting the account deletes its feedback.
    const { count } = await admin.from("feedback").select("*", { count: "exact", head: true }).eq("user_id", u.id);
    expect(count).toBe(0);
  });
});
