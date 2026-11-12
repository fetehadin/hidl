import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Linking, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Access, type PickedMedia, browseAll, loadRecent, photoAccess, takePhoto } from '../media-picker';
import type { Palette } from '../theme';

const GAP = 2;
const COLUMNS = 3;

type Tile = { camera: true } | PickedMedia;

/**
 * Telegram-style photo picker: a sheet from the bottom with the phone's newest photos and videos,
 * a camera tile first, and a circle on each to pick several (numbered in the order picked). "Add"
 * hands them to the page; the camera adds its photo straight away. "All photos" opens Android's
 * own picker for older albums.
 */
export function MediaPickerSheet({
  palette: p,
  multiple,
  onCancel,
  onPick,
}: {
  palette: Palette;
  multiple: boolean;
  onCancel: () => void;
  onPick: (items: PickedMedia[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const tileSize = (width - GAP * (COLUMNS - 1)) / COLUMNS;
  const styles = useMemo(() => makeStyles(p), [p]);

  const [access, setAccess] = useState<Access | 'checking'>('checking');
  const [items, setItems] = useState<PickedMedia[]>([]);
  const [chosen, setChosen] = useState<PickedMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const next = useRef<string | undefined>(undefined);
  const loading = useRef(false);

  const loadMore = useCallback(async () => {
    if (loading.current || (next.current === undefined && items.length > 0)) return;
    loading.current = true;
    try {
      const page = await loadRecent(next.current);
      next.current = page.next;
      setItems((prev) => [...prev, ...page.items]);
    } catch {
      setNote("Couldn't load your photos.");
    } finally {
      loading.current = false;
    }
  }, [items.length]);

  // Ask for the photos once, as the sheet opens.
  useEffect(() => {
    let live = true;
    photoAccess(true)
      .then((a) => {
        if (!live) return;
        setAccess(a);
        if (a === 'granted') loadMore();
      })
      .catch(() => live && setAccess('denied'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);

  function toggle(item: PickedMedia) {
    if (!multiple) {
      onPick([item]);
      return;
    }
    setChosen((prev) => (prev.some((c) => c.id === item.id) ? prev.filter((c) => c.id !== item.id) : [...prev, item]));
  }

  async function camera() {
    if (busy) return;
    setBusy(true);
    try {
      const shot = await takePhoto();
      if (shot.length > 0) onPick([...chosen, ...shot]);
    } catch {
      setNote('Hidl needs the camera for this. Allow it in Settings.');
    } finally {
      setBusy(false);
    }
  }

  async function browse() {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await browseAll(multiple);
      if (picked.length > 0) onPick([...chosen, ...picked]);
    } finally {
      setBusy(false);
    }
  }

  const tiles: Tile[] = [{ camera: true }, ...items];

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Close" />
      <View style={[styles.sheet, { height: height * 0.78, paddingBottom: insets.bottom }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>{chosen.length > 0 ? `${chosen.length} selected` : 'Recent'}</Text>
          <Pressable onPress={browse} hitSlop={10} accessibilityRole="button">
            <Text style={styles.link}>All photos</Text>
          </Pressable>
        </View>

        {access === 'checking' ? (
          <ActivityIndicator color={p.teal} style={{ marginTop: 40 }} />
        ) : access !== 'granted' ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Let Hidl see your photos</Text>
            <Text style={styles.emptyBody}>So you can pick them right here. They're only read when you add one.</Text>
            <Pressable
              style={styles.button}
              onPress={() =>
                access === 'ask'
                  ? photoAccess(true).then((a) => {
                      setAccess(a);
                      if (a === 'granted') loadMore();
                    })
                  : Linking.openSettings()
              }
            >
              <Text style={styles.buttonText}>{access === 'ask' ? 'Allow' : 'Open settings'}</Text>
            </Pressable>
            <View style={styles.row}>
              <Pressable onPress={camera} style={styles.ghost}>
                <Text style={styles.ghostText}>Camera</Text>
              </Pressable>
              <Pressable onPress={browse} style={styles.ghost}>
                <Text style={styles.ghostText}>Browse</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <FlatList
            data={tiles}
            numColumns={COLUMNS}
            keyExtractor={(t) => ('camera' in t ? 'camera' : t.id)}
            columnWrapperStyle={{ gap: GAP }}
            contentContainerStyle={{ gap: GAP, paddingBottom: chosen.length > 0 ? 88 : 12 }}
            onEndReached={loadMore}
            onEndReachedThreshold={0.6}
            initialNumToRender={18}
            windowSize={7}
            removeClippedSubviews
            renderItem={({ item }) => {
              if ('camera' in item) {
                return (
                  <Pressable onPress={camera} style={[styles.camera, { width: tileSize, height: tileSize }]} accessibilityLabel="Take a photo">
                    {busy ? <ActivityIndicator color="#ffffff" /> : <CameraIcon />}
                  </Pressable>
                );
              }
              const order = chosen.findIndex((c) => c.id === item.id);
              return (
                <Pressable
                  onPress={() => toggle(item)}
                  style={{ width: tileSize, height: tileSize }}
                  accessibilityLabel={item.kind === 'video' ? 'Video' : 'Photo'}
                  accessibilityState={{ selected: order >= 0 }}
                >
                  <Image source={{ uri: item.uri }} style={styles.thumb} resizeMethod="resize" />
                  {order >= 0 && <View style={styles.dim} />}
                  {item.kind === 'video' && (
                    <View style={styles.duration}>
                      <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
                    </View>
                  )}
                  {multiple && (
                    <View style={[styles.check, order >= 0 && styles.checkOn]}>
                      {order >= 0 && <Text style={styles.checkText}>{order + 1}</Text>}
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        )}

        {note && <Text style={styles.note}>{note}</Text>}

        {chosen.length > 0 && (
          <View style={[styles.bar, { bottom: insets.bottom + 12 }]}>
            <Pressable style={styles.add} onPress={() => onPick(chosen)} accessibilityRole="button">
              <Text style={styles.addText}>Add {chosen.length === 1 ? '1 photo' : `${chosen.length} photos`}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function CameraIcon() {
  return (
    <Svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={1.8} strokeLinejoin="round">
      <Path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2.2h5.6L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <Circle cx={12} cy={12.8} r={3.4} />
      <Rect x={17} y={9} width={1} height={1} fill="#ffffff" />
    </Svg>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: p.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      overflow: 'hidden',
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: p.lineStrong, marginTop: 10 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12 },
    title: { fontSize: 18, fontWeight: '800', color: p.heading },
    link: { fontSize: 15, fontWeight: '700', color: p.teal },
    camera: { backgroundColor: '#17393d', alignItems: 'center', justifyContent: 'center' },
    thumb: { width: '100%', height: '100%', backgroundColor: p.line },
    dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
    duration: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
    durationText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
    check: {
      position: 'absolute',
      top: 7,
      right: 7,
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: { backgroundColor: p.teal, borderColor: '#ffffff' },
    checkText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
    bar: { position: 'absolute', left: 16, right: 16 },
    add: { backgroundColor: p.button, borderRadius: 16, paddingVertical: 15, alignItems: 'center', elevation: 4 },
    addText: { color: p.buttonInk, fontSize: 16, fontWeight: '800' },
    note: { color: p.danger, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 16 },
    empty: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 32, gap: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: p.heading, textAlign: 'center' },
    emptyBody: { fontSize: 15, color: p.muted, textAlign: 'center', lineHeight: 21 },
    button: { backgroundColor: p.button, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28, marginTop: 6 },
    buttonText: { color: p.buttonInk, fontWeight: '800', fontSize: 15 },
    row: { flexDirection: 'row', gap: 10, marginTop: 4 },
    ghost: { borderWidth: 1, borderColor: p.lineStrong, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 20 },
    ghostText: { color: p.ink, fontWeight: '700' },
  });
}
