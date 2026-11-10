/**
 * Links from the home-screen widget: `hidl://open?path=/countdown%23c-<id>` opens that page of
 * the journal. Only paths on this site (one leading slash), so a link can't send the web view
 * anywhere else.
 */
export function pathFromLink(url: string | null | undefined): string | null {
  const m = url?.match(/^hidl:\/\/open\?path=([^&]*)/);
  if (!m) return null;
  let path: string;
  try {
    path = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') ? path : null;
}
