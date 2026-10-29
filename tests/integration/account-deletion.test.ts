import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, createTestUser, type TestUser } from "./helpers";

let me: TestUser;

const tinyJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

beforeAll(async () => {
  me = await createTestUser();

  await me.client.from("letters").insert({
    title: "to future me",
    body: "hello",
    recipient: "me",
    unlock_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  await me.client.from("exam_settings").insert({
    exam_name: "entrance exam",
    exam_at: new Date(Date.now() + 86_400_000).toISOString(),
    target_score: 90,
    max_score: 100,
  });
  const path = `${me.id}/2026-09-15-aaaaaaaaaa1.jpg`;
  await me.client.storage.from("photos").upload(path, tinyJpeg, { contentType: "image/jpeg" });
  await me.client.from("photos").insert({
    date: "2026-09-15",
    image_path: path,
    thumb_path: path,
  });
});

afterAll(async () => {
  // Already deleted by the test; nothing to clean up.
});

describe("account deletion", () => {
  it("removes storage files, then the auth user cascades DB rows away", async () => {
    const { data: files } = await me.client.storage.from("photos").list(me.id);
    expect(files!.length).toBeGreaterThan(0);
    await me.client.storage.from("photos").remove(files!.map((f) => `${me.id}/${f.name}`));

    const { error } = await admin.auth.admin.deleteUser(me.id);
    expect(error).toBeNull();

    const [letters, photos, exam, remainingFiles] = await Promise.all([
      admin.from("letters").select("id").eq("user_id", me.id),
      admin.from("photos").select("id").eq("user_id", me.id),
      admin.from("exam_settings").select("user_id").eq("user_id", me.id),
      admin.storage.from("photos").list(me.id),
    ]);

    expect(letters.data).toEqual([]);
    expect(photos.data).toEqual([]);
    expect(exam.data).toEqual([]);
    expect(remainingFiles.data ?? []).toEqual([]);
  });
});
