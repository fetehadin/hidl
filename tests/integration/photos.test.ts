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

describe("multiple photos per day", () => {
  it("allows the first photo for a day", async () => {
    const { error } = await me.client.from("photos").insert({ date: DAY, ...paths(me, DAY, 1) });
    expect(error).toBeNull();
  });

  it("allows a second, independent photo on the same day", async () => {
    const { error } = await me.client.from("photos").insert({ date: DAY, ...paths(me, DAY, 2) });
    expect(error).toBeNull();
    const { data } = await me.client.from("photos").select("image_path").eq("date", DAY);
    expect(data).toHaveLength(2);
  });

  it("updating one photo's image doesn't touch the other photo on the same day", async () => {
    const { data: rows } = await me.client.from("photos").select("id, image_path").eq("date", DAY).order("image_path");
    const [first, second] = rows!;
    await me.client.from("photos").update({ ...paths(me, DAY, 3), caption: "again" }).eq("id", first.id);
    const { data } = await me.client.from("photos").select("id, image_path, caption").eq("date", DAY).order("id");
    const updated = data!.find((r) => r.id === first.id);
    const untouched = data!.find((r) => r.id === second.id);
    expect(updated).toEqual({ id: first.id, image_path: paths(me, DAY, 3).image_path, caption: "again" });
    expect(untouched?.image_path).toBe(second.image_path);
  });

  it("the date column can't be changed at all (not granted)", async () => {
    const { data: rows } = await me.client.from("photos").select("id").eq("date", DAY).limit(1);
    const { error } = await me.client.from("photos").update({ date: "2026-09-16" }).eq("id", rows![0].id);
    expect(error?.code).toBe("42501");
  });

  it("another user can have a photo on the same day", async () => {
    const { error } = await other.client.from("photos").insert({ date: DAY, ...paths(other, DAY, 1) });
    expect(error).toBeNull();
  });

  it("rejects future days (database clock, default Addis timezone when none is saved)", async () => {
    const tomorrow = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
    const future = tomorrow > todayISO("Africa/Addis_Ababa") ? tomorrow : "2999-01-01";
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

describe("pinned wallpaper photo", () => {
  const PIN_DAY = "2026-09-20";
  let a: string;
  let b: string;

  beforeAll(async () => {
    const { data, error } = await me.client
      .from("photos")
      .insert([
        { date: PIN_DAY, ...paths(me, PIN_DAY, 1) },
        { date: PIN_DAY, ...paths(me, PIN_DAY, 2) },
      ])
      .select("id");
    if (error) throw error;
    [a, b] = data!.map((r) => r.id);
  });

  const pinned = async () => {
    const { data } = await me.client.from("photos").select("id").eq("date", PIN_DAY).eq("is_cover", true);
    return data!.map((r) => r.id);
  };

  it("pins one photo as the day's wallpaper", async () => {
    const { error } = await me.client.rpc("set_cover_photo", { photo_id: a, pinned: true });
    expect(error).toBeNull();
    expect(await pinned()).toEqual([a]);
  });

  it("pinning another photo that day moves the pin, atomically", async () => {
    const { error } = await me.client.rpc("set_cover_photo", { photo_id: b, pinned: true });
    expect(error).toBeNull();
    expect(await pinned()).toEqual([b]);
  });

  it("a direct update can't give a day two pins", async () => {
    const { error } = await me.client.from("photos").update({ is_cover: true }).eq("id", a);
    expect(error?.code).toBe("23505");
    expect(await pinned()).toEqual([b]);
  });

  it("unpinning leaves the day with no pin", async () => {
    await me.client.rpc("set_cover_photo", { photo_id: b, pinned: false });
    expect(await pinned()).toEqual([]);
  });

  it("can't pin someone else's photo", async () => {
    const { error } = await other.client.rpc("set_cover_photo", { photo_id: a, pinned: true });
    expect(error).not.toBeNull();
    expect(await pinned()).toEqual([]);
  });
});

describe("videos", () => {
  const VID_DAY = "2026-09-22";
  const vid = (user: TestUser, n: number, ext = "mp4") => ({
    image_path: `${user.id}/${VID_DAY}-vvvvvvvvvv${n}.${ext}`,
    thumb_path: `${user.id}/${VID_DAY}-vvvvvvvvvv${n}-thumb.webp`,
  });

  it("saves a video row that points at a video file with an image thumbnail", async () => {
    const { error } = await me.client.from("photos").insert({ date: VID_DAY, media_type: "video", ...vid(me, 1) });
    expect(error).toBeNull();
    const { data } = await me.client.from("photos").select("media_type").eq("image_path", vid(me, 1).image_path).single();
    expect(data?.media_type).toBe("video");
  });

  it("defaults to an image, and refuses a video file on an image row", async () => {
    const { error } = await me.client.from("photos").insert({ date: VID_DAY, ...vid(me, 2) });
    expect(error).not.toBeNull();
  });

  it("refuses an image file on a video row, and a video as the thumbnail", async () => {
    const asImage = await me.client.from("photos").insert({ date: VID_DAY, media_type: "video", ...paths(me, VID_DAY, 7) });
    expect(asImage.error).not.toBeNull();
    const videoThumb = await me.client.from("photos").insert({
      date: VID_DAY,
      media_type: "video",
      image_path: vid(me, 3).image_path,
      thumb_path: `${me.id}/${VID_DAY}-vvvvvvvvvv3-thumb.mp4`,
    });
    expect(videoThumb.error).not.toBeNull();
  });

  it("refuses an unknown media type", async () => {
    const { error } = await me.client.from("photos").insert({ date: VID_DAY, media_type: "audio", ...vid(me, 4) });
    expect(error).not.toBeNull();
  });

  it("the bucket accepts small mp4, webm and mov files", async () => {
    for (const [ext, type] of [["mp4", "video/mp4"], ["webm", "video/webm"], ["mov", "video/quicktime"]]) {
      const up = await me.client.storage
        .from("photos")
        .upload(`${me.id}/${VID_DAY}-uuuuuuuuuu1.${ext}`, Buffer.alloc(1024), { contentType: type });
      expect(up.error, ext).toBeNull();
    }
  });

  it("the bucket refuses anything over 5 MB", async () => {
    const tooBig = Buffer.alloc(5 * 1024 * 1024 + 1);
    const up = await me.client.storage
      .from("photos")
      .upload(`${me.id}/${VID_DAY}-uuuuuuuuuu2.mp4`, tooBig, { contentType: "video/mp4" });
    expect(up.error).not.toBeNull();
    const atLimit = await me.client.storage
      .from("photos")
      .upload(`${me.id}/${VID_DAY}-uuuuuuuuuu3.mp4`, Buffer.alloc(5 * 1024 * 1024), { contentType: "video/mp4" });
    expect(atLimit.error).toBeNull();
  });
});

describe("photo groups", () => {
  const GROUP_DAY = "2026-09-25";
  let photoId: string;
  let family: string;
  let trips: string;

  beforeAll(async () => {
    const photo = await me.client.from("photos").insert({ date: GROUP_DAY, ...paths(me, GROUP_DAY, 1) }).select("id").single();
    expect(photo.error).toBeNull();
    photoId = photo.data!.id;
    const a = await me.client.from("photo_groups").insert({ name: "Family" }).select("id").single();
    const b = await me.client.from("photo_groups").insert({ name: "Trips" }).select("id").single();
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    [family, trips] = [a.data!.id, b.data!.id];
  });

  it("puts new groups last, and saves the person's order", async () => {
    let { data } = await me.client.from("photo_groups").select("id, position").order("position");
    expect(data!.map((g) => g.id)).toEqual([family, trips]);
    expect((await me.client.rpc("set_photo_group_order", { ids: [trips, family] })).error).toBeNull();
    ({ data } = await me.client.from("photo_groups").select("id, position").order("position"));
    expect(data!.map((g) => g.id)).toEqual([trips, family]);
  });

  it("refuses a name used twice (ignoring case), blank, too long or untrimmed", async () => {
    expect((await me.client.from("photo_groups").insert({ name: "family" })).error?.code).toBe("23505");
    for (const name of ["", " Family2", "x".repeat(31), "a\tb"]) {
      expect((await me.client.from("photo_groups").insert({ name })).error?.code, name).toBe("23514");
    }
  });

  it("sets a photo's groups, and the photo comes back with them", async () => {
    expect((await me.client.rpc("set_photo_groups", { photo: photoId, group_ids: [family, trips] })).error).toBeNull();
    let { data } = await me.client.from("photos").select("id, photo_group_items(group_id)").eq("id", photoId).single();
    expect(data!.photo_group_items.map((i: { group_id: string }) => i.group_id).sort()).toEqual([family, trips].sort());
    expect((await me.client.rpc("set_photo_groups", { photo: photoId, group_ids: [trips] })).error).toBeNull();
    ({ data } = await me.client.from("photos").select("id, photo_group_items(group_id)").eq("id", photoId).single());
    expect(data!.photo_group_items.map((i: { group_id: string }) => i.group_id)).toEqual([trips]);
  });

  it("can't put someone else's photo in a group, or a photo in someone else's group", async () => {
    const theirs = await other.client.from("photo_groups").insert({ name: "Mine" }).select("id").single();
    expect((await other.client.rpc("set_photo_groups", { photo: photoId, group_ids: [theirs.data!.id] })).error).not.toBeNull();
    expect((await me.client.rpc("set_photo_groups", { photo: photoId, group_ids: [theirs.data!.id] })).error).not.toBeNull();
    const { data } = await other.client.from("photo_groups").select("name");
    expect(data!.map((g) => g.name)).toEqual(["Mine"]);
  });

  it("deleting a group keeps the photo; deleting the photo empties its groups", async () => {
    expect((await me.client.from("photo_groups").delete().eq("id", trips)).error).toBeNull();
    const photo = await me.client.from("photos").select("id, photo_group_items(group_id)").eq("id", photoId).single();
    expect(photo.data?.photo_group_items).toEqual([]);
    await me.client.rpc("set_photo_groups", { photo: photoId, group_ids: [family] });
    await me.client.from("photos").delete().eq("id", photoId);
    const { count } = await me.client.from("photo_group_items").select("photo_id", { count: "exact", head: true });
    expect(count).toBe(0);
  });

  it("stops at 50 groups", async () => {
    const rows = Array.from({ length: 49 }, (_, i) => ({ name: `G${i}` }));
    expect((await me.client.from("photo_groups").insert(rows)).error).toBeNull();
    expect((await me.client.from("photo_groups").insert({ name: "One too many" })).error?.code).toBe("53400");
  });
});
