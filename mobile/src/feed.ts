import AsyncStorage from '@react-native-async-storage/async-storage';
import { timeLeft } from './countdown-units';

/** What GET /api/widget/countdown returns (src/app/api/widget/countdown/route.ts in the web app). */
export type CountdownFeed = {
  kind: string;
  title: string;
  targetAt: string;
  targetScore: number | null;
  maxScore: number | null;
  actualScore: number | null;
  done: boolean;
  daysLeft: number;
  units: Unit[];
  remaining: Partial<Record<Unit, number>>;
  /** The owner's IANA time zone the numbers were computed in (added with per-user time zones). */
  timeZone?: string;
  /** Every countdown still to come (and ones that ended in the last week), soonest first (the account's feed only). */
  countdowns?: FeedItem[];
};

/** One countdown as the widget shows it. */
export type FeedItem = {
  id?: string;
  kind: string;
  title: string;
  targetAt: string;
  targetScore: number | null;
  maxScore: number | null;
  actualScore: number | null;
  /** Kept for old app versions; the widget ignores it (no starring any more). */
  starred?: boolean;
  /** When it was made: the start of the widget's progress bar (added with the chunky widget). */
  createdAt?: string;
  done: boolean;
  units: Unit[];
  remaining?: Partial<Record<Unit, number>>;
};

export type Unit = 'years' | 'months' | 'days' | 'hours';

/** The last good answer, so the widget still shows something offline. */
export type CachedFeed = { feed: CountdownFeed; fetchedAt: number };

const FEED_URL_KEY = 'hidl.feedUrl';
const CACHE_KEY = 'hidl.feedCache';

const UNIT_SHORT: Record<Unit, string> = { years: 'y', months: 'mo', days: 'd', hours: 'h' };
const UNIT_ORDER: Unit[] = ['years', 'months', 'days', 'hours'];

export class FeedError extends Error {
  /** True when the phone couldn't reach the server at all (as opposed to the server saying no). */
  constructor(message: string, readonly offline = false) {
    super(message);
  }
}

export async function fetchFeed(feedUrl: string): Promise<CountdownFeed> {
  let res: Response;
  try {
    res = await fetch(feedUrl, { headers: { Accept: 'application/json' } });
  } catch {
    throw new FeedError('No connection.', true);
  }
  const body = (await res.json().catch(() => null)) as (CountdownFeed & { error?: string }) | null;
  // No countdown to come: the account's feed still answers with its (empty or just-ended) list,
  // which the widget shows as such rather than as an error.
  if (res.status === 404 && body && body.error !== 'invalid token' && Array.isArray(body.countdowns)) {
    return { ...EMPTY, timeZone: body.timeZone, countdowns: body.countdowns };
  }
  if (res.status === 404) throw new FeedError(body?.error === 'invalid token' ? 'Open hidl to reconnect.' : 'Add a countdown in hidl.');
  if (!res.ok || !body || body.error) throw new FeedError("Couldn't load the countdown.");
  return body;
}

const EMPTY: CountdownFeed = {
  kind: 'other', title: '', targetAt: '', targetScore: null, maxScore: null, actualScore: null,
  done: true, daysLeft: 0, units: [], remaining: {},
};

/** The countdowns to show: the list when the feed has one, else the feed's single countdown. */
export function feedItems(feed: CountdownFeed): FeedItem[] {
  if (Array.isArray(feed.countdowns)) return feed.countdowns;
  return feed.title ? [feed] : [];
}

export async function getFeedUrl() {
  return AsyncStorage.getItem(FEED_URL_KEY);
}

export async function saveFeedUrl(feedUrl: string, feed: CountdownFeed) {
  await AsyncStorage.multiSet([
    [FEED_URL_KEY, feedUrl],
    [CACHE_KEY, JSON.stringify({ feed, fetchedAt: Date.now() } satisfies CachedFeed)],
  ]);
}

export async function clearFeed() {
  await AsyncStorage.multiRemove([FEED_URL_KEY, CACHE_KEY]);
}

export async function getCachedFeed(): Promise<CachedFeed | null> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedFeed;
  } catch {
    return null;
  }
}

export async function cacheFeed(feed: CountdownFeed) {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ feed, fetchedAt: Date.now() } satisfies CachedFeed));
}

// Older feeds have no timeZone; the website's default zone then, as before per-user zones.
const DEFAULT_TZ = 'Africa/Addis_Ababa';

/** Whether the countdown has arrived, judged by the phone's clock (not when the feed was fetched). */
export function isDone(item: FeedItem, now = Date.now()) {
  return item.done || new Date(item.targetAt).getTime() <= now;
}

export type Part = { value: number; unit: Unit };

/**
 * The time left in the countdown's own units, the same split the website shows. Worked out from
 * targetAt at `now`, so it stays right between refreshes and offline; the server's `remaining` is
 * only a fallback for an item without a usable targetAt.
 */
export function remainingParts(item: FeedItem, timeZone: string | undefined, now = Date.now()): Part[] {
  if (isDone(item, now)) return [];
  if (!Number.isNaN(new Date(item.targetAt).getTime())) {
    try {
      return timeLeft(item.targetAt, now, item.units, timeZone ?? DEFAULT_TZ);
    } catch {
      // An unknown time zone on an old phone: fall through to the server's numbers.
    }
  }
  return UNIT_ORDER.filter((u) => item.remaining?.[u] !== undefined).map((u) => ({ unit: u, value: item.remaining![u]! }));
}

/** "7mo 13d". */
export function remainingText(item: FeedItem, timeZone: string | undefined, now = Date.now()) {
  if (isDone(item, now)) return 'Done!';
  const parts = remainingParts(item, timeZone, now);
  return parts.length > 0 ? parts.map((p) => `${p.value}${UNIT_SHORT[p.unit]}`).join(' ') : 'Soon';
}

export const UNIT_WORD: Record<Unit, [string, string]> = {
  years: ['year', 'years'],
  months: ['month', 'months'],
  days: ['day', 'days'],
  hours: ['hour', 'hours'],
};

export function updatedText(fetchedAt: number, now = Date.now()) {
  const minutes = Math.round((now - fetchedAt) / 60_000);
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours} h ago`;
  return `Updated ${Math.round(hours / 24)} d ago`;
}
