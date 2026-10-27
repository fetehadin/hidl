import Link from "next/link";
import { Envelope } from "@/components/envelope";
import { LiveRelative } from "@/components/live-relative";
import type { LetterMeta } from "@/lib/data/letters";
import { formatInAppTz } from "@/lib/time";

export function letterState(letter: LetterMeta, now = Date.now()) {
  if (letter.opened_at) return "opened" as const;
  return new Date(letter.unlock_at).getTime() <= now ? ("ready" as const) : ("sealed" as const);
}

export function sealInitial(recipient: string) {
  return recipient.trim().charAt(0).toUpperCase() || "✶";
}

export function LetterCard({ letter, now }: { letter: LetterMeta; now: number }) {
  const state = letterState(letter, now);

  return (
    <Link
      href={`/letters/${letter.id}`}
      className="group block rounded-2xl transition-transform hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
      aria-label={`${letter.title}, for ${letter.recipient}. ${
        state === "sealed" ? "Sealed" : state === "ready" ? "Ready to open" : "Opened"
      }`}
    >
      <Envelope state={state} initial={sealInitial(letter.recipient)}>
        <p className="font-hand text-lg leading-none text-accent">for {letter.recipient}</p>
        <h3 className="mt-1 font-display text-xl font-semibold leading-snug">{letter.title}</h3>
        {letter.occasion && <p className="text-[15px] text-ink-soft">{letter.occasion}</p>}

        <div className="mt-3 flex items-center justify-between gap-2 text-[15px]">
          {state === "sealed" && (
            <>
              <span className="font-semibold text-ink-soft">
                <LiveRelative target={letter.unlock_at} />
              </span>
              <span className="text-muted">{formatInAppTz(letter.unlock_at, "MMM d, yyyy")}</span>
            </>
          )}
          {state === "ready" && <span className="btn btn-primary min-h-9 px-4 text-[15px]">Open</span>}
          {state === "opened" && (
            <span className="text-muted">Opened {formatInAppTz(letter.opened_at!, "MMM d, yyyy")}</span>
          )}
        </div>
      </Envelope>
    </Link>
  );
}
