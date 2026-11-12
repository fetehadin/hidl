import { cookies } from "next/headers";
import { Analytics } from "@/components/analytics/analytics";
import Link from "next/link";
import { CalendarPrefProvider } from "@/components/calendar-pref";
import { HidiMenu } from "@/components/hidi-menu";
import { BuddyProvider } from "@/components/buddy-context";
import { AppLockGate } from "@/components/lock/app-lock-gate";
import { Mascot } from "@/components/mascot";
import { OfflineStatusProvider, OfflineTitle } from "@/components/offline-status";
import { MediaLinkRefresher } from "@/components/media-link-refresher";
import { AppShell, MobileTabBar } from "@/components/nav";
import { ProfileImage } from "@/components/profile/profile-image";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UsagePing } from "@/components/usage-ping";
import { LOCK_COOKIE } from "@/lib/app-lock";
import { getProfile } from "@/lib/data/profile";
import { NAV_COOKIE } from "@/lib/nav-cookie";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { isAdmin, requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [{ supabase, user, calendar, timeZone }, cookieStore] = await Promise.all([requireUser(), cookies()]);
  // Read fresh on every request (not from the login token), so a new buddy shows up at once.
  // is_admin() only decides whether the nav shows the Admin link; /admin checks again itself.
  const [profile, admin] = await Promise.all([getProfile(supabase), isAdmin(supabase, user)]);
  const buddy = profile.avatar;
  const navCollapsed = cookieStore.get(NAV_COOKIE)?.value === "collapsed";
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  // This device has an app lock for this user: render everything hidden until it's opened.
  const lockedHere = decodeURIComponent(cookieStore.get(LOCK_COOKIE)?.value ?? "").split(",").includes(user.id);

  return (
    <CalendarPrefProvider value={calendar} timeZone={timeZone}>
      {/* Marks signed-in pages, so the service worker may save a copy for offline (public/sw.js). */}
      <meta name="hidl-offline" content="1" />
      <BuddyProvider value={buddy}>
      <AppLockGate userId={user.id} initiallyLocked={lockedHere}>
      <Analytics userId={user.id} />
      <OfflineStatusProvider>
      <AppShell initialCollapsed={navCollapsed} avatar={buddy} isAdmin={admin} theme={theme}>
        {/* Phones only: pinned to the top (below the status bar) at one fixed height, on the page
            color, so it stays put while the page scrolls under it; see-through over the memories
            board (.app-header in globals.css). Wider screens have the logo at the top of the side nav. */}
        <header className="app-header sticky top-[var(--safe-top)] z-30 border-b border-line/70 bg-paper/90 backdrop-blur-md sm:hidden">
          <div className="mx-auto flex h-15 max-w-[70rem] items-center justify-between gap-3 px-4 min-[400px]:px-5">
            {/* The logo, or Telegram-style "Waiting for network…" in its place while offline. */}
            <div className="min-w-0">
              <OfflineTitle>
                <Link href="/" className="group flex items-center gap-1.5 font-brand text-[1.65rem] leading-none font-semibold tracking-tight text-teal">
                  <Mascot brand size={40} float={false} className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" />
                  Hidl
                </Link>
              </OfflineTitle>
            </div>
            <div className="flex items-center gap-1.5">
              <ThemeToggle serverTheme={theme} className={"grid size-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-mint hover:text-ocean"} />
              <Link href="/account" aria-label="Account" className="grid size-10 place-items-center overflow-hidden rounded-full ring-2 ring-aqua transition-transform active:scale-95">
                <ProfileImage avatar={buddy} size={40} />
              </Link>
            </div>
          </div>
        </header>

        {/* Bottom padding lets every page scroll clear of the tab bar and Hidi's corner menu. */}
        <main className="mx-auto max-w-[70rem] px-4 pt-4 pb-36 min-[400px]:px-5 sm:pt-[4.25rem] sm:pb-24">{children}</main>
      </AppShell>
      </OfflineStatusProvider>
      <MobileTabBar />
      <HidiMenu />
      </AppLockGate>
      <UsagePing />
      <MediaLinkRefresher />
      </BuddyProvider>
    </CalendarPrefProvider>
  );
}
