import Link from "next/link";
import { signOut } from "@/actions/auth";
import { DesktopNav, MobileTabBar } from "@/components/nav";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-5 pb-2 sm:pt-8">
        <Link href="/" className="font-display text-2xl font-semibold tracking-tight">
          hidl
        </Link>
        <DesktopNav />
        <form action={signOut}>
          <button type="submit" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
            Sign out
          </button>
        </form>
      </header>

      <main className="mx-auto max-w-3xl px-5 pt-2 pb-28 sm:pb-16">{children}</main>
      <MobileTabBar />
    </div>
  );
}
