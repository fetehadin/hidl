import Link from "next/link";
import { signOut } from "@/actions/auth";
import { UserIcon } from "@/components/icons";
import { Mascot } from "@/components/mascot";
import { DesktopNav, MobileTabBar } from "@/components/nav";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();

  return (
    <div className="min-h-dvh">
      {/* Positioned so it floats above full-screen pages like the memories board. */}
      <header className="relative z-20 mx-auto flex max-w-[70rem] items-center justify-between gap-3 px-5 pt-4 pb-2 sm:pt-6">
        <Link href="/" className="group flex items-center gap-1.5 font-display text-2xl font-semibold tracking-tight">
          <Mascot size={34} float={false} className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" />
          hidl
        </Link>
        <DesktopNav />
        <div className="hidden items-center gap-4 sm:flex">
          <Link href="/account" className="text-sm font-semibold text-muted underline-offset-4 hover:text-ink hover:underline">
            Account
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-sm font-semibold text-muted underline-offset-4 hover:text-ink hover:underline">
              Sign out
            </button>
          </form>
        </div>
        <Link href="/account" aria-label="Account" className="clay grid size-11 place-items-center rounded-full text-ink-soft sm:hidden">
          <UserIcon width={22} height={22} />
        </Link>
      </header>

      <main className="mx-auto max-w-[70rem] px-5 pt-2 pb-28 sm:pb-16">{children}</main>
      <MobileTabBar />
    </div>
  );
}
