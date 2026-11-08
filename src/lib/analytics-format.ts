/** Pure helpers for the admin Analytics tab (PostHog query results → what the page draws). */

export type QueryResult = { columns: string[]; results: unknown[][] };

/** Last `days` calendar days ending on `today` ("YYYY-MM-DD"), with a count for each (0 when missing). */
export function fillDays(rows: unknown[][], today: string, days = 30) {
  const counts = new Map(rows.map((r) => [String(r[0]).slice(0, 10), Number(r[1]) || 0]));
  const end = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - (days - 1 - i));
    const day = d.toISOString().slice(0, 10);
    return { day, count: counts.get(day) ?? 0 };
  });
}

/** Label/count rows with each one's share of the total, biggest first; blank labels become `unknown`. */
export function shares(rows: unknown[][], unknown = "Unknown") {
  const merged = new Map<string, number>();
  for (const [label, n] of rows) {
    const key = typeof label === "string" && label.trim() ? label : unknown;
    merged.set(key, (merged.get(key) ?? 0) + (Number(n) || 0));
  }
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  return [...merged]
    .map(([label, count]) => ({ label, count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);
}
