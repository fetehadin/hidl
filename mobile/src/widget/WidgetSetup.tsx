import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { WidgetPreview, type WidgetConfigurationScreenProps } from 'react-native-android-widget';
import { cacheFeed, feedItems, fetchFeed, getCachedFeed, getFeedUrl, type FeedItem } from '../feed';
import { palettes } from '../theme';
import { CountdownWidget } from './CountdownWidget';
import { hidiHeight, hidiSvg, kindSvg } from './hidi';
import { describe, orderCountdowns } from './mood';
import { readSettings, writeSettings, type WidgetSettings, type WidgetTheme } from './settings';
import { renderCountdownWidget } from './task-handler';

const c = palettes.teal;

const THEMES: { value: WidgetTheme; label: string }[] = [
  { value: 'system', label: 'Follow phone' },
  { value: 'light', label: 'Teal' },
  { value: 'dark', label: 'Dark' },
];

type Loaded = { state: 'loading' } | { state: 'ready'; items: FeedItem[]; tz?: string } | { state: 'none'; connected: boolean };

/**
 * One widget's settings: which countdowns it stacks (switch any off to take it off the widget,
 * on to bring it back) and its look, with a live preview. Opens
 * when a widget is added, from the launcher's "widget settings", and from the sliders button on
 * the widget itself (App.tsx). Choices are kept per widget on the phone.
 */
export function WidgetSetup({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
  const [settings, setSettings] = useState<WidgetSettings | null>(null);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [saving, setSaving] = useState(false);
  const scheme = useColorScheme();
  const screen = useWindowDimensions();

  useEffect(() => {
    readSettings(widgetInfo.widgetId).then(setSettings);
    (async () => {
      const feedUrl = await getFeedUrl();
      if (!feedUrl) return setLoaded({ state: 'none', connected: false });
      // Fresh if we can, else the last copy, so the list shows offline too.
      let cached = await getCachedFeed();
      try {
        const feed = await fetchFeed(feedUrl);
        await cacheFeed(feed);
        cached = { feed, fetchedAt: Date.now() };
      } catch {}
      const items = cached ? feedItems(cached.feed).filter((i) => i.id && i.targetAt) : [];
      setLoaded(items.length ? { state: 'ready', items: orderCountdowns(items, Date.now(), cached?.feed.timeZone), tz: cached?.feed.timeZone } : { state: 'none', connected: true });
    })();
  }, [widgetInfo.widgetId]);

  function toggle(id: string) {
    if (!settings) return;
    const exclude = settings.exclude.includes(id) ? settings.exclude.filter((x) => x !== id) : [...settings.exclude, id];
    setSettings({ ...settings, exclude });
  }

  function pickAll(on: boolean) {
    if (!settings || loaded.state !== 'ready') return;
    setSettings({ ...settings, exclude: on ? [] : loaded.items.map((i) => i.id!) });
  }

  async function save() {
    if (!settings || saving) return;
    setSaving(true);
    await writeSettings(widgetInfo.widgetId, settings);
    try {
      renderWidget(await renderCountdownWidget(widgetInfo, { fromCache: true, settings }));
    } catch {}
    setResult('ok');
  }

  const now = Date.now();
  const included = loaded.state === 'ready' && settings ? loaded.items.filter((i) => !settings.exclude.includes(i.id!)) : [];

  // The preview at the widget's real size, shrunk to fit narrow screens.
  const width = Math.min(widgetInfo.width || 320, screen.width - 40);
  const height = Math.min(widgetInfo.height || 180, 420);
  const look = settings?.theme === 'dark' || (settings?.theme !== 'light' && scheme === 'dark') ? 'dark' : 'light';
  const preview = useCallback(
    () =>
      loaded.state === 'ready' && included.length ? (
        <CountdownWidget state="ready" items={included} tz={loaded.tz} now={now} size={{ width, height }} look={look} widgetId={widgetInfo.widgetId} />
      ) : (
        <CountdownWidget
          state="empty"
          connected={loaded.state !== 'none' || loaded.connected}
          nonePicked={loaded.state === 'ready'}
          size={{ width, height }}
          look={look}
        />
      ),
    // `now` and `included` follow `loaded` and `settings`; listing them would redraw every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, settings, width, height, look, widgetInfo.widgetId],
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <SvgXml xml={hidiSvg('excited')} width={56} height={hidiHeight(56)} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.title}>Your widget</Text>
            <Text style={styles.subtitle}>The one that matters most comes up top. Tap it to flip.</Text>
          </View>
        </View>

        {settings && loaded.state !== 'loading' && (
          <View style={styles.preview}>
            <WidgetPreview renderWidget={preview} width={width} height={height} />
          </View>
        )}

        <View style={styles.labelRow}>
          <Text style={styles.label}>ON THIS WIDGET</Text>
          {loaded.state === 'ready' && settings && (
            <View style={styles.quick}>
              <Pressable onPress={() => pickAll(true)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.quickText}>All</Text>
              </Pressable>
              <Text style={styles.quickDot}>·</Text>
              <Pressable onPress={() => pickAll(false)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.quickText}>None</Text>
              </Pressable>
            </View>
          )}
        </View>
        <View style={styles.card}>
          {loaded.state === 'loading' && <Text style={styles.note}>Loading your countdowns…</Text>}
          {loaded.state === 'none' && (
            <Text style={styles.note}>
              {loaded.connected
                ? 'No countdowns yet. Add one in Hidl and it shows up here by itself.'
                : 'Open Hidl and sign in once, and your countdowns show up here by itself.'}
            </Text>
          )}
          {loaded.state === 'ready' &&
            settings &&
            loaded.items.map((item, i) => {
              const on = !settings.exclude.includes(item.id!);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => toggle(item.id!)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={item.title}
                  style={[styles.row, i > 0 && styles.rowLine]}
                >
                  <SvgXml xml={kindSvg(item.kind)} width={30} height={30} style={{ opacity: on ? 1 : 0.45 }} />
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, !on && styles.off]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.rowLeft}>{describe({ ...item, units: item.units ?? [] }, now, loaded.tz).short}</Text>
                  </View>
                  <View style={[styles.switch, on && styles.switchOn]}>
                    <View style={[styles.knob, on && styles.knobOn]} />
                  </View>
                </Pressable>
              );
            })}
        </View>
        {loaded.state === 'ready' && (
          <Text style={styles.hint}>New countdowns join the widget by themselves. Switch one off to take it off.</Text>
        )}

        <Text style={styles.label}>LOOK</Text>
        <View style={styles.segments}>
          {THEMES.map((t) => {
            const on = settings?.theme === t.value;
            return (
              <Pressable
                key={t.value}
                onPress={() => settings && setSettings({ ...settings, theme: t.value })}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[styles.segment, on && styles.segmentOn]}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={() => setResult('cancel')} style={[styles.button, styles.ghost]}>
          <Text style={styles.ghostText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={save} disabled={!settings || saving} style={[styles.button, styles.primary, (!settings || saving) && { opacity: 0.6 }]}>
          <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Done'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.paper },
  content: { padding: 20, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  title: { fontSize: 26, fontWeight: '800', color: c.heading },
  subtitle: { fontSize: 15, color: c.muted, marginTop: 2 },
  preview: { alignItems: 'center', paddingVertical: 18, borderRadius: 24, backgroundColor: c.soft },
  labelRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: c.muted, marginTop: 22, marginBottom: 8 },
  quick: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  quickText: { fontSize: 15, fontWeight: '800', color: c.heading, paddingHorizontal: 4 },
  quickDot: { color: c.muted, marginHorizontal: 4 },
  card: { backgroundColor: c.card, borderRadius: 18, borderWidth: 1, borderColor: c.line, borderBottomWidth: 4, paddingHorizontal: 14 },
  note: { fontSize: 15, color: c.muted, paddingVertical: 16 },
  hint: { fontSize: 13, color: c.muted, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 62 },
  rowLine: { borderTopWidth: 1, borderTopColor: c.line },
  rowText: { flex: 1, marginLeft: 12 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: c.ink },
  off: { color: c.muted },
  rowLeft: { fontSize: 13, color: c.muted, fontVariant: ['tabular-nums'], marginTop: 1 },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: c.lineStrong, padding: 3, marginLeft: 10 },
  switchOn: { backgroundColor: c.button },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#ffffff' },
  knobOn: { transform: [{ translateX: 20 }] },
  segments: { flexDirection: 'row', backgroundColor: c.soft, borderRadius: 16, padding: 4 },
  segment: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: c.card, borderBottomWidth: 3, borderBottomColor: c.lineStrong },
  segmentText: { fontSize: 15, fontWeight: '700', color: c.muted },
  segmentTextOn: { color: c.heading },
  footer: { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 28, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.paper },
  button: { flex: 1, minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ghost: { backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderBottomWidth: 4 },
  ghostText: { fontSize: 16, fontWeight: '700', color: c.ink },
  primary: { backgroundColor: c.button, borderBottomWidth: 4, borderBottomColor: c.heading },
  primaryText: { fontSize: 16, fontWeight: '800', color: c.buttonInk },
});
