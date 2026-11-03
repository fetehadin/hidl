import { Markdown } from "@/components/markdown";
import { type CalendarPref, formatDay } from "@/lib/dates";

export function LetterPaper({
  title,
  recipient,
  body,
  createdAt,
  unlockAt,
  calendar,
  timeZone,
  className = "",
}: {
  title: string;
  recipient: string;
  body: string;
  createdAt: string;
  unlockAt: string;
  calendar: CalendarPref;
  timeZone: string;
  className?: string;
}) {
  return (
    <article className={`letter-paper px-5 pt-6 pb-8 sm:px-8 ${className}`}>
      <p className="font-hand text-xl text-accent">for {recipient}</p>
      <h1 className="mt-1 mb-6 font-display text-2xl font-semibold leading-tight sm:text-3xl">{title}</h1>
      <Markdown>{body}</Markdown>
      <p className="mt-10 text-sm text-muted">
        Written {formatDay(createdAt, calendar, timeZone)} · sealed until {formatDay(unlockAt, calendar, timeZone)}
      </p>
    </article>
  );
}
