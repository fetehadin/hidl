import Link from "next/link";
import { Envelope } from "@/components/envelope";
import { sealInitial } from "@/components/letters/letter-card";
import { LiveRelative } from "@/components/live-relative";
import type { LetterMeta } from "@/lib/data/letters";

/**
 * The letters corner of Today, always an envelope: one ready to open (glowing seal), the next
 * sealed one, or, for someone who hasn't written yet, a blank one that starts a letter. The
 * envelope says what the feature is without a paragraph explaining it.
 */
export function LetterTile({
  next,
  readyCount,
  className = "",
}: {
  next: LetterMeta | null;
  readyCount: number;
  className?: string;
}) {
  const body =
    readyCount > 0
      ? {
          href: "/letters",
          state: "ready" as const,
          initial: "✶",
          hand: "from past you",
          title: readyCount === 1 ? "A letter is ready" : `${readyCount} letters are ready`,
          sub: <span className="font-bold text-accent">Open it</span>,
        }
      : next
        ? {
            href: `/letters/${next.id}`,
            state: "sealed" as const,
            initial: sealInitial(next.recipient),
            hand: `for ${next.recipient}`,
            title: next.title,
            sub: <LiveRelative target={next.unlock_at} />,
          }
        : {
            href: "/letters/new",
            state: "sealed" as const,
            initial: "✎",
            hand: "for future you",
            title: "Write a letter",
            sub: "Sealed until the day you pick",
          };

  return (
    <Link href={body.href} className={`group animate-fade-up block min-w-0 ${className}`} aria-label={`${body.title}. ${body.hand}`}>
      <Envelope state={body.state} initial={body.initial} className="flex h-full flex-col justify-end">
        <p className="truncate font-hand text-base leading-none text-accent sm:text-lg">{body.hand}</p>
        <p className="mt-1 line-clamp-2 font-display text-base leading-snug font-bold text-ink sm:text-xl">{body.title}</p>
        <p className="mt-1 text-[13px] font-semibold text-ink-soft sm:text-[15px]">{body.sub}</p>
      </Envelope>
    </Link>
  );
}
