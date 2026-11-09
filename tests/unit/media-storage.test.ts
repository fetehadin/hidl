import { describe, expect, it } from "vitest";
import { CONTENT_TYPE_OF_EXT, MEDIA_QUOTA_BYTES, formatSize } from "@/lib/media";
import { contentMatches, sniffContentType } from "@/lib/media-sniff";
import { isOwnPath } from "@/lib/storage/paths";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)));

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], [0, 0x10], "JFIF", [0, 1, 1, 0, 0, 1]);
const WEBP = bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 ");
const MP4 = bytes([0, 0, 0, 0x20], "ftypisom", [0, 0, 2, 0]);
const MOV = bytes([0, 0, 0, 0x14], "ftypqt  ", [0, 0, 2, 0]);
const WEBM = bytes([0x1a, 0x45, 0xdf, 0xa3], [0x9f, 0x42, 0x86, 0x81, 1, 0x42, 0xf7, 0x81, 1, 0x42, 0xf2, 0x81]);
const HTML = bytes("<!doctype html><html>");
const PNG = bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 0x0d], "IHDR");

describe("file type from the first bytes", () => {
  it("recognises every type the app stores", () => {
    expect(sniffContentType(JPEG)).toBe("image/jpeg");
    expect(sniffContentType(WEBP)).toBe("image/webp");
    expect(sniffContentType(MP4)).toBe("video/mp4");
    expect(sniffContentType(MOV)).toBe("video/quicktime");
    expect(sniffContentType(WEBM)).toBe("video/webm");
  });

  it("rejects anything else, and files too short to tell", () => {
    expect(sniffContentType(HTML)).toBeNull();
    expect(sniffContentType(PNG)).toBeNull();
    expect(sniffContentType(new Uint8Array(3))).toBeNull();
  });

  it("a renamed file doesn't pass as a photo; MP4 and MOV count as one", () => {
    expect(contentMatches("image/webp", WEBP)).toBe(true);
    expect(contentMatches("image/webp", JPEG)).toBe(false);
    expect(contentMatches("image/jpeg", HTML)).toBe(false);
    expect(contentMatches("video/mp4", MOV)).toBe(true);
    expect(contentMatches("video/quicktime", MP4)).toBe(true);
    expect(contentMatches("video/webm", MP4)).toBe(false);
  });

  it("every stored extension maps to a type the check knows", () => {
    for (const type of Object.values(CONTENT_TYPE_OF_EXT)) {
      expect(["image/jpeg", "image/webp", "video/mp4", "video/quicktime", "video/webm"]).toContain(type);
    }
  });
});

describe("own folder", () => {
  const me = "8f0a2b1c-1111-4222-8333-444455556666";
  it("allows files in your folder only", () => {
    expect(isOwnPath(me, `${me}/2026-11-09-0123456789abcdef.webp`)).toBe(true);
    expect(isOwnPath(me, `${me}/2026-10-01/abc.jpg`)).toBe(true);
    expect(isOwnPath(me, `other/2026-11-09-0123456789abcdef.webp`)).toBe(false);
    expect(isOwnPath(me, `${me}x/file.webp`)).toBe(false);
    expect(isOwnPath(me, `${me}/../other/file.webp`)).toBe(false);
    expect(isOwnPath(me, `${me}//file.webp`)).toBe(false);
    expect(isOwnPath(me, `${me}/a\\..\\b.webp`)).toBe(false);
    expect(isOwnPath("", "/file.webp")).toBe(false);
  });
});

describe("sizes", () => {
  it("formats photo space", () => {
    expect(formatSize(MEDIA_QUOTA_BYTES)).toBe("2 GB");
    expect(formatSize(MEDIA_QUOTA_BYTES * 0.9)).toBe("1.8 GB");
    expect(formatSize(340 * 1024 * 1024)).toBe("340 MB");
  });
});
