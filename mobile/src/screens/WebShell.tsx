import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView as RNWebView } from 'react-native-webview';
import type { WebViewProps } from 'react-native-webview/lib/WebView';
import type { WebViewMessageEvent, WebViewNavigation, WebViewProgressEvent, WebViewHttpErrorEvent } from 'react-native-webview/lib/WebViewTypes';

/** The methods we call on the web view. The package types it as a function component without a ref. */
type WebViewHandle = { goBack(): void; reload(): void };
const WebView = RNWebView as unknown as React.ComponentType<WebViewProps & { ref?: React.Ref<WebViewHandle> }>;
import { APP_UA, SITE_ORIGIN } from '../config';
import { type Palette, type ThemeName, palettes, parseTheme } from '../theme';

const THEME_KEY = 'hidl.theme';

// Tells the app which theme the page shows (the <html data-theme> attribute), now and whenever it
// changes, so the strips around the page and the splash match it.
const REPORT_THEME = `(function () {
  function send() {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ theme: document.documentElement.dataset.theme || 'teal' })); } catch (e) {}
  }
  send();
  new MutationObserver(send).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
true;`;

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
  // Right after sign-in the web view first opens /auth/native. If it ends up on /login before any
  // real page has loaded, the session handoff failed: say so, instead of dropping back to sign-in
  // as if nothing had happened.
  const freshSignIn = startUrl.includes('/auth/native');
  const opened = useRef(false);
  const [handoffFailed, setHandoffFailed] = useState(false);
  const splash = useRef(new Animated.Value(1)).current;
  const [theme, setTheme] = useState<ThemeName>('teal');
  const p = palettes[theme];
  const styles = useMemo(() => makeStyles(p), [p]);

  // Start in the theme the page showed last time, so the splash doesn't flash the wrong color.
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((t) => t && setTheme(parseTheme(t)))
      .catch(() => {});
  }, []);

  function onMessage(e: WebViewMessageEvent) {
    try {
      const next = parseTheme((JSON.parse(e.nativeEvent.data) as { theme?: unknown }).theme);
      setTheme(next);
      AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
    } catch {}
  }

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

  // Nothing loaded after a long wait (a stuck connection): offer a retry rather than a forever splash.
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setFailed(true), 30000);
    return () => clearTimeout(t);
  }, [ready]);

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
    if (path === '/login') {
      // Signed out on the site (or the session ended): back to the app's own sign-in.
      if (opened.current || !freshSignIn) onSignedOut();
      else setHandoffFailed(true);
    } else if (path && !path.startsWith('/auth')) {
      opened.current = true;
    }
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
        injectedJavaScript={REPORT_THEME}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={shouldLoad}
        onLoadProgress={(e: WebViewProgressEvent) => setProgress(e.nativeEvent.progress)}
        onLoadEnd={() => setReady(true)}
        onError={() => setFailed(true)}
        // Android can kill the web view's renderer (low memory); without this the screen goes blank for good.
        onRenderProcessGone={() => web.current?.reload()}
        onContentProcessDidTerminate={() => web.current?.reload()}
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
      <View style={{ height: insets.bottom, backgroundColor: p.card }} />
      <StatusBar style={p.statusBar} />

      {progress > 0 && progress < 1 && ready && (
        <View style={[styles.progressTrack, { top: insets.top }]} pointerEvents="none">
          <View style={[styles.progressBar, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      )}

      <Animated.View style={[styles.splash, { opacity: splash }]} pointerEvents={ready ? 'none' : 'auto'}>
        <Image source={require('../../assets/icon.png')} style={styles.splashIcon} />
        <Text style={styles.splashText}>Opening your journal…</Text>
      </Animated.View>

      {handoffFailed && (
        <View style={styles.offline}>
          <Image source={require('../../assets/icon.png')} style={styles.offlineIcon} />
          <Text style={styles.offlineTitle}>Couldn&apos;t open your journal</Text>
          <Text style={styles.offlineBody}>You&apos;re signed in, but the journal didn&apos;t accept the session. Sign in once more to fix it.</Text>
          <Pressable onPress={onSignedOut} style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]} accessibilityRole="button">
            <Text style={styles.retryText}>Sign in again</Text>
          </Pressable>
        </View>
      )}

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


function makeStyles(p: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.paper },
    web: { flex: 1, backgroundColor: p.paper },
    progressTrack: { position: 'absolute', left: 0, right: 0, height: 3 },
    progressBar: { height: 3, backgroundColor: p.teal, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
    splash: { ...StyleSheet.absoluteFill, backgroundColor: p.paper, alignItems: 'center', justifyContent: 'center', gap: 16 },
    splashIcon: { width: 120, height: 120, borderRadius: 30 },
    splashText: { fontSize: 17, fontWeight: '700', color: p.heading },
    offline: { ...StyleSheet.absoluteFill, backgroundColor: p.paper, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    offlineIcon: { width: 96, height: 96, borderRadius: 24, opacity: 0.9 },
    offlineTitle: { fontSize: 24, fontWeight: '800', color: p.heading },
    offlineBody: { fontSize: 15, lineHeight: 22, color: p.ink, textAlign: 'center', maxWidth: 320 },
    retry: {
      marginTop: 8,
      paddingHorizontal: 28,
      minHeight: 52,
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: p.button,
    },
    retryPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
    retryText: { color: p.buttonInk, fontSize: 17, fontWeight: '700' },
  });
}
