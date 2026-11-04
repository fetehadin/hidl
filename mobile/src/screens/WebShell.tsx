import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView as RNWebView } from 'react-native-webview';
import type { WebViewProps } from 'react-native-webview/lib/WebView';
import type { WebViewNavigation, WebViewProgressEvent, WebViewHttpErrorEvent } from 'react-native-webview/lib/WebViewTypes';

/** The methods we call on the web view. The package types it as a function component without a ref. */
type WebViewHandle = { goBack(): void; reload(): void };
const WebView = RNWebView as unknown as React.ComponentType<WebViewProps & { ref?: React.Ref<WebViewHandle> }>;
import { APP_UA, SITE_ORIGIN } from '../config';
import { colors } from '../theme';

/**
 * The journal itself: the hidl website in a native shell, so letters, countdowns and photos are
 * the same everywhere and every website improvement ships to the app at once. The web view keeps
 * its own session (handed over once at sign-in via `startUrl`).
 */
export function WebShell({ startUrl, onSignedOut }: { startUrl: string; onSignedOut: () => void }) {
  const web = useRef<WebViewHandle>(null);
  const insets = useSafeAreaInsets();
  const [canGoBack, setCanGoBack] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const splash = useRef(new Animated.Value(1)).current;

  // Android's back button walks back through the journal before leaving the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        web.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  useEffect(() => {
    if (ready) Animated.timing(splash, { toValue: 0, duration: 260, useNativeDriver: true }).start();
  }, [ready, splash]);

  function onNavigation(nav: WebViewNavigation) {
    setCanGoBack(nav.canGoBack);
    let path = '';
    try {
      const u = new URL(nav.url);
      if (u.origin === SITE_ORIGIN) path = u.pathname;
    } catch {}
    // Signed out on the site (or the session ended): back to the app's own sign-in.
    if (path === '/login') onSignedOut();
  }

  function shouldLoad(req: { url: string }) {
    const { url } = req;
    if (url.startsWith('about:') || url.startsWith('blob:') || url.startsWith('data:')) return true;
    try {
      if (new URL(url).origin === SITE_ORIGIN) return true;
    } catch {}
    // Anything else (links in letters, mailto:, other sites) opens outside the app.
    Linking.openURL(url).catch(() => {});
    return false;
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <WebView
        ref={web}
        source={{ uri: startUrl }}
        style={styles.web}
        applicationNameForUserAgent={APP_UA}
        onNavigationStateChange={onNavigation}
        onShouldStartLoadWithRequest={shouldLoad}
        onLoadProgress={(e: WebViewProgressEvent) => setProgress(e.nativeEvent.progress)}
        onLoadEnd={() => setReady(true)}
        onError={() => setFailed(true)}
        onHttpError={(e: WebViewHttpErrorEvent) => {
          if (e.nativeEvent.statusCode >= 500) setFailed(true);
        }}
        // Photo uploads: the calendar's file picker can use the camera.
        allowFileAccess
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        domStorageEnabled
        thirdPartyCookiesEnabled={false}
        overScrollMode="never"
        textZoom={100}
        decelerationRate="normal"
        bounces={false}
      />
      <View style={{ height: insets.bottom, backgroundColor: colors.white }} />

      {progress > 0 && progress < 1 && ready && (
        <View style={[styles.progressTrack, { top: insets.top }]} pointerEvents="none">
          <View style={[styles.progressBar, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      )}

      <Animated.View style={[styles.splash, { opacity: splash }]} pointerEvents={ready ? 'none' : 'auto'}>
        <Image source={require('../../assets/icon.png')} style={styles.splashIcon} />
        <Text style={styles.splashText}>Opening your journal…</Text>
      </Animated.View>

      {failed && (
        <View style={styles.offline}>
          <Image source={require('../../assets/icon.png')} style={styles.offlineIcon} />
          <Text style={styles.offlineTitle}>You&apos;re offline</Text>
          <Text style={styles.offlineBody}>hidl needs a connection to open your journal. Your home-screen widget keeps showing the last countdown it saw.</Text>
          <Pressable
            onPress={() => {
              setFailed(false);
              web.current?.reload();
            }}
            style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.mint },
  web: { flex: 1, backgroundColor: colors.mint },
  progressTrack: { position: 'absolute', left: 0, right: 0, height: 3 },
  progressBar: { height: 3, backgroundColor: colors.teal, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  splash: { ...StyleSheet.absoluteFill, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', gap: 16 },
  splashIcon: { width: 120, height: 120, borderRadius: 30 },
  splashText: { fontSize: 17, fontWeight: '700', color: colors.ocean },
  offline: { ...StyleSheet.absoluteFill, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  offlineIcon: { width: 96, height: 96, borderRadius: 24, opacity: 0.9 },
  offlineTitle: { fontSize: 24, fontWeight: '800', color: colors.ocean },
  offlineBody: { fontSize: 15, lineHeight: 22, color: colors.ink, textAlign: 'center', maxWidth: 320 },
  retry: {
    marginTop: 8,
    paddingHorizontal: 28,
    minHeight: 52,
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.teal,
    borderBottomWidth: 5,
    borderBottomColor: colors.ocean,
  },
  retryPressed: { borderBottomWidth: 1, marginTop: 12 },
  retryText: { color: colors.white, fontSize: 18, fontWeight: '800' },
});
