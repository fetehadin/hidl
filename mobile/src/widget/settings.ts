import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * One widget's own choices, kept on the phone: which countdowns it leaves out (so a countdown
 * added later shows up by itself), its theme, and the countdown last flipped to on an older APK
 * (by id, with when: it stays on top for a while, see `smartOrder`).
 */
export type WidgetTheme = 'light' | 'dark' | 'system';
export type WidgetSettings = { exclude: string[]; theme: WidgetTheme; current: string | null; pickedAt?: number };

const key = (widgetId: number) => `hidl.widget.${widgetId}`;
// Before per-widget settings, only the page number was kept.
const oldPageKey = (widgetId: number) => `hidl.widgetPage.${widgetId}`;

export const DEFAULT_SETTINGS: WidgetSettings = { exclude: [], theme: 'system', current: null };

export async function readSettings(widgetId: number): Promise<WidgetSettings> {
  try {
    const raw = await AsyncStorage.getItem(key(widgetId));
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw) as Partial<WidgetSettings>;
    return {
      exclude: Array.isArray(s.exclude) ? s.exclude.filter((x): x is string => typeof x === 'string') : [],
      theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system',
      current: typeof s.current === 'string' ? s.current : null,
      ...(typeof s.pickedAt === 'number' ? { pickedAt: s.pickedAt } : {}),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function writeSettings(widgetId: number, settings: WidgetSettings) {
  await AsyncStorage.setItem(key(widgetId), JSON.stringify(settings)).catch(() => {});
}

export async function forgetSettings(widgetId: number) {
  await AsyncStorage.multiRemove([key(widgetId), oldPageKey(widgetId)]).catch(() => {});
}
