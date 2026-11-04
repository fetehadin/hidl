import Link from "next/link";
import { Mascot } from "@/components/mascot";

/** The public pages (landing, install help): their own header and footer, no app chrome. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-[72rem] items-center justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-7">
        <Link href="/" className="group flex items-center gap-2 font-display text-[1.9rem] leading-none font-semibold tracking-tight">
          <Mascot size={46} float={false} className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" />
          hidl
        </Link>
        <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
          <Link href="/#features" className="hidden rounded-full px-3 py-2 font-bold text-ink-soft hover:bg-mint hover:text-ocean md:block">
            Features
          </Link>
          <Link href="/#privacy" className="hidden rounded-full px-3 py-2 font-bold text-ink-soft hover:bg-mint hover:text-ocean md:block">
            Privacy
          </Link>
          <Link href="/install" className="hidden rounded-full px-3 py-2 font-bold text-ink-soft hover:bg-mint hover:text-ocean sm:block">
            Get the app
          </Link>
          <Link href="/login" className="btn btn-primary min-h-11 px-5">
            Sign in
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-[72rem] px-5 pb-16 sm:px-8">{children}</main>

      <footer className="border-t-2 border-aqua/60 bg-white/50">
        <div className="mx-auto flex max-w-[72rem] flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-muted sm:px-8">
          <p className="flex items-center gap-2">
            <Mascot size={26} float={false} />
            <span>
              <strong className="font-display text-base text-heading">hidl</strong> · letters, countdowns and a year in pictures
            </span>
          </p>
          <p className="flex gap-4 font-semibold">
            <Link href="/install" className="hover:text-ocean">Install the app</Link>
            <Link href="/#privacy" className="hover:text-ocean">Privacy</Link>
            <Link href="/stats" className="hover:text-ocean">Stats</Link>
            <Link href="/login" className="hover:text-ocean">Sign in</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
