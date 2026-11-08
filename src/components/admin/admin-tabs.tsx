"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/system", label: "System" },
] as const;

/** The admin section's tabs. Scrolls sideways on narrow phones instead of wrapping. */
export function AdminTabs({ newFeedback }: { newFeedback: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-5 mb-6 overflow-x-auto px-5">
      <ul className="flex w-max gap-1.5 rounded-2xl border border-line bg-white p-1.5">
        {TABS.map(({ href, label }) => {
          const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-bold whitespace-nowrap transition-colors ${
                  active ? "bg-mint text-accent" : "text-muted hover:bg-mint/70 hover:text-accent"
                }`}
              >
                {label}
                {href === "/admin/feedback" && newFeedback > 0 && (
                  <span className="grid min-w-5 place-items-center rounded-full bg-wax px-1.5 text-xs text-wax-ink tabular-nums">
                    <span className="sr-only">, </span>
                    {newFeedback > 99 ? "99+" : newFeedback}
                    <span className="sr-only"> new</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
