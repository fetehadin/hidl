import { cookies } from "next/headers";
import { Analytics } from "@/components/analytics/analytics";
import Link from "next/link";
import { CalendarPrefProvider } from "@/components/calendar-pref";
import { HidiMenu } from "@/components/hidi-menu";
import { BuddyProvider } from "@/components/buddy-context";
import { AppLockGate } from "@/components/lock/app-lock-gate";
import { Mascot } from "@/components/mascot";
import { AppShell, MobileTabBar } from "@/components/nav";
import { ProfileImage } from "@/components/profile/profile-image";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UsagePing } from "@/components/usage-ping";
import { LOCK_COOKIE } from "@/lib/app-lock";
import { getProfile } from "@/lib/data/profile";
import { NAV_COOKIE } from "@/lib/nav-cookie";
import { pictureUrl } from "@/lib/profile-rules";
import { publicEnv } from "@/lib/public-env";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { isAdmin, requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [{ supabase, user, calendar, timeZone }, cookieStore] = await Promise.all([requireUser(), cookies()]);
  // Read fresh on every request (not from the login token), so a new buddy shows up at once.
  // is_admin() only decides whether the nav shows the Admin link; /admin checks again itself.
  const [profile, admin] = await Promise.all([getProfile(supabase), isAdmin(supabase, user)]);
  const buddy = profile.avatar;
  const pictureSrc = profile.picturePath ? pictureUrl(publicEnv.NEXT_PUBLIC_SUPABASE_URL, profile.picturePath) : null;
  const navCollapsed = cookieStore.get(NAV_COOKIE)?.value === "collapsed";
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  // This device has an app lock for this user: render everything hidden until it's opened.
  const lockedHere = decodeURIComponent(cookieStore.get(LOCK_COOKIE)?.value ?? "").split(",").includes(user.id);

  return (
    <CalendarPrefProvider value={calendar} timeZone={timeZone}>
      <BuddyProvider value={buddy}>
      <AppLockGate userId={user.id} initiallyLocked={lockedHere}>
      <Analytics userId={user.id} />
      <AppShell initialCollapsed={navCollapsed} avatar={buddy} pictureSrc={pictureSrc} isAdmin={admin} theme={theme}>
        {/* Positioned so it floats above full-screen pages like the memories board. */}
        <header className="relative z-20 mx-auto flex max-w-[70rem] items-center justify-between gap-3 px-5 pt-4 pb-2 sm:pt-6">
          <Link href="/" className="group flex items-center gap-2 font-brand text-[1.9rem] leading-none font-semibold tracking-tight">
            <Mascot brand size={46} float={false} className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" />
            hidl
          </Link>
          <div className="flex items-center gap-2 sm:hidden">
            <ThemeToggle serverTheme={theme} className={"grid size-11 place-items-center rounded-full text-ink-soft transition-colors hover:bg-mint hover:text-ocean"} />
            <Link href="/account" aria-label="Account" className="clay grid size-11 place-items-center overflow-hidden rounded-full">
              <ProfileImage pictureSrc={pictureSrc} avatar={buddy} size={44} />
            </Link>
          </div>
        </header>

        {/* Bottom padding lets every page scroll clear of the tab bar and Hidi's corner menu. */}
        <main className="mx-auto max-w-[70rem] px-5 pt-2 pb-36 sm:pb-24">{children}</main>
      </AppShell>
      <MobileTabBar />
      <HidiMenu />
      </AppLockGate>
      <UsagePing />
      </BuddyProvider>
    </CalendarPrefProvider>
  );
}
