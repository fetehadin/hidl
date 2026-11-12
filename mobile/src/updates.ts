import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { refreshWidgets } from './widget/connect';

/** How long after launch a reload still lands on the splash, before anyone is reading anything. */
const SPLASH_MS = 6000;
const WIDGET_CODE_KEY = 'hidl.widgetCode';

/**
 * Over-the-air updates, applied soon instead of "two app restarts later". By default expo-updates
 * downloads an update at launch and only runs it on the next cold start, and widgets keep their
 * old drawing until something redraws them, so a new widget design took days to show. Now:
 *  - an update found while the splash is still up is applied at once (a reload under the splash);
 *  - one found later is applied the next time the app goes to the background (unseen);
 *  - the first launch on new code redraws every widget with it.
 */
export function applyUpdatesSoon() {
  const launchedAt = Date.now();
  redrawWidgetsOnNewCode();
  if (!Updates.isEnabled || __DEV__) return;

  let pending = false;
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'background' && pending) Updates.reloadAsync().catch(() => {});
  });

  (async () => {
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return sub.remove();
      const fetched = await Updates.fetchUpdateAsync();
      if (!fetched.isNew) return sub.remove();
      if (Date.now() - launchedAt < SPLASH_MS) await Updates.reloadAsync();
      else pending = true;
    } catch {
      // Offline or the update server is down: the next launch tries again.
      sub.remove();
    }
  })();
}

/** Redraw the widgets once per new bundle, so a new widget design shows up right away. */
async function redrawWidgetsOnNewCode() {
  const code = Updates.updateId ?? 'embedded';
  try {
    if ((await AsyncStorage.getItem(WIDGET_CODE_KEY)) === code) return;
    await refreshWidgets();
    await AsyncStorage.setItem(WIDGET_CODE_KEY, code);
  } catch {}
}
