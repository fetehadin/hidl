import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, MEDIA_QUOTA_BYTES } from "@/lib/media";
import { admin, anon, createTestUser, deleteTestUser, type TestUser } from "./helpers";

// ..._media_objects.sql: the record of every photo/video file, the 2 GB space and the hourly limit.

let n = 0;
const file = (u: TestUser, over: Partial<{ path: string; bytes: number; content_type: string }> = {}) => ({
  path: `${u.id}/2026-11-09-${(++n).toString(16).padStart(16, "0")}.webp`,
  bytes: 1000,
  content_type: "image/webp",
  ...over,
});

describe("media objects", () => {
  let a: TestUser;
  let b: TestUser;
  beforeAll(async () => {
    [a, b] = await Promise.all([createTestUser(), createTestUser()]);
  });
  afterAll(async () => {
    await Promise.all([deleteTestUser(a), deleteTestUser(b)]);
  });

  it("reserves a file and its thumbnail in your own folder", async () => {
    const main = file(a);
    const thumb = { ...file(a), path: main.path.replace(".webp", "-thumb.webp") };
    expect((await a.client.rpc("reserve_media", { p_files: [main, thumb] })).error).toBeNull();
    const { data } = await admin.from("media_objects").select("path, bytes, confirmed_at").eq("user_id", a.id);
    expect(data?.map((r) => r.path).sort()).toEqual([main.path, thumb.path].sort());
    expect(data?.every((r) => r.confirmed_at === null)).toBe(true);
  });

  it("refuses someone else's folder, odd names, wrong types and big files", async () => {
    const tries = [
      file(a, { path: file(b).path }),
      file(a, { path: `${a.id}/../${b.id}/2026-11-09-aaaaaaaaaaaaaaaa.webp` }),
      file(a, { path: `${a.id}/notes.txt` }),
      file(a, { content_type: "image/jpeg" }),
      file(a, { content_type: "text/html" }),
      file(a, { bytes: MAX_UPLOAD_BYTES + 1 }),
      file(a, { bytes: 0 }),
    ];
    for (const f of tries) {
      const { error } = await a.client.rpc("reserve_media", { p_files: [f] });
      expect(error?.code, JSON.stringify(f)).toBe("23514");
    }
    expect((await a.client.rpc("reserve_media", { p_files: [] })).error?.code).toBe("22023");
  });

  it("a path can't be taken twice", async () => {
    const f = file(a);
    expect((await a.client.rpc("reserve_media", { p_files: [f] })).error).toBeNull();
    expect((await a.client.rpc("reserve_media", { p_files: [f] })).error?.code).toBe("23505");
  });

  it("users can't read, change or delete the record themselves", async () => {
    expect((await a.client.from("media_objects").select("*")).error?.code).toBe("42501");
    expect((await a.client.from("media_objects").delete().eq("user_id", a.id)).error?.code).toBe("42501");
    expect((await a.client.from("media_objects").insert(file(a))).error?.code).toBe("42501");
    expect((await anon().rpc("reserve_media", { p_files: [file(a)] })).error?.code).toBe("42501");
  });

  it("stops at the 2 GB photo space and reports usage", async () => {
    // Fill b's space with records (no real files needed): 409 × 5 MB ≈ 2 GB.
    const rows = Array.from({ length: Math.floor(MEDIA_QUOTA_BYTES / MAX_UPLOAD_BYTES) }, () => ({
      ...file(b, { bytes: MAX_UPLOAD_BYTES }),
      user_id: b.id,
      created_at: "2026-01-01T00:00:00Z",
    }));
    expect((await admin.from("media_objects").insert(rows)).error).toBeNull();
    const usage = (await b.client.rpc("media_usage")).data as { used: number; quota: number };
    expect(usage.quota).toBe(MEDIA_QUOTA_BYTES);
    expect(usage.used).toBe(rows.length * MAX_UPLOAD_BYTES);
    const room = MEDIA_QUOTA_BYTES - usage.used;
    expect((await b.client.rpc("reserve_media", { p_files: [file(b, { bytes: room + 1 })] })).error?.code).toBe("53100");
    expect((await b.client.rpc("reserve_media", { p_files: [file(b, { bytes: room })] })).error).toBeNull();
    await admin.from("media_objects").delete().eq("user_id", b.id);
  });

  it("allows at most 120 files an hour", async () => {
    const recent = Array.from({ length: 119 }, () => ({ ...file(b), user_id: b.id }));
    expect((await admin.from("media_objects").insert(recent)).error).toBeNull();
    expect((await b.client.rpc("reserve_media", { p_files: [file(b), file(b)] })).error?.code).toBe("53400");
    expect((await b.client.rpc("reserve_media", { p_files: [file(b)] })).error).toBeNull();
    await admin.from("media_objects").delete().eq("user_id", b.id);
  });

  it("goes away with the account", async () => {
    const c = await createTestUser();
    expect((await c.client.rpc("reserve_media", { p_files: [file(c)] })).error).toBeNull();
    await deleteTestUser(c);
    const { count } = await admin.from("media_objects").select("*", { count: "exact", head: true }).eq("user_id", c.id);
    expect(count).toBe(0);
  });
});
