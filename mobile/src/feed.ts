import AsyncStorage from '@react-native-async-storage/async-storage';

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
  if (res.status === 404) throw new FeedError(body?.error === 'invalid token' ? 'Open hidl to reconnect.' : 'Add a countdown in hidl.');
  if (!res.ok || !body || body.error) throw new FeedError("Couldn't load the countdown.");
  return body;
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

/** "7mo 13d", in the countdown's own units, the same split the website shows. */
export function remainingText(feed: CountdownFeed) {
  if (feed.done) return 'Done!';
  const parts = UNIT_ORDER.filter((u) => feed.remaining[u] !== undefined).map((u) => `${feed.remaining[u]}${UNIT_SHORT[u]}`);
  return parts.length > 0 ? parts.join(' ') : `${feed.daysLeft}d`;
}

export function updatedText(fetchedAt: number, now = Date.now()) {
  const minutes = Math.round((now - fetchedAt) / 60_000);
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours} h ago`;
  return `Updated ${Math.round(hours / 24)} d ago`;
}
