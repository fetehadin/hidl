import type { ReactNode } from "react";

/** A small pill label: "admin", "suspended", a feedback kind or status. */
export function Badge({ tone, children }: { tone: "teal" | "wax" | "plain"; children: ReactNode }) {
  const cls = {
    teal: "border-teal bg-mint text-ocean",
    wax: "border-wax/50 bg-wax/10 text-wax",
    plain: "border-line bg-white text-muted",
  }[tone];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${cls}`}>{children}</span>;
}
