import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import { getWidgetInfo, requestWidgetUpdateById, type WidgetInfo } from 'react-native-android-widget';
import { palettes } from '../theme';
import { WIDGET_NAMES } from './CountdownWidget';
import { WidgetSetup } from './WidgetSetup';

type Found = { name: string; info: WidgetInfo };

/** Finds a widget on the home screen by id; with no id, the first Hidl widget there. */
async function findWidget(widgetId: number | null): Promise<Found | null> {
  for (const name of WIDGET_NAMES) {
    const list = await getWidgetInfo(name).catch(() => [] as WidgetInfo[]);
    const info = widgetId === null ? list[0] : list.find((w) => w.widgetId === widgetId);
    if (info) return { name, info };
  }
  return null;
}

/**
 * The widget's settings opened from its sliders button (hidl://widget?id=…), over the journal:
 * the same screen Android shows when the widget is added, saving straight to that widget.
 */
export function WidgetSettingsScreen({ widgetId, onClose }: { widgetId: number | null; onClose: () => void }) {
  const [found, setFound] = useState<Found | null | undefined>(undefined);

  useEffect(() => {
    findWidget(widgetId).then((f) => {
      setFound(f);
      // Gone from the home screen since: nothing to set up.
      if (!f) onClose();
    });
  }, [widgetId, onClose]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  if (!found) {
    return (
      <View style={styles.cover}>
        <ActivityIndicator color={palettes.teal.teal} size="large" />
      </View>
    );
  }
  return (
    <View style={styles.cover}>
      <WidgetSetup
        widgetInfo={found.info}
        renderWidget={(widget) => {
          requestWidgetUpdateById({ widgetName: found.name, widgetId: found.info.widgetId, renderWidget: () => widget }).catch(() => {});
        }}
        setResult={() => onClose()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFill, backgroundColor: palettes.teal.paper, justifyContent: 'center' },
});
