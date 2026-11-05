"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { signOut } from "@/actions/auth";
import type { AvatarConfig } from "@/lib/avatar";
import { NAV_COOKIE } from "@/lib/nav-cookie";
import { ProfileImage } from "./profile/profile-image";
import { ThemeToggle } from "./theme/theme-toggle";
import type { Theme } from "@/lib/theme";
import {
  CalendarIcon,
  ChatIcon,
  EnvelopeIcon,
  FlameIcon,
  HomeIcon,
  HourglassIcon,
  MemoriesIcon,
  ShieldIcon,
  SidebarIcon,
  SignOutIcon,
} from "./icons";

const LINKS = [
  { href: "/", label: "Today", Icon: HomeIcon },
  { href: "/letters", label: "Letters", Icon: EnvelopeIcon },
  { href: "/countdown", label: "Countdown", Icon: HourglassIcon },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/memories", label: "Memories", Icon: MemoriesIcon },
  // Side nav only: the phone tab bar has room for five. Phones reach it from Today and Account.
  { href: "/leaderboard", label: "Leaderboard", Icon: FlameIcon, desktopOnly: true },
] as const;

const MOBILE_LINKS = LINKS.filter((l) => !("desktopOnly" in l));


/** Width the side nav takes (sm and up), matching its two states. */
const NAV_WIDTH = { open: "15.5rem", closed: "6rem" };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Wraps the app: on sm+ it reserves room on the left for the side nav and exposes that
 * width as --nav-w, so full-screen pages (the memories board) can keep their fixed
 * overlays clear of it. The collapsed/expanded choice is kept in a cookie so the server
 * renders the right width on the first paint.
 */
export function AppShell({
  initialCollapsed,
  avatar,
  pictureSrc,
  isAdmin,
  theme,
  children,
}: {
  initialCollapsed: boolean;
  avatar: AvatarConfig | null;
  pictureSrc: string | null;
  isAdmin: boolean;
  theme: Theme;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${NAV_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div
      className="min-h-dvh transition-[padding] duration-300 ease-out sm:pl-[var(--nav-w)]"
      style={{ "--nav-w": collapsed ? NAV_WIDTH.closed : NAV_WIDTH.open } as React.CSSProperties}
    >
      {children}
      <SideNav collapsed={collapsed} onToggle={toggle} avatar={avatar} pictureSrc={pictureSrc} isAdmin={isAdmin} theme={theme} />
    </div>
  );
}

/**
 * The desktop nav: a panel on the left edge. Collapsing it slides the labels away and
 * leaves only the icons; expanding slides them back. The active page sits in a pill that
 * glides between items.
 */
function SideNav({
  collapsed,
  onToggle,
  avatar,
  pictureSrc,
  isAdmin,
  theme,
}: {
  collapsed: boolean;
  onToggle: () => void;
  avatar: AvatarConfig | null;
  pictureSrc: string | null;
  isAdmin: boolean;
  theme: Theme;
}) {
  const pathname = usePathname();
  const activeIndex = LINKS.findIndex((l) => isActive(pathname, l.href));

  return (
    <aside
      className="fixed top-0 bottom-0 left-0 z-30 hidden p-3 transition-[width] duration-300 ease-out sm:block"
      style={{ width: "var(--nav-w)" }}
    >
      <nav
        aria-label="Main"
        className="clay flex h-full flex-col overflow-hidden rounded-[1.75rem] px-3 py-4"
      >
        {/* Icon-only, like Gemini's: a side panel with a chevron pointing the way it will move. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
          title={collapsed ? "Open sidebar" : "Close sidebar"}
          className="mb-4 flex h-11 w-fit shrink-0 items-center rounded-2xl px-3.5 text-muted transition-colors hover:bg-mint hover:text-ocean"
        >
          <SidebarIcon open={!collapsed} width={22} height={22} />
        </button>

        <ul className="nav-main relative flex flex-col gap-1.5">
          {/* The sliding "you are here" pill. Each item is 3rem tall with a 0.375rem gap. */}
          {activeIndex >= 0 && (
            <li
              aria-hidden
              className="nav-pill pointer-events-none absolute inset-x-0 top-0 h-12 rounded-2xl bg-mint shadow-[inset_0_0_0_2px_var(--teal)] transition-transform duration-300 ease-[cubic-bezier(.34,1.4,.64,1)]"
              style={{ transform: `translateY(calc(${activeIndex} * 3.375rem))` }}
            />
          )}
          {LINKS.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href} className="relative">
                <Link
                  href={href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? label : undefined}
                  className={`flex h-12 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-bold text-ocean transition-[background-color,transform] duration-150 active:scale-95 ${
                    active ? "" : "hover:bg-mint/70"
                  }`}
                >
                  <Icon width={22} height={22} strokeWidth={active ? 2.4 : 2} className={`shrink-0 ${active ? "text-teal" : ""}`} />
                  <Label collapsed={collapsed}>{label}</Label>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto flex flex-col gap-1.5 border-t-2 border-mint pt-3">
          {isAdmin && (
            <FooterLink href="/admin" label="Admin" Icon={ShieldIcon} collapsed={collapsed} active={isActive(pathname, "/admin")} />
          )}
          <ThemeToggle
            serverTheme={theme}
            className="flex h-11 items-center gap-3 rounded-2xl px-3.5 text-sm font-bold text-muted transition-colors hover:bg-mint hover:text-ocean"
          >
            <Label collapsed={collapsed}>Theme</Label>
          </ThemeToggle>
          {/* Tells the form where the person was, so a bug report says which page. */}
          <FooterLink
            href={pathname === "/feedback" ? "/feedback" : `/feedback?from=${encodeURIComponent(pathname)}`}
            label="Feedback"
            Icon={ChatIcon}
            collapsed={collapsed}
            active={pathname === "/feedback"}
          />
          <Link
            href="/account"
            aria-current={pathname === "/account" ? "page" : undefined}
            title={collapsed ? "Account" : undefined}
            className={`flex h-11 items-center gap-3 rounded-2xl px-3.5 text-sm font-bold transition-colors hover:bg-mint ${
              pathname === "/account" ? "bg-mint text-ocean" : "text-muted hover:text-ocean"
            }`}
          >
            {/* 28px buddy in the 20px icon column, so the label stays aligned with the others. */}
            <ProfileImage pictureSrc={pictureSrc} avatar={avatar} size={28} className="-mx-1 ring-2 ring-aqua" />
            <Label collapsed={collapsed}>Account</Label>
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              title={collapsed ? "Sign out" : undefined}
              className="flex h-11 w-full items-center gap-3 rounded-2xl px-3.5 text-sm font-bold text-muted transition-colors hover:bg-mint hover:text-ocean"
            >
              <SignOutIcon width={20} height={20} className="shrink-0" />
              <Label collapsed={collapsed}>Sign out</Label>
            </button>
          </form>
        </div>
      </nav>
    </aside>
  );
}

/** A small link in the side nav's footer (Admin, Feedback), styled like Account and Sign out. */
function FooterLink({
  href,
  label,
  Icon,
  collapsed,
  active,
}: {
  href: string;
  label: string;
  Icon: typeof ChatIcon;
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`flex h-11 items-center gap-3 rounded-2xl px-3.5 text-sm font-bold transition-colors hover:bg-mint ${
        active ? "bg-mint text-ocean" : "text-muted hover:text-ocean"
      }`}
    >
      <Icon width={20} height={20} className="shrink-0" />
      <Label collapsed={collapsed}>{label}</Label>
    </Link>
  );
}

/** A nav label that slides and fades out when the panel collapses (still read by screen readers). */
function Label({ collapsed, className = "", children }: { collapsed: boolean; className?: string; children: ReactNode }) {
  return (
    <span
      className={`overflow-hidden whitespace-nowrap transition-[opacity,translate] duration-200 ${
        collapsed ? "-translate-x-3 opacity-0" : "translate-x-0 opacity-100 delay-100"
      } ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Bottom tab bar on phones: one chunky icon per section; the active one sits in a lifted pastel tile.
 * Tabs are prefetched in full (data and code), so a tap shows the page at once instead of a
 * skeleton while the phone waits on the network; kept for staleTimes.static (next.config.ts).
 */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-line bg-white sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="tabbar mx-auto grid max-w-md grid-cols-5 px-2 pt-1.5 pb-1">
        {MOBILE_LINKS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                prefetch
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
