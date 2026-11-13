/**
 * Photo groups: albums each person makes and orders themselves. The name rules are mirrored by
 * `photo_group_name_ok()` and the 50-group limit by `photo_groups_before_insert()` in Postgres
 * (supabase/migrations/20261110000005_photo_groups.sql): change both together. Pure, so the
 * browser can use it too.
 */
export type PhotoGroup = { id: string; name: string };

export const PHOTO_GROUP_NAME_MAX = 30;
export const MAX_PHOTO_GROUPS = 50;

/** What a typed name is saved as: trimmed, inner runs of spaces made one. */
export function cleanGroupName(raw: string) {
  return raw.replace(/\s+/g, " ").trim();
}

/** Why a (cleaned) name can't be used, or null when it can. */
export function groupNameProblem(name: string, others: readonly PhotoGroup[] = [], selfId?: string): string | null {
  if (name.length === 0) return "Give the group a name.";
  if (name.length > PHOTO_GROUP_NAME_MAX) return `Keep it under ${PHOTO_GROUP_NAME_MAX + 1} characters.`;
  if (/[\u0000-\u001f\u007f]/.test(name)) return "That name has characters it can't use.";
  const lower = name.toLowerCase();
  if (others.some((g) => g.id !== selfId && g.name.toLowerCase() === lower)) return "You already have a group called that.";
  return null;
}

/** Moves one id up (-1) or down (+1) in an order. Out of range changes nothing. */
export function moveInOrder(ids: readonly string[], id: string, delta: -1 | 1) {
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return [...ids];
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Moves the item at `from` so it ends up at `to`; the rest keep their order. */
export function moveToIndex<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/**
 * Where a dragged row would land: the number of other rows whose middle is above the dragged
 * row's middle. `middles` are the rows' middles before the drag started, top to bottom.
 */
export function dropIndex(middles: readonly number[], from: number, middle: number) {
  let at = 0;
  middles.forEach((m, i) => {
    if (i !== from && m < middle) at++;
  });
  return at;
}
