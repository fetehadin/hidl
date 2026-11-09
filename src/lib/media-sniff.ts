/**
 * What a file really is, from its first bytes, so a renamed file can't pass as a photo. Covers
 * exactly the types the app stores (CONTENT_TYPE_OF_EXT in src/lib/media.ts). Needs 16 bytes.
 */
export function sniffContentType(head: Uint8Array): string | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((b, k) => head[i + k] === b);
  const ascii = (i: number, s: string) => at(i, ...Array.from(s, (c) => c.charCodeAt(0)));

  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return "video/webm";
  // ISO media: a box size, then "ftyp", then the brand. QuickTime files say "qt  ".
  if (ascii(4, "ftyp")) return ascii(8, "qt  ") ? "video/quicktime" : "video/mp4";
  return null;
}

/**
 * Whether a file's first bytes fit the type it was uploaded as. MP4 and MOV share a container,
 * and phones label either one either way, so those two count as the same.
 */
export function contentMatches(declared: string, head: Uint8Array) {
  const real = sniffContentType(head);
  if (!real) return false;
  const video = (t: string) => t === "video/mp4" || t === "video/quicktime";
  return real === declared || (video(real) && video(declared));
}
