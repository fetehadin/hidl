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

/**
 * The sliders button on a widget: `hidl://widget?id=<widgetId>` opens that widget's settings
 * (which countdowns it shows, and its look). Returns the id, `null` for a plain `hidl://widget`,
 * or `undefined` if the link isn't one.
 */
export function widgetIdFromLink(url: string | null | undefined): number | null | undefined {
  const m = url?.match(/^hidl:\/\/widget\/?(?:\?id=(\d{1,10}))?$/);
  if (!m) return undefined;
  return m[1] ? Number(m[1]) : null;
}
