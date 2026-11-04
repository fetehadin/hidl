import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { handoffUrl, isSignedIn, setSignedIn, type AppSession } from './src/auth';
import { SITE_URL } from './src/config';
import { SignInScreen } from './src/screens/SignInScreen';
import { WebShell } from './src/screens/WebShell';
import { colors } from './src/theme';
import { connectWidget, disconnectWidget } from './src/widget/connect';

type State = { name: 'loading' } | { name: 'signed-out' } | { name: 'journal'; startUrl: string };

export default function App() {
  const [state, setState] = useState<State>({ name: 'loading' });

  useEffect(() => {
    isSignedIn().then((yes) => setState(yes ? { name: 'journal', startUrl: `${SITE_URL}/` } : { name: 'signed-out' }));
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
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
});
