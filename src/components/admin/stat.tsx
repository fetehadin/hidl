import Link from "next/link";

const nf = new Intl.NumberFormat("en-US");

/** A number tile. With `href` the whole tile links somewhere (e.g. "new feedback" → the inbox). */
export function Stat({
  label,
  value,
  sub,
  href,
  highlight = false,
}: {
  label: string;
  value: number | string;
  sub?: string;
  href?: string;
  highlight?: boolean;
}) {
  const body = (
    <>
      <p className={`font-display text-3xl font-semibold tabular-nums sm:text-4xl ${highlight ? "text-wax" : "text-heading"}`}>
        {typeof value === "number" ? nf.format(value) : value}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink-soft">{label}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="card card-interactive block p-4 sm:p-5">
      {body}
    </Link>
  ) : (
    <div className="card p-4 sm:p-5">{body}</div>
  );
}
