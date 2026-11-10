import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { setUpWidget, type AppSession } from '../auth';
import { clearFeed, fetchFeed, saveFeedUrl } from '../feed';
import { WIDGET_NAMES } from './CountdownWidget';
import { renderCountdownWidget } from './task-handler';

/** Re-render every hidl widget already on the home screen with what's saved now. */
export async function refreshWidgets() {
  if (Platform.OS !== 'android') return;
  for (const widgetName of WIDGET_NAMES) {
    await requestWidgetUpdate({ widgetName, renderWidget: (info) => renderCountdownWidget(info) }).catch(() => {});
  }
}

async function save(feedUrl: string) {
  const feed = await fetchFeed(feedUrl).catch(() => null);
  if (feed) await saveFeedUrl(feedUrl, feed);
  await refreshWidgets();
}

/**
 * Right after sign-in: give the home-screen widget this account's countdown feed, so nobody has
 * to copy links or answer questions. This phone's widget becomes the account's widget (a link
 * made earlier, say for KWGT, stops updating). Runs in the background; a failure only means the
 * widget asks to reconnect and the next sign-in retries.
 */
export async function connectWidget(session: AppSession) {
  if (Platform.OS !== 'android') return;
  try {
    const result = await setUpWidget(session, true);
    if (result.status === 'created') await save(result.feedUrl);
  } catch {
    // Offline or the site is down.
  }
}

/** Signing out also unhooks the widget, so a countdown never shows on a signed-out phone. */
export async function disconnectWidget() {
  await clearFeed();
  await refreshWidgets();
}
