"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarIcon, EnvelopeIcon, HomeIcon, HourglassIcon, MemoriesIcon } from "./icons";

const LINKS = [
  { href: "/", label: "Today", Icon: HomeIcon },
  { href: "/letters", label: "Letters", Icon: EnvelopeIcon },
  { href: "/countdown", label: "Countdown", Icon: HourglassIcon },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/memories", label: "Memories", Icon: MemoriesIcon },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="clay hidden items-center gap-1 rounded-full p-1.5 sm:flex">
      {LINKS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[15px] font-bold transition-[background-color,transform] duration-150 active:scale-95 ${
              active ? "bg-mint text-ocean shadow-[inset_0_0_0_2px_var(--teal)]" : "text-ocean hover:bg-mint"
            }`}
          >
            <Icon width={18} height={18} className={`hidden lg:block ${active ? "text-teal" : ""}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Bottom tab bar: one chunky icon per section; the active one sits in a lifted pastel tile. */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-line bg-white sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 px-2 pt-1.5 pb-1">
        {LINKS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`mx-auto flex min-h-12 max-w-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-2xl border-2 py-1.5 text-[11px] font-extrabold tracking-wide transition-transform duration-150 active:scale-90 ${
                  active ? "border-teal bg-mint text-ocean" : "border-transparent text-muted"
                }`}
              >
                <Icon width={24} height={24} strokeWidth={active ? 2.4 : 2} className={active ? "text-teal" : ""} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
