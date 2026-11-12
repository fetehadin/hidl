import type { WidgetInfo, WidgetRepresentation, WidgetTaskHandlerProps } from 'react-native-android-widget';
import { FeedError, cacheFeed, feedItems, fetchFeed, getCachedFeed, getFeedUrl, type CachedFeed } from '../feed';
import { CountdownWidget, NEXT, PREV, SELECT, type WidgetItem, type WidgetProps } from './CountdownWidget';
import { orderCountdowns } from './mood';
import { forgetSettings, readSettings, type WidgetSettings } from './settings';

type Info = Pick<WidgetInfo, 'width' | 'height' | 'widgetId'>;
type Loaded =
  | { kind: 'ready'; cached: CachedFeed; stale: boolean }
  | { kind: 'empty'; connected: boolean }
  | { kind: 'error'; message: string };

/**
 * The countdowns to draw: fresh from the server, or the last good copy. Flipping and choosing
 * use the copy (instant, no network on every tap); the 30-minute refresh fetches.
 */
async function load(fromCache: boolean): Promise<Loaded> {
  const feedUrl = await getFeedUrl();
  if (!feedUrl) return { kind: 'empty', connected: false };
  if (fromCache) {
    const cached = await getCachedFeed();
    if (cached) return { kind: 'ready', cached, stale: false };
  }
  try {
    const feed = await fetchFeed(feedUrl);
    await cacheFeed(feed);
    return { kind: 'ready', cached: { feed, fetchedAt: Date.now() }, stale: false };
  } catch (e) {
    const offline = e instanceof FeedError && e.offline;
    const cached = offline ? await getCachedFeed() : null;
    // Offline, keep counting from the last copy (the time left is worked out on the phone); a
    // revoked link or a server error must not keep showing it.
    if (cached) return { kind: 'ready', cached, stale: true };
    return { kind: 'error', message: e instanceof FeedError ? e.message : "Couldn't load your countdowns" };
  }
}

/** This widget's countdowns: the ones it includes, soonest first, then the ones that passed. */
export function widgetItems(cached: CachedFeed, settings: WidgetSettings, now = Date.now()): WidgetItem[] {
  const all = feedItems(cached.feed).filter((i) => i.targetAt && !(i.id && settings.exclude.includes(i.id)));
  return orderCountdowns(all, now, cached.feed.timeZone);
}

/** Builds one widget (both looks when it follows the system theme). */
export async function renderCountdownWidget(
  info: Info,
  opts: { fromCache?: boolean; settings?: WidgetSettings } = {},
): Promise<WidgetRepresentation> {
  const settings = opts.settings ?? (await readSettings(info.widgetId));
  const loaded = await load(Boolean(opts.fromCache));
  const size = { width: info.width, height: info.height };
  const now = Date.now();
  const widgetId = info.widgetId;

  const build = (look: 'light' | 'dark'): React.JSX.Element => {
    let props: WidgetProps;
    if (loaded.kind === 'error') props = { state: 'error', message: loaded.message, size, look, widgetId };
    else if (loaded.kind === 'empty') props = { state: 'empty', connected: loaded.connected, size, look, widgetId };
    else {
      const items = widgetItems(loaded.cached, settings, now);
      const nonePicked = items.length === 0 && feedItems(loaded.cached.feed).some((i) => i.targetAt);
      props = items.length
        ? { state: 'ready', items, tz: loaded.cached.feed.timeZone, now, stale: loaded.stale, size, look, widgetId }
        : { state: 'empty', connected: true, nonePicked, size, look, widgetId };
    }
    return <CountdownWidget {...props} />;
  };

  if (settings.theme === 'system') return { light: build('light'), dark: build('dark') };
  return build(settings.theme);
}

/** Runs headless when Android adds, refreshes (every 30 min), resizes, taps or removes a widget. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const info = props.widgetInfo;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
      props.renderWidget(await renderCountdownWidget(info));
      break;
    case 'WIDGET_RESIZED':
      props.renderWidget(await renderCountdownWidget(info, { fromCache: true }));
      break;
    case 'WIDGET_CLICK':
      // The arrows and list rows of older versions: redraw, which brings the new scrolling stack.
      if (props.clickAction === NEXT || props.clickAction === PREV || props.clickAction === SELECT) {
        props.renderWidget(await renderCountdownWidget(info, { fromCache: true }));
      }
      break;
    case 'WIDGET_DELETED':
      await forgetSettings(info.widgetId);
      break;
  }
}
