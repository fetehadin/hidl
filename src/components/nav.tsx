"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarIcon, EnvelopeIcon, HomeIcon, HourglassIcon, UserIcon } from "./icons";

const LINKS = [
  { href: "/", label: "Today", Icon: HomeIcon },
  { href: "/letters", label: "Letters", Icon: EnvelopeIcon },
  { href: "/countdown", label: "Countdown", Icon: HourglassIcon },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
] as const;

// Mobile gets a 5th tab for Account, since there's no room for the header's
// Account/Sign-out links there; desktop keeps those in the header instead.
const MOBILE_LINKS = [...LINKS, { href: "/account", label: "Account", Icon: UserIcon }] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
      {LINKS.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-[15px] transition-colors ${
              active ? "bg-accent-soft font-semibold text-ink" : "text-ink-soft hover:bg-paper-deep"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {MOBILE_LINKS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-semibold tracking-wide ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <Icon width={22} height={22} strokeWidth={active ? 2 : 1.7} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
