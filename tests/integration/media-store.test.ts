import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discardMedia, mediaStore, ownPaths, reserveMedia, verifyUploads } from "@/lib/storage";
import { supabaseStore } from "@/lib/storage/supabase";
import { admin, createTestUser, deleteTestUser, type TestUser } from "./helpers";

// The self-hosted store end to end: reserve → signed upload → server check → view → delete,
// against a local Garage (docs/storage.md → "Testing locally"). Skipped without one.
const s3 = process.env.STORAGE_PROVIDER === "s3" && Boolean(process.env.S3_PUBLIC_URL);

const WEBP = new Uint8Array([...new TextEncoder().encode("RIFF"), 0x24, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8 "), ...new Uint8Array(200)]);
const HTML = new TextEncoder().encode("<!doctype html><script>alert(1)</script>".padEnd(WEBP.length, " "));

let n = 0;
const pathFor = (u: TestUser, thumb = false) =>
  `${u.id}/2026-11-09-${(Date.now().toString(16) + (++n).toString(16)).padStart(16, "0")}${thumb ? "-thumb" : ""}.webp`;

async function put(target: { url: string; headers: Record<string, string> }, body: Uint8Array<ArrayBuffer>) {
  return (await fetch(target.url, { method: "PUT", headers: target.headers, body })).status;
}

describe.skipIf(!s3)("self-hosted media store", () => {
  let a: TestUser;
  let b: TestUser;
  beforeAll(async () => {
    [a, b] = await Promise.all([createTestUser(), createTestUser()]);
  });
  afterAll(async () => {
    const store = mediaStore(admin);
    await Promise.all([a, b].map((u) => u && store.removeFolder(u.id)));
    await Promise.all([deleteTestUser(a), deleteTestUser(b)]);
  });

  it("upload, check, view and delete", async () => {
    const store = mediaStore(a.client);
    const path = pathFor(a);
    expect(await reserveMedia(a.client, [{ path, bytes: WEBP.length, contentType: "image/webp" }])).toEqual({ ok: true });
    const target = await store.uploadTarget(path, WEBP.length, "image/webp");
    expect(await put(target, WEBP)).toBe(200);

    expect(await verifyUploads(store, a.id, [path])).toBe(true);
    const row = await admin.from("media_objects").select("confirmed_at").eq("path", path).single();
    expect(row.data?.confirmed_at).not.toBeNull();

    const url = (await store.viewUrls([path])).get(path)!;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(WEBP);

    await discardMedia(store, [path]);
    expect((await fetch(url)).status).toBe(404);
    expect((await admin.from("media_objects").select("path").eq("path", path)).data).toEqual([]);
  });

  it("an upload link takes only that exact file", async () => {
    const store = mediaStore(a.client);
    const path = pathFor(a);
    await reserveMedia(a.client, [{ path, bytes: WEBP.length, contentType: "image/webp" }]);
    const target = await store.uploadTarget(path, WEBP.length, "image/webp");
    expect(await put(target, new Uint8Array(WEBP.length + 1))).toBe(403); // bigger
    expect(await put({ ...target, headers: { ...target.headers, "content-type": "text/html" } }, WEBP)).toBe(403); // other type
    const elsewhere = new URL(target.url);
    elsewhere.pathname = elsewhere.pathname.replace(a.id, b.id);
    expect(await put({ ...target, url: elsewhere.toString() }, WEBP)).toBe(403); // other folder
    await discardMedia(store, [path]);
  });

  it("a file that isn't what it claims is thrown away", async () => {
    const store = mediaStore(a.client);
    const path = pathFor(a);
    await reserveMedia(a.client, [{ path, bytes: HTML.length, contentType: "image/webp" }]);
    expect(await put(await store.uploadTarget(path, HTML.length, "image/webp"), HTML)).toBe(200);
    expect(await verifyUploads(store, a.id, [path])).toBe(false);
    expect(await store.inspect(path)).toBeNull();
    expect((await admin.from("media_objects").select("path").eq("path", path)).data).toEqual([]);
  });

  it("nothing reserved, nothing uploaded, or someone else's file: not saved", async () => {
    const store = mediaStore(a.client);
    expect(await verifyUploads(store, a.id, [pathFor(a)])).toBe(false); // never reserved
    const bPath = pathFor(b);
    await reserveMedia(b.client, [{ path: bPath, bytes: WEBP.length, contentType: "image/webp" }]);
    expect(await put(await store.uploadTarget(bPath, WEBP.length, "image/webp"), WEBP)).toBe(200);
    expect(await verifyUploads(store, a.id, [bPath])).toBe(false); // a can't claim b's file
    expect(await store.inspect(bPath)).not.toBeNull(); // and doesn't get to delete it
    expect(ownPaths(a.id, [bPath], "test")).toEqual([]); // nor a view link for it
    await discardMedia(store, [bPath]);
  });

  it("a view link without its signature, or with a changed one, is refused", async () => {
    const store = mediaStore(a.client);
    const path = pathFor(a);
    await reserveMedia(a.client, [{ path, bytes: WEBP.length, contentType: "image/webp" }]);
    await put(await store.uploadTarget(path, WEBP.length, "image/webp"), WEBP);
    const url = new URL((await store.viewUrls([path])).get(path)!);
    expect((await fetch(url.origin + url.pathname)).status).toBe(403);
    url.searchParams.set("X-Amz-Expires", "3600");
    expect((await fetch(url)).status).toBe(403);
    await discardMedia(store, [path]);
  });

  it("deleting an account's files empties its folder", async () => {
    const c = await createTestUser();
    const store = mediaStore(c.client);
    const paths = [pathFor(c), pathFor(c, true)];
    await reserveMedia(c.client, paths.map((path) => ({ path, bytes: WEBP.length, contentType: "image/webp" })));
    for (const path of paths) await put(await store.uploadTarget(path, WEBP.length, "image/webp"), WEBP);
    expect(await store.removeFolder(c.id)).toBe(2);
    for (const path of paths) expect(await store.inspect(path)).toBeNull();
    await deleteTestUser(c);
  });
});

// The same flow with Supabase Storage as the store (STORAGE_PROVIDER=supabase, today's setting).
// Its upload links don't lock the size, so the check after upload has to catch a different one.
describe("Supabase media store", () => {
  let a: TestUser;
  beforeAll(async () => {
    a = await createTestUser();
  });
  afterAll(async () => {
    await supabaseStore(admin).removeFolder(a.id);
    await deleteTestUser(a);
  });

  it("upload, check, view and delete", async () => {
    const store = supabaseStore(a.client);
    const path = pathFor(a);
    expect(await reserveMedia(a.client, [{ path, bytes: WEBP.length, contentType: "image/webp" }])).toEqual({ ok: true });
    expect(await put(await store.uploadTarget(path, WEBP.length, "image/webp"), WEBP)).toBe(200);
    expect(await verifyUploads(store, a.id, [path])).toBe(true);
    const url = (await store.viewUrls([path])).get(path)!;
    expect((await fetch(url)).status).toBe(200);
    await discardMedia(store, [path]);
    expect(await store.inspect(path)).toBeNull();
  });

  it("a different size or a fake photo is thrown away after upload", async () => {
    const store = supabaseStore(a.client);
    const bigger = pathFor(a);
    await reserveMedia(a.client, [{ path: bigger, bytes: 10, contentType: "image/webp" }]);
    expect(await put(await store.uploadTarget(bigger, 10, "image/webp"), WEBP)).toBe(200);
    expect(await verifyUploads(store, a.id, [bigger])).toBe(false);
    expect(await store.inspect(bigger)).toBeNull();

    const fake = pathFor(a);
    await reserveMedia(a.client, [{ path: fake, bytes: HTML.length, contentType: "image/webp" }]);
    expect(await put(await store.uploadTarget(fake, HTML.length, "image/webp"), HTML)).toBe(200);
    expect(await verifyUploads(store, a.id, [fake])).toBe(false);
    expect(await store.inspect(fake)).toBeNull();
  });
});
