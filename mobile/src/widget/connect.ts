import { Alert, Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { setUpWidget, type AppSession } from '../auth';
import { clearFeed, fetchFeed, saveFeedUrl } from '../feed';
import { WIDGET_NAME } from './CountdownWidget';
import { renderCountdownWidget } from './task-handler';

/** Re-render every hidl widget already on the home screen with what's saved now. */
export async function refreshWidgets() {
  if (Platform.OS !== 'android') return;
  await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => renderCountdownWidget() }).catch(() => {});
}

async function save(feedUrl: string) {
  const feed = await fetchFeed(feedUrl).catch(() => null);
  if (feed) await saveFeedUrl(feedUrl, feed);
  await refreshWidgets();
}

/**
 * Right after sign-in: give the home-screen widget this account's countdown feed, so nobody has
 * to copy links. Runs in the background; a failure only means the widget asks to reconnect.
 */
export async function connectWidget(session: AppSession) {
  if (Platform.OS !== 'android') return;
  try {
    const first = await setUpWidget(session);
    if (first.status === 'created') return save(first.feedUrl);

    // A widget link already exists (e.g. a KWGT widget). Replacing it would stop that one, so ask.
    Alert.alert(
      'Show your countdown on this phone?',
      'Your account already has a widget link, maybe in a widget app like KWGT. Using this phone’s hidl widget instead will stop that one updating.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Use this phone',
          onPress: async () => {
            const again = await setUpWidget(session, true).catch(() => null);
            if (again?.status === 'created') await save(again.feedUrl);
          },
        },
      ],
    );
  } catch {
    // Offline or the site is down: the widget shows "Tap to connect" and the next sign-in retries.
  }
}

/** Signing out also unhooks the widget, so a countdown never shows on a signed-out phone. */
export async function disconnectWidget() {
  await clearFeed();
  await refreshWidgets();
}
