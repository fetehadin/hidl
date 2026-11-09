import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetInfo, WidgetTaskHandlerProps } from 'react-native-android-widget';
import { FeedError, cacheFeed, fetchFeed, getCachedFeed, getFeedUrl } from '../feed';
import { THEME_KEY, parseTheme } from '../theme';
import { CountdownWidget, NEXT, PREV } from './CountdownWidget';

// Which countdown each widget shows (‹ › flip it), per widget, so two widgets can show different ones.
const pageKey = (widgetId: number) => `hidl.widgetPage.${widgetId}`;

/**
 * Builds one widget from the saved link: fresh data if we can get it, else the last good copy.
 * Sized to that widget (a small one shows one big countdown, a tall one the scrolling list) and
 * colored in the theme the app last showed.
 */
export async function renderCountdownWidget(info: Pick<WidgetInfo, 'width' | 'height' | 'widgetId'>, fromCache = false) {
  const [theme, page] = await Promise.all([
    AsyncStorage.getItem(THEME_KEY).then(parseTheme, () => parseTheme(null)),
    AsyncStorage.getItem(pageKey(info.widgetId)).then((v) => Number(v) || 0, () => 0),
  ]);
  const size = { width: info.width, height: info.height };
  const feedUrl = await getFeedUrl();
  if (!feedUrl) return <CountdownWidget state="empty" theme={theme} size={size} />;

  // Flipping with ‹ › redraws from the saved copy: instant, and no network on every tap.
  if (fromCache) {
    const cached = await getCachedFeed();
    if (cached) return <CountdownWidget state="ready" cached={cached} theme={theme} size={size} page={page} />;
  }

  try {
    const feed = await fetchFeed(feedUrl);
    await cacheFeed(feed);
    return <CountdownWidget state="ready" cached={{ feed, fetchedAt: Date.now() }} theme={theme} size={size} page={page} />;
  } catch (e) {
    const offline = e instanceof FeedError && e.offline;
    const cached = offline ? await getCachedFeed() : null;
    // Offline, keep counting from the last good copy (the time left is worked out on the phone);
    // a revoked link or a server error must not keep showing it.
    if (cached) return <CountdownWidget state="ready" cached={cached} stale="Offline · still counting" theme={theme} size={size} page={page} />;
    return (
      <CountdownWidget
        state="error"
        message={e instanceof FeedError ? e.message : "Couldn't load your countdowns"}
        theme={theme}
        size={size}
      />
    );
  }
}

/** Runs headless when Android adds, refreshes (every 30 min), resizes or removes the widget. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(await renderCountdownWidget(props.widgetInfo));
      break;
    case 'WIDGET_CLICK':
      if (props.clickAction === NEXT || props.clickAction === PREV) {
        const key = pageKey(props.widgetInfo.widgetId);
        const current = Number(await AsyncStorage.getItem(key).catch(() => null)) || 0;
        // Wrapped to the real number of countdowns when drawn, so this can count freely.
        await AsyncStorage.setItem(key, String(current + (props.clickAction === NEXT ? 1 : -1))).catch(() => {});
        props.renderWidget(await renderCountdownWidget(props.widgetInfo, true));
      }
      break;
    case 'WIDGET_DELETED':
      await AsyncStorage.removeItem(pageKey(props.widgetInfo.widgetId)).catch(() => {});
      break;
  }
}
