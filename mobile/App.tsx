import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { handoffUrl, isSignedIn, setSignedIn, type AppSession } from './src/auth';
import { SITE_URL } from './src/config';
import { pathFromLink, widgetIdFromLink } from './src/deep-link';
import { SignInScreen } from './src/screens/SignInScreen';
import { WebShell } from './src/screens/WebShell';
import { colors } from './src/theme';
import { applyUpdatesSoon } from './src/updates';
import { connectWidget, disconnectWidget } from './src/widget/connect';
import { WidgetSettingsScreen } from './src/widget/WidgetSettingsScreen';

type State = { name: 'loading' } | { name: 'signed-out' } | { name: 'journal'; startUrl: string };

export default function App() {
  const [state, setState] = useState<State>({ name: 'loading' });
  // The widget settings opened from a widget's sliders button: the widget's id (null = the first).
  const [widgetSettings, setWidgetSettings] = useState<number | null | undefined>(undefined);
  const closeWidgetSettings = useCallback(() => setWidgetSettings(undefined), []);

  // New app code (and widget designs) as soon as it's out: see src/updates.ts.
  useEffect(() => applyUpdatesSoon(), []);

  useEffect(() => {
    // Opened from a widget tap: start on that page (the countdown tapped) instead of Today, or
    // with that widget's settings open over the countdowns.
    Promise.all([isSignedIn(), Linking.getInitialURL().catch(() => null)]).then(([yes, link]) => {
      const widgetId = widgetIdFromLink(link);
      const path = widgetId !== undefined ? '/countdown' : (pathFromLink(link) ?? '/');
      setState(yes ? { name: 'journal', startUrl: `${SITE_URL}${path}` } : { name: 'signed-out' });
      if (yes) setWidgetSettings(widgetId);
    });
    // The sliders button while the app is already open (WebShell handles countdown links).
    const sub = Linking.addEventListener('url', ({ url }) => {
      const widgetId = widgetIdFromLink(url);
      if (widgetId !== undefined) setWidgetSettings(widgetId);
    });
    return () => sub.remove();
  }, []);

  async function signedIn(session: AppSession) {
    await setSignedIn(true);
    // Widget first (it needs the session), then the session moves into the web view for good.
    connectWidget(session);
    setState({ name: 'journal', startUrl: handoffUrl(session) });
  }

  async function signedOut() {
    await setSignedIn(false);
    await disconnectWidget();
    setState({ name: 'signed-out' });
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {state.name === 'loading' && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      )}
      {state.name === 'signed-out' && <SignInScreen onSignedIn={signedIn} />}
      {state.name === 'journal' && <WebShell key={state.startUrl} startUrl={state.startUrl} onSignedOut={signedOut} />}
      {state.name === 'journal' && widgetSettings !== undefined && (
        <WidgetSettingsScreen widgetId={widgetSettings} onClose={closeWidgetSettings} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
});
