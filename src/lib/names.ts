/**
 * The name to greet someone by on Today ("Good morning, Hana!"): the first word of their
 * display name (Account), else of the name their Google account gave, else none. Only the first
 * word, so "Hana Tesfaye" or a long handle still reads like a friendly hello.
 */
export function greetingName(displayName: string | null | undefined, accountName: unknown): string | null {
  for (const raw of [displayName, typeof accountName === "string" ? accountName : null]) {
    const first = raw?.trim().split(/\s+/)[0];
    if (first) return first.length > 24 ? `${first.slice(0, 23)}…` : first;
  }
  return null;
}
