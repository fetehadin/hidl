import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { FeedError, cacheFeed, fetchFeed, getCachedFeed, getFeedUrl } from '../feed';
import { CountdownWidget } from './CountdownWidget';

/** Builds the widget from the saved link: fresh data if we can get it, else the last good copy. */
export async function renderCountdownWidget() {
  const feedUrl = await getFeedUrl();
  if (!feedUrl) return <CountdownWidget state="empty" />;

  try {
    const feed = await fetchFeed(feedUrl);
    await cacheFeed(feed);
    return <CountdownWidget state="ready" cached={{ feed, fetchedAt: Date.now() }} />;
  } catch (e) {
    const offline = e instanceof FeedError && e.offline;
    const cached = offline ? await getCachedFeed() : null;
    // Offline, keep counting from the last good copy (the time left is worked out on the phone); a revoked link or a server error must not keep showing it.
    if (cached) return <CountdownWidget state="ready" cached={cached} stale="Offline · counting on this phone" />;
    return <CountdownWidget state="error" message={e instanceof FeedError ? e.message : "Couldn't load the countdown."} />;
  }
}

/** Runs headless when Android adds, refreshes (every 30 min), resizes or removes the widget. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(await renderCountdownWidget());
      break;
    case 'WIDGET_DELETED':
    case 'WIDGET_CLICK':
      break;
  }
}
