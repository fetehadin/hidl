import { cookies } from "next/headers";
import Link from "next/link";
import { CalendarPrefProvider } from "@/components/calendar-pref";
import { HidiMenu } from "@/components/hidi-menu";
import { UserIcon } from "@/components/icons";
import { Mascot } from "@/components/mascot";
import { AppShell, MobileTabBar } from "@/components/nav";
import { NAV_COOKIE } from "@/lib/nav-cookie";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [{ calendar }, cookieStore] = await Promise.all([requireUser(), cookies()]);
  const navCollapsed = cookieStore.get(NAV_COOKIE)?.value === "collapsed";

  return (
    <CalendarPrefProvider value={calendar}>
      <AppShell initialCollapsed={navCollapsed}>
        {/* Positioned so it floats above full-screen pages like the memories board. */}
        <header className="relative z-20 mx-auto flex max-w-[70rem] items-center justify-between gap-3 px-5 pt-4 pb-2 sm:pt-6">
          <Link href="/" className="group flex items-center gap-2 font-display text-[1.9rem] leading-none font-semibold tracking-tight">
            <Mascot size={46} float={false} className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" />
            hidl
          </Link>
          <Link href="/account" aria-label="Account" className="clay grid size-11 place-items-center rounded-full text-ink-soft sm:hidden">
            <UserIcon width={22} height={22} />
          </Link>
        </header>

        {/* Bottom padding lets every page scroll clear of the tab bar and Hidi's corner menu. */}
        <main className="mx-auto max-w-[70rem] px-5 pt-2 pb-36 sm:pb-24">{children}</main>
      </AppShell>
      <MobileTabBar />
      <HidiMenu />
    </CalendarPrefProvider>
  );
}
