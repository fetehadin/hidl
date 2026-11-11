import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';
import { cacheFeed, feedItems, fetchFeed, getCachedFeed, getFeedUrl, type FeedItem } from '../feed';
import { palettes } from '../theme';
import { hidiHeight, hidiSvg, kindSvg } from './hidi';
import { describe, orderCountdowns } from './mood';
import { readSettings, writeSettings, type WidgetSettings, type WidgetTheme } from './settings';
import { renderCountdownWidget } from './task-handler';

const c = palettes.teal;

const THEMES: { value: WidgetTheme; label: string }[] = [
  { value: 'system', label: 'Follow phone' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

type Loaded = { state: 'loading' } | { state: 'ready'; items: FeedItem[]; tz?: string } | { state: 'none'; connected: boolean };

/**
 * Opens when a hidl widget is added (and from the launcher's "widget settings" later): which
 * countdowns this widget flips through, and its look. Choices are kept per widget on the phone.
 */
export function WidgetSetup({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
  const [settings, setSettings] = useState<WidgetSettings | null>(null);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [saving, setSaving] = useState(false);

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

  async function save() {
    if (!settings || saving) return;
    setSaving(true);
    await writeSettings(widgetInfo.widgetId, settings);
    try {
      renderWidget(await renderCountdownWidget(widgetInfo, { fromCache: true, settings }));
    } catch {}
    setResult('ok');
  }

  const included = loaded.state === 'ready' && settings ? loaded.items.filter((i) => !settings.exclude.includes(i.id!)).length : 0;
  const now = Date.now();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <SvgXml xml={hidiSvg('excited')} width={64} height={hidiHeight(64)} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.title}>Set up your widget</Text>
            <Text style={styles.subtitle}>Hidi flips through these, soonest first.</Text>
          </View>
        </View>

        <Text style={styles.label}>COUNTDOWNS</Text>
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
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={[styles.row, i > 0 && styles.rowLine]}
                >
                  <View style={[styles.box, on && styles.boxOn]}>{on && <Text style={styles.tick}>✓</Text>}</View>
                  <SvgXml xml={kindSvg(item.kind)} width={26} height={26} style={{ marginLeft: 12 }} />
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.rowLeft}>{describe({ ...item, units: item.units ?? [] }, now, loaded.tz).short}</Text>
                </Pressable>
              );
            })}
        </View>
        {loaded.state === 'ready' && included === 0 && (
          <Text style={styles.warn}>Pick at least one, or the widget says “Add a countdown”.</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '800', color: c.heading },
  subtitle: { fontSize: 15, color: c.muted, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: c.muted, marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: c.card, borderRadius: 18, borderWidth: 1, borderColor: c.line, borderBottomWidth: 4, paddingHorizontal: 14 },
  note: { fontSize: 15, color: c.muted, paddingVertical: 16 },
  warn: { fontSize: 13, color: c.danger, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
  rowLine: { borderTopWidth: 1, borderTopColor: c.line },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: c.button, borderColor: c.button },
  tick: { color: c.buttonInk, fontSize: 15, fontWeight: '900' },
  rowTitle: { flex: 1, marginLeft: 10, fontSize: 16, fontWeight: '700', color: c.ink },
  rowLeft: { marginLeft: 8, fontSize: 13, color: c.muted, fontVariant: ['tabular-nums'] },
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
