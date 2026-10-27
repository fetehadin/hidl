/** Horizontal bar: filled to the actual score, with a tick at the target. */
export function ScoreCompare({ actual, target, max }: { actual: number; target: number; max: number }) {
  const diff = actual - target;
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / max) * 100))}%`;
  const verdict =
    diff > 0 ? `${diff} above your target` : diff === 0 ? "Exactly on target" : `${-diff} below your target`;

  return (
    <div>
      <p className="font-display text-5xl font-semibold tabular-nums sm:text-6xl">
        {actual}
        <span className="text-2xl text-muted"> / {max}</span>
      </p>
      <p className={`mt-1 text-lg font-semibold ${diff >= 0 ? "text-sage" : "text-accent"}`}>{verdict}</p>

      <div className="relative mt-6 mb-8" aria-hidden>
        <div className="h-3 overflow-hidden rounded-full bg-paper-deep">
          <div className={`h-full rounded-full ${diff >= 0 ? "bg-sage" : "bg-accent"}`} style={{ width: pct(actual) }} />
        </div>
        <div className="absolute -top-1.5 h-6 w-0.5 bg-ink" style={{ left: pct(target) }} />
        <span className="absolute top-6 -translate-x-1/2 text-xs whitespace-nowrap text-ink-soft" style={{ left: pct(target) }}>
          target {target}
        </span>
      </div>
    </div>
  );
}
