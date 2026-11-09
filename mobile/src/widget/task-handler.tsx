import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetInfo, WidgetTaskHandlerProps } from 'react-native-android-widget';
import { FeedError, cacheFeed, fetchFeed, getCachedFeed, getFeedUrl } from '../feed';
import { THEME_KEY, parseTheme } from '../theme';
import { CountdownWidget } from './CountdownWidget';

/**
 * Builds one widget from the saved link: fresh data if we can get it, else the last good copy.
 * Sized to that widget (a small one shows one big countdown, a tall one the scrolling list) and
 * colored in the theme the app last showed.
 */
export async function renderCountdownWidget(info: Pick<WidgetInfo, 'width' | 'height'>) {
  const theme = parseTheme(await AsyncStorage.getItem(THEME_KEY).catch(() => null));
  const size = { width: info.width, height: info.height };
  const feedUrl = await getFeedUrl();
  if (!feedUrl) return <CountdownWidget state="empty" theme={theme} size={size} />;

  try {
    const feed = await fetchFeed(feedUrl);
    await cacheFeed(feed);
    return <CountdownWidget state="ready" cached={{ feed, fetchedAt: Date.now() }} theme={theme} size={size} />;
  } catch (e) {
    const offline = e instanceof FeedError && e.offline;
    const cached = offline ? await getCachedFeed() : null;
    // Offline, keep counting from the last good copy (the time left is worked out on the phone);
    // a revoked link or a server error must not keep showing it.
    if (cached) return <CountdownWidget state="ready" cached={cached} stale="Offline · still counting" theme={theme} size={size} />;
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
    case 'WIDGET_DELETED':
    case 'WIDGET_CLICK':
      break;
  }
}
