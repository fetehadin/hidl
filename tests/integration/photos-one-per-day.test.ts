import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayISO } from "@/lib/time";
import { admin, createTestUser, deleteTestUser, type TestUser } from "./helpers";

let me: TestUser;
let other: TestUser;

const DAY = "2026-09-15";
const tinyJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

const paths = (user: TestUser, date: string, n: number) => ({
  image_path: `${user.id}/${date}-aaaaaaaaaa${n}.jpg`,
  thumb_path: `${user.id}/${date}-aaaaaaaaaa${n}-thumb.jpg`,
});

beforeAll(async () => {
  [me, other] = await Promise.all([createTestUser(), createTestUser()]);
});
afterAll(async () => {
  for (const u of [me, other]) {
    if (!u) continue;
    const { data } = await admin.storage.from("photos").list(u.id);
    if (data?.length) await admin.storage.from("photos").remove(data.map((f) => `${u.id}/${f.name}`));
  }
  await Promise.all([deleteTestUser(me), deleteTestUser(other)]);
});

describe("one photo per day", () => {
  it("allows the first photo for a day", async () => {
    const { error } = await me.client.from("photos").insert({ date: DAY, ...paths(me, DAY, 1) });
    expect(error).toBeNull();
  });

  it("rejects a second row for the same day (unique constraint)", async () => {
    const { error } = await me.client.from("photos").insert({ date: DAY, ...paths(me, DAY, 2) });
    expect(error?.code).toBe("23505");
    const { data } = await me.client.from("photos").select("date").eq("date", DAY);
    expect(data).toHaveLength(1);
  });

  it("replacing updates the existing row instead of adding one", async () => {
    const { error } = await me.client.from("photos").update({ ...paths(me, DAY, 3), caption: "again" }).eq("date", DAY);
    expect(error).toBeNull();
    const { data } = await me.client.from("photos").select("image_path, caption").eq("date", DAY);
    expect(data).toEqual([{ image_path: paths(me, DAY, 3).image_path, caption: "again" }]);
  });

  it("the date of an existing photo can't be changed to collide with another day", async () => {
    const { error } = await me.client.from("photos").update({ date: "2026-09-16" }).eq("date", DAY);
    expect(error?.code).toBe("42501");
  });

  it("another user can have a photo on the same day", async () => {
    const { error } = await other.client.from("photos").insert({ date: DAY, ...paths(other, DAY, 1) });
    expect(error).toBeNull();
  });

  it("rejects future days (database clock, Addis timezone)", async () => {
    const tomorrow = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
    const future = tomorrow > todayISO() ? tomorrow : "2999-01-01";
    const { error } = await me.client.from("photos").insert({ date: future, ...paths(me, future, 1) });
    expect(error?.message).toMatch(/future day/);
  });

  it("rejects file paths outside the user's own folder", async () => {
    const { error } = await me.client.from("photos").insert({
      date: "2026-09-17",
      image_path: `${other.id}/2026-09-17-aaaaaaaaaa1.jpg`,
      thumb_path: `${other.id}/2026-09-17-aaaaaaaaaa1-thumb.jpg`,
    });
    expect(error?.code).toBe("23514");
  });

  it("users only see their own rows", async () => {
    const { data } = await other.client.from("photos").select("user_id");
    expect(data!.every((r) => r.user_id === other.id)).toBe(true);
  });
});

describe("photo storage bucket", () => {
  it("lets a user upload into their own folder and read it back", async () => {
    const path = `${me.id}/${DAY}-bbbbbbbbbb1.jpg`;
    const up = await me.client.storage.from("photos").upload(path, tinyJpeg, { contentType: "image/jpeg" });
    expect(up.error).toBeNull();
    const signed = await me.client.storage.from("photos").createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
  });

  it("refuses uploads into another user's folder", async () => {
    const up = await me.client.storage
      .from("photos")
      .upload(`${other.id}/${DAY}-cccccccccc1.jpg`, tinyJpeg, { contentType: "image/jpeg" });
    expect(up.error).not.toBeNull();
  });

  it("refuses reading another user's files", async () => {
    const path = `${other.id}/${DAY}-dddddddddd1.jpg`;
    await other.client.storage.from("photos").upload(path, tinyJpeg, { contentType: "image/jpeg" });
    const signed = await me.client.storage.from("photos").createSignedUrl(path, 60);
    expect(signed.error).not.toBeNull();
    const dl = await me.client.storage.from("photos").download(path);
    expect(dl.error).not.toBeNull();
  });

  it("the bucket is private (no public URLs)", async () => {
    const path = `${me.id}/${DAY}-bbbbbbbbbb1.jpg`;
    const { data } = me.client.storage.from("photos").getPublicUrl(path);
    const res = await fetch(data.publicUrl);
    expect(res.ok).toBe(false);
  });

  it("refuses non-image uploads", async () => {
    const up = await me.client.storage
      .from("photos")
      .upload(`${me.id}/${DAY}-eeeeeeeeee1.jpg`, Buffer.from("<html>"), { contentType: "text/html" });
    expect(up.error).not.toBeNull();
  });
});
