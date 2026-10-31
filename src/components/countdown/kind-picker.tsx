import Link from "next/link";
import { COUNTDOWN_KINDS, KIND_INFO } from "@/lib/countdown-kinds";
import { KindBadge } from "./kind-icon";

/** One tile per kind of countdown; each links to the form for that kind. */
export function KindPicker() {
  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
      {COUNTDOWN_KINDS.map((kind) => {
        const info = KIND_INFO[kind];
        return (
          <li key={kind}>
            <Link
              href={`/countdown/new?kind=${kind}`}
              className="group flex h-full flex-col items-start gap-1.5 rounded-[1.25rem] border-2 border-aqua bg-white p-3 sm:gap-2 sm:rounded-card transition-[transform,border-color,background-color] hover:-translate-y-0.5 hover:border-teal hover:bg-mint/40 sm:p-4"
            >
              <span className="transition-transform group-hover:scale-110 group-hover:-rotate-6">
                <KindBadge kind={kind} size={40} />
              </span>
              <span>
                <span className="block font-display text-[17px] leading-tight sm:text-lg font-semibold text-heading">{info.label}</span>
                <span className="block text-[13px] leading-snug text-muted sm:text-sm">{info.blurb}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
