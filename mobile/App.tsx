import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { WidgetPreview, requestPinWidget, requestWidgetUpdate } from 'react-native-android-widget';
import {
  FeedError,
  clearFeed,
  fetchFeed,
  getCachedFeed,
  getFeedUrl,
  parseFeedUrl,
  saveFeedUrl,
  type CachedFeed,
} from './src/feed';
import { colors } from './src/theme';
import { CountdownWidget, WIDGET_NAME } from './src/widget/CountdownWidget';
import { renderCountdownWidget } from './src/widget/task-handler';

/** Re-render every hidl widget already on the home screen with the current saved link. */
async function refreshWidgets() {
  if (Platform.OS !== 'android') return;
  await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => renderCountdownWidget() });
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<CachedFeed | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (await getFeedUrl()) setConnected(await getCachedFeed());
      setLoading(false);
    })();
  }, []);

  async function connect(raw: string) {
    setError(null);
    setNote(null);
    const feedUrl = parseFeedUrl(raw);
    if (!feedUrl) {
      setError("That isn't a hidl widget link. On the website, open Countdown, tap Widget on a countdown, and copy its link.");
      return;
    }
    setBusy(true);
    try {
      const feed = await fetchFeed(feedUrl);
      await saveFeedUrl(feedUrl, feed);
      setConnected({ feed, fetchedAt: Date.now() });
      setInput('');
      await refreshWidgets();
    } catch (e) {
      setError(e instanceof FeedError ? e.message : "Couldn't load the countdown.");
    } finally {
      setBusy(false);
    }
  }

  async function pasteAndConnect() {
    const text = await Clipboard.getStringAsync();
    setInput(text);
    if (text) await connect(text);
  }

  async function disconnect() {
    await clearFeed();
    setConnected(null);
    setNote(null);
    await refreshWidgets();
  }

  async function addToHomeScreen() {
    const accepted = await requestPinWidget({ widgetName: WIDGET_NAME }).catch(() => false);
    setNote(accepted ? 'Confirm on the next screen to place it.' : 'Long-press your home screen, tap Widgets, and find hidl.');
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.teal} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <StatusBar style="dark" />
      <Text style={styles.brand}>hidl</Text>
      <Text style={styles.heading}>Countdown widget</Text>

      {connected ? (
        <View style={styles.card}>
          {Platform.OS === 'android' && (
            <View style={styles.preview}>
              <WidgetPreview width={300} height={150} renderWidget={() => <CountdownWidget state="ready" cached={connected} />} />
            </View>
          )}
          <Pressable style={styles.button} onPress={addToHomeScreen}>
            <Text style={styles.buttonText}>Add to home screen</Text>
          </Pressable>
          {note && <Text style={styles.note}>{note}</Text>}
          <Pressable style={styles.linkButton} onPress={disconnect}>
            <Text style={styles.linkText}>Use a different countdown</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.body}>
            On the hidl website, open <Text style={styles.bold}>Countdown</Text>, tap <Text style={styles.bold}>Widget</Text> on
            the countdown you want, and copy its link. Then come back here.
          </Text>
          <Pressable style={[styles.button, busy && styles.disabled]} onPress={pasteAndConnect} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? 'Connecting…' : 'Paste link'}</Text>
          </Pressable>
          <Text style={styles.or}>or type it</Text>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="https://…/api/widget/countdown?token=…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onSubmitEditing={() => connect(input)}
          />
          <Pressable style={[styles.secondary, busy && styles.disabled]} onPress={() => connect(input)} disabled={busy}>
            <Text style={styles.secondaryText}>Connect</Text>
          </Pressable>
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      )}

      <Text style={styles.footnote}>
        The widget refreshes about every 30 minutes (Android sets the pace). The link only shows this one countdown, never
        your letters or photos. Revoke it on the website any time.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.mint },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 64, gap: 16 },
  brand: { fontSize: 16, fontWeight: '800', color: colors.teal },
  heading: { fontSize: 28, fontWeight: '800', color: colors.ocean },
  card: { backgroundColor: colors.white, borderColor: colors.aqua, borderWidth: 2, borderRadius: 24, padding: 18, gap: 12 },
  preview: { alignItems: 'center' },
  body: { fontSize: 16, lineHeight: 23, color: colors.ink },
  bold: { fontWeight: '700' },
  button: { backgroundColor: colors.teal, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: colors.white, fontSize: 18, fontWeight: '800' },
  secondary: { borderColor: colors.teal, borderWidth: 2, borderRadius: 16, paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: colors.ocean, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  or: { textAlign: 'center', color: colors.muted },
  input: { borderColor: colors.aqua, borderWidth: 2, borderRadius: 14, padding: 12, fontSize: 15, color: colors.ink },
  error: { color: colors.danger, fontSize: 15 },
  note: { color: colors.ocean, fontSize: 15, textAlign: 'center' },
  linkButton: { alignItems: 'center', paddingVertical: 6 },
  linkText: { color: colors.ocean, fontSize: 15, textDecorationLine: 'underline' },
  footnote: { fontSize: 13, lineHeight: 19, color: colors.muted },
});
