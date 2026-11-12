import { timeLeft, type Unit } from '../countdown-units';

/**
 * What the widget says about one countdown: Hidi's mood, the big number and its unit chips,
 * one short line for the speech bubble, and how far along it is. Pure (no React Native), so the
 * web app's tests cover it (tests/unit/widget-mood.test.ts).
 *
 *   calm     a week or more to go
 *   excited  under 7 days
 *   nervous  under 24 hours (and not today)
 *   party    the day itself
 *   sleepy   a day or more after it passed: counts up ("+2 days ago")
 */
export type Mood = 'calm' | 'excited' | 'nervous' | 'party' | 'sleepy';

export type WidgetCountdown = {
  id?: string;
  kind: string;
  title: string;
  targetAt: string;
  createdAt?: string;
  units: Unit[];
};

export type Shown = {
  mood: Mood;
  /** "5", "21", "+2", or a word on the day itself ("Today!", "It's here!"). */
  big: string;
  /** True when `big` is a word rather than a number (drawn smaller). */
  bigIsWord: boolean;
  /** Unit chips after the number: ["days", "21h"], ["hours"], ["days ago"]. */
  chips: string[];
  /** Short, for the list rows and the small widget: "5d 21h", "21h", "Today", "+2d ago". */
  short: string;
  line: string;
  /** 0–1 from when it was made to the day itself; null when we don't know when it was made. */
  progress: number | null;
};

const DAY = 86_400_000;
const WORD: Record<Unit, [string, string]> = {
  years: ['year', 'years'],
  months: ['month', 'months'],
  days: ['day', 'days'],
  hours: ['hour', 'hours'],
};
const SHORT: Record<Unit, string> = { years: 'y', months: 'mo', days: 'd', hours: 'h' };

const LINES: Record<Mood, string[]> = {
  calm: ['Plenty of time. Breathe.', 'Slow and steady wins!', 'Future you says hi!', 'One day at a time.', "We've got this."],
  excited: ['So close I can taste it!', 'Days, not weeks now!', 'Countdown mode: ON!', 'Ooh, it’s getting real!', 'Almost there!'],
  nervous: ['Eek, so close!', 'Deep breath. You’re ready.', 'Hours left. You’ve got this!', 'Butterflies? Totally normal.'],
  party: ['It’s here! Enjoy it!', 'Today’s the day!', 'Woohoo! Make it count!', 'The big day is now!'],
  sleepy: ['That was a good one.', 'Still smiling about it.', 'Remember this one?', 'Time for a new countdown?'],
};
const EXAM_NERVOUS = ['You studied. Trust it!', 'Deep breath. You’re ready.', 'Sleep well tonight!'];

/** "YYYY-MM-DD" of `t` in `tz`, or the phone's own day if this phone can't do that zone. */
function dayOf(t: number, tz?: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
  } catch {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

/** Calendar days from today to the target's day, in the owner's zone (0 = today, -2 = two days ago). */
export function daysFromToday(targetAt: string, now: number, tz?: string) {
  return Math.round((Date.parse(`${dayOf(Date.parse(targetAt), tz)}T00:00:00Z`) - Date.parse(`${dayOf(now, tz)}T00:00:00Z`)) / DAY);
}

/** A line that stays the same all day for one countdown, and changes the next day. */
function pick(lines: string[], seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return lines[Math.abs(h) % lines.length];
}

const plural = (unit: Unit, n: number) => WORD[unit][n === 1 ? 0 : 1];

export function describe(item: WidgetCountdown, now: number, tz?: string): Shown {
  const target = Date.parse(item.targetAt);
  const ms = target - now;
  const days = daysFromToday(item.targetAt, now, tz);
  const seed = `${item.id ?? item.title}:${dayOf(now, tz)}`;
  const created = item.createdAt ? Date.parse(item.createdAt) : NaN;
  const progress =
    ms <= 0 ? 1 : Number.isFinite(created) && target > created ? Math.min(1, Math.max(0.03, (now - created) / (target - created))) : null;

  if (days === 0) {
    const hours = Math.ceil(ms / 3_600_000);
    return ms > 0
      ? { mood: 'party', big: 'Today!', bigIsWord: true, chips: [`in ${hours}h`], short: 'Today', line: pick(LINES.party, seed), progress }
      : { mood: 'party', big: 'It’s here!', bigIsWord: true, chips: [], short: 'Today', line: pick(LINES.party, seed), progress };
  }
  if (days < 0 || ms <= 0) {
    const ago = Math.max(1, -days);
    return {
      mood: 'sleepy',
      big: `+${ago}`,
      bigIsWord: false,
      chips: [`${plural('days', ago)} ago`],
      short: `+${ago}d ago`,
      line: pick(LINES.sleepy, seed),
      progress: 1,
    };
  }
  if (ms < DAY) {
    const hours = Math.max(1, Math.ceil(ms / 3_600_000));
    return {
      mood: 'nervous',
      big: String(hours),
      bigIsWord: false,
      chips: [plural('hours', hours)],
      short: `${hours}h`,
      line: pick(item.kind === 'exam' ? EXAM_NERVOUS : LINES.nervous, seed),
      progress,
    };
  }

  const mood: Mood = ms < 7 * DAY ? 'excited' : 'calm';
  let parts: { unit: Unit; value: number }[] = [];
  try {
    parts = timeLeft(item.targetAt, now, item.units.length ? item.units : ['days'], tz ?? 'Africa/Addis_Ababa');
  } catch {
    // An unknown zone on an old phone: plain days below.
  }
  if (!parts.length || parts[0].value === 0) parts = [{ unit: 'days', value: Math.max(1, Math.floor(ms / DAY)) }];
  const [lead, ...rest] = parts;
  return {
    mood,
    big: String(lead.value),
    bigIsWord: false,
    chips: [plural(lead.unit, lead.value), ...rest.filter((p) => p.value > 0).map((p) => `${p.value}${SHORT[p.unit]}`)],
    short: parts.filter((p, i) => i === 0 || p.value > 0).map((p) => `${p.value}${SHORT[p.unit]}`).join(' '),
    line: pick(LINES[mood], seed),
    progress,
  };
}

/** Upcoming soonest first, then the ones that passed, most recent first. */
export function orderCountdowns<T extends WidgetCountdown>(items: T[], now: number, tz?: string): T[] {
  const t = (i: T) => Date.parse(i.targetAt);
  const ahead = items.filter((i) => t(i) > now || daysFromToday(i.targetAt, now, tz) === 0).sort((a, b) => t(a) - t(b));
  const behind = items.filter((i) => !ahead.includes(i)).sort((a, b) => t(b) - t(a));
  return [...ahead, ...behind];
}

/** How long a countdown flipped to on an older APK (which flips by redrawing) stays on top. */
export const PICK_MS = 3 * 3_600_000;

/**
 * The stack's order: soonest first (today's and the next one on top), then the ones that passed.
 * On APKs without the native flip, a tap redraws with the card after it on top, and that pick holds
 * for PICK_MS. The rest follow round from it, so flipping goes on in order. `positions` is each
 * item's place in the soonest-first order, for the dots.
 */
export function smartOrder<T extends WidgetCountdown>(
  items: T[],
  now: number,
  tz?: string,
  picked?: { id: string | null; at?: number } | null,
): { items: T[]; positions: number[] } {
  const ordered = orderCountdowns(items, now, tz);
  const recent = picked?.id && picked.at !== undefined && now - picked.at < PICK_MS;
  const top = recent ? Math.max(0, ordered.findIndex((i) => i.id === picked.id)) : 0;
  const positions = ordered.map((_, i) => (top + i) % ordered.length);
  return { items: positions.map((p) => ordered[p]), positions };
}
