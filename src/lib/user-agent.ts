/**
 * iPhones and iPads (by user agent). Home-screen widgets need the Android app, so the countdown
 * pages don't offer one there. iPads that ask for the desktop site look like Macs here; the
 * client check in use-device.ts catches those after load.
 */
export function isAppleMobile(userAgent: string | null | undefined): boolean {
  return /iphone|ipad|ipod/i.test(userAgent ?? "");
}
