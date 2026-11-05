import type React from 'react';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { AuthError, fetchProviders, sendEmailCode, signInWithGoogle, verifyEmailCode, type AppSession } from '../auth';
import { colors } from '../theme';

const RESEND_AFTER_S = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Step = { name: 'email' } | { name: 'code'; email: string };

/** Native sign-in: Google in one tap, or email with a 6-digit code. */
export function SignInScreen({ onSignedIn }: { onSignedIn: (session: AppSession) => void }) {
  const [step, setStep] = useState<Step>({ name: 'email' });
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<null | 'google' | 'email' | 'code'>(null);
  const [error, setError] = useState<string | null>(null);
  // Google shows up only once the site says it's switched on, so it's never a button that fails.
  const [googleOn, setGoogleOn] = useState(false);
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fetchProviders().then((p) => setGoogleOn(p.google));
  }, []);

  useEffect(() => {
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [step.name, appear]);

  async function run<T>(kind: 'google' | 'email' | 'code', task: () => Promise<T>) {
    setError(null);
    setBusy(kind);
    try {
      return await task();
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Something went wrong. Try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function google() {
    const session = await run('google', signInWithGoogle);
    if (session) succeed(session);
  }

  async function sendCode() {
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) {
      setError('Enter a valid email address.');
      return;
    }
    const sent = await run('email', async () => {
      await sendEmailCode(address);
      return true;
    });
    if (sent) {
      Haptics.selectionAsync().catch(() => {});
      setStep({ name: 'code', email: address });
    }
  }

  function succeed(session: AppSession) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onSignedIn(session);
  }

  const slide = { opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Image source={require('../../assets/icon.png')} style={styles.mascot} accessibilityLabel="Hidi, the hidl mascot" />
            <Text style={styles.wordmark}>hidl</Text>
            <Text style={styles.tagline}>Letters to future you, countdowns, and a photo for every day.</Text>
          </View>

          <Animated.View style={[styles.card, slide]}>
            {step.name === 'email' ? (
              <>
                <Text style={styles.title}>Sign in</Text>
                <Text style={styles.subtitle}>Same account as the website. Everything stays in sync.</Text>

                {googleOn && (
                  <>
                    <Pressable
                      onPress={google}
                      disabled={busy !== null}
                      style={({ pressed }) => [styles.google, pressed && styles.pressed, busy !== null && styles.dim]}
                      accessibilityRole="button"
                    >
                      {busy === 'google' ? <ActivityIndicator color={colors.ocean} /> : <GoogleLogo />}
                      <Text style={styles.googleText}>Continue with Google</Text>
                    </Pressable>

                    <View style={styles.dividerRow}>
                      <View style={styles.rule} />
                      <Text style={styles.dividerText}>or with email</Text>
                      <View style={styles.rule} />
                    </View>
                  </>
                )}

                <TextInput
                  style={[styles.input, error && styles.inputError]}
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    setError(null);
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={sendCode}
                  editable={busy === null}
                  accessibilityLabel="Email address"
                />
                <ArcadeButton label="Email me a code" busy={busy === 'email'} disabled={busy !== null} onPress={sendCode} />
              </>
            ) : (
              <CodeStep
                email={step.email}
                busy={busy === 'code'}
                onVerify={async (code) => {
                  const session = await run('code', () => verifyEmailCode(step.email, code));
                  if (session) succeed(session);
                  return Boolean(session);
                }}
                onResend={() => run('email', () => sendEmailCode(step.email))}
                onBack={() => {
                  setError(null);
                  setStep({ name: 'email' });
                }}
              />
            )}
            {error && (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {error}
              </Text>
            )}
          </Animated.View>

          <Text style={styles.footnote}>Private by design: your letters are end-to-end encrypted.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The 6-digit code in some copied text: just the code, "123 456", or a sentence containing it. */
function findCode(text: string | null | undefined) {
  if (!text) return null;
  const compact = text.replace(/[\s-]/g, '');
  if (/^\d{6}$/.test(compact)) return compact;
  return text.match(/(?<!\d)\d{6}(?!\d)/)?.[0] ?? null;
}

function CodeStep({
  email,
  busy,
  onVerify,
  onResend,
  onBack,
}: {
  email: string;
  busy: boolean;
  onVerify: (code: string) => Promise<boolean>;
  onResend: () => Promise<unknown>;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(RESEND_AFTER_S);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  // Codes already tried, so a wrong one left on the clipboard isn't submitted again and again.
  const tried = useRef(new Set<string>());
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(digits: string) {
    setCode(digits);
    if (digits.length < 6) return;
    tried.current.add(digits);
    const ok = await onVerify(digits);
    if (!ok) setCode('');
  }

  /** Takes a code from the clipboard if there's a fresh one (like the banking and exchange apps do). */
  async function takeFromClipboard(force = false) {
    if (busyRef.current) return;
    const found = findCode(await Clipboard.getStringAsync().catch(() => ''));
    if (found && (force || !tried.current.has(found))) await submit(found);
  }

  // Right away, and again whenever the person comes back from their mail app with the code copied.
  useEffect(() => {
    takeFromClipboard();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') takeFromClipboard();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.subtitle}>
        We sent a 6-digit code to <Text style={styles.bold}>{email}</Text>.
      </Text>

      <Pressable onPress={() => input.current?.focus()} style={styles.codeRow} accessibilityLabel="Enter the 6-digit code">
        {Array.from({ length: 6 }, (_, i) => {
          const active = i === Math.min(code.length, 5) && !busy;
          return (
            <View key={i} style={[styles.codeBox, active && styles.codeBoxActive, code[i] !== undefined && styles.codeBoxFilled]}>
              <Text style={styles.codeDigit}>{code[i] ?? ''}</Text>
            </View>
          );
        })}
        <TextInput
          ref={input}
          value={code}
          // A paste can carry spaces or a whole sentence, so find the code in it instead of cutting at 6 characters.
          onChangeText={(text) => submit(findCode(text) ?? text.replace(/\D/g, '').slice(0, 6))}
          autoFocus
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          editable={!busy}
          style={styles.hiddenInput}
          caretHidden
        />
      </Pressable>

      {busy ? (
        <View style={styles.verifying}>
          <ActivityIndicator color={colors.teal} />
          <Text style={styles.subtitle}>Signing you in…</Text>
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => takeFromClipboard(true)}
            style={({ pressed }) => [styles.paste, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Paste the code from the clipboard"
          >
            <Text style={styles.pasteText}>Paste code</Text>
          </Pressable>
          <View style={styles.codeActions}>
            <Pressable
              disabled={wait > 0}
              onPress={async () => {
                tried.current.clear();
                await onResend();
                setWait(RESEND_AFTER_S);
              }}
              hitSlop={8}
            >
              <Text style={[styles.link, wait > 0 && styles.linkMuted]}>{wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}</Text>
            </Pressable>
            <Pressable onPress={onBack} hitSlop={8}>
              <Text style={styles.link}>Use a different email</Text>
            </Pressable>
          </View>
        </>
      )}
    </>
  );
}

/** The website's chunky button: teal face, darker bottom edge that collapses when pressed. */
function ArcadeButton({ label, busy, disabled, onPress }: { label: string; busy: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button">
      {({ pressed }) => (
        <View style={[styles.arcade, pressed && styles.arcadePressed, disabled && !busy && styles.dim]}>
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.arcadeText}>{label}</Text>}
        </View>
      )}
    </Pressable>
  );
}

function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48" accessibilityElementsHidden>
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.mint },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 28 },
  hero: { alignItems: 'center', gap: 6 },
  mascot: { width: 104, height: 104, borderRadius: 28, marginBottom: 6 },
  wordmark: { fontSize: 38, lineHeight: 44, fontWeight: '800', color: colors.ocean, letterSpacing: -0.5, textAlign: 'center' },
  tagline: { fontSize: 15, lineHeight: 22, color: colors.ink, textAlign: 'center', maxWidth: 280 },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.aqua,
    borderWidth: 2,
    borderRadius: 28,
    padding: 22,
    gap: 14,
    shadowColor: colors.ocean,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.ocean },
  subtitle: { marginTop: -6, fontSize: 15, lineHeight: 21, color: colors.muted },
  bold: { fontWeight: '700', color: colors.ink },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.aqua,
    backgroundColor: colors.white,
  },
  googleText: { fontSize: 17, fontWeight: '700', color: colors.ink },
  pressed: { transform: [{ scale: 0.98 }], backgroundColor: '#f3fbfa' },
  dim: { opacity: 0.6 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule: { flex: 1, height: 1, backgroundColor: colors.aqua },
  dividerText: { fontSize: 13, color: colors.muted },
  input: {
    minHeight: 54,
    borderColor: colors.aqua,
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 17,
    color: colors.ink,
    backgroundColor: '#fbfefd',
  },
  inputError: { borderColor: colors.danger },
  arcade: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: colors.teal,
    borderBottomWidth: 5,
    borderBottomColor: colors.ocean,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arcadePressed: { borderBottomWidth: 1, marginTop: 4 },
  arcadeText: { color: colors.white, fontSize: 19, fontWeight: '800' },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginVertical: 4 },
  codeBox: {
    flex: 1,
    aspectRatio: 0.82,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.aqua,
    backgroundColor: '#fbfefd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxActive: { borderColor: colors.teal, borderWidth: 3 },
  codeBoxFilled: { backgroundColor: colors.white, borderColor: colors.fresh },
  codeDigit: { fontSize: 26, fontWeight: '800', color: colors.ocean },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  paste: {
    alignSelf: 'center',
    minHeight: 44,
    paddingHorizontal: 22,
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.aqua,
    backgroundColor: colors.white,
  },
  pasteText: { fontSize: 15, fontWeight: '700', color: colors.ocean },
  verifying: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 44 },
  codeActions: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, minHeight: 36, alignItems: 'center' },
  link: { color: colors.ocean, fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
  linkMuted: { color: colors.muted, textDecorationLine: 'none', fontWeight: '600' },
  error: { color: colors.danger, fontSize: 15, lineHeight: 21 },
  footnote: { textAlign: 'center', fontSize: 13, color: colors.muted },
});
