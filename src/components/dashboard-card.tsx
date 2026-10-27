import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "./icons";

export function DashboardCard({
  eyebrow,
  href,
  linkLabel,
  children,
  className = "",
}: {
  eyebrow: string;
  href: string;
  linkLabel: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card flex flex-col p-5 ${className}`}>
      <h2 className="eyebrow mb-3">{eyebrow}</h2>
      <div className="flex-1">{children}</div>
      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-1.5 self-start text-[15px] font-semibold text-accent underline-offset-4 hover:underline"
      >
        {linkLabel}
        <ArrowRightIcon width={16} height={16} />
      </Link>
    </section>
  );
}
