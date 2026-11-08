import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRandomBytes } from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { SITE_URL } from './config';

/**
 * Native sign-in. The app never talks to Supabase directly: the website's /api/app/* routes
 * do every check (allowlist, codes, Google) and hand back a session. The app passes that
 * session once to its web view (/auth/native), which keeps and refreshes it from then on.
 * The app doesn't keep its own copy, so two places never fight over one refresh token.
 */
export type AppSession = { access_token: string; refresh_token: string; expires_at: number | null };

export class AuthError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

const SIGNED_IN_KEY = 'hidl.signedIn';

export async function isSignedIn() {
  return (await AsyncStorage.getItem(SIGNED_IN_KEY)) === '1';
}

export async function setSignedIn(value: boolean) {
  if (value) await AsyncStorage.setItem(SIGNED_IN_KEY, '1');
  else await AsyncStorage.removeItem(SIGNED_IN_KEY);
}

const PENDING_KEY = 'hidl.pendingCode';
const PENDING_FOR_MS = 30 * 60 * 1000;

/**
 * The email a code was just sent to. Getting the code means leaving the app for the mail app, and
 * Android may close the app meanwhile; remembering the address lets the code step come back
 * instead of starting over.
 */
export async function rememberPendingCode(email: string | null) {
  if (email) await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ email, at: Date.now() }));
  else await AsyncStorage.removeItem(PENDING_KEY);
}

export async function pendingCodeEmail(): Promise<string | null> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(PENDING_KEY)) ?? 'null') as { email?: string; at?: number } | null;
    if (saved?.email && saved.at && Date.now() - saved.at < PENDING_FOR_MS) return saved.email;
  } catch {}
  return null;
}

async function post<T>(path: string, body: unknown, accessToken?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SITE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError("You're offline. Check your connection and try again.", 'offline');
  }
  const json = (await res.json().catch(() => null)) as ({ ok: boolean; code?: string; message?: string } & T) | null;
  if (!json?.ok) throw new AuthError(json?.message ?? 'Something went wrong. Try again.', json?.code ?? 'failed');
  return json;
}

/** Which sign-in methods the site has switched on. Anything that goes wrong means "email only". */
export async function fetchProviders(): Promise<{ google: boolean }> {
  try {
    const res = await fetch(`${SITE_URL}/api/app/auth/providers`);
    const json = (await res.json()) as { ok?: boolean; google?: boolean };
    return { google: json.ok === true && json.google === true };
  } catch {
    return { google: false };
  }
}

export async function sendEmailCode(email: string) {
  await post('/api/app/auth/email', { email });
}

export async function verifyEmailCode(email: string, code: string): Promise<AppSession> {
  return (await post<{ session: AppSession }>('/api/app/auth/verify', { email, code })).session;
}

/** Signs in with the one-time code from the website (Account → "Get a code"). */
export async function signInWithAppCode(code: string): Promise<AppSession> {
  return (await post<{ session: AppSession }>('/api/app/auth/code', { code })).session;
}

function base64url(bytes: Uint8Array) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const GOOGLE_ERRORS: Record<string, string> = {
  cancelled: '',
  'not-allowed': 'This journal is private, and that Google account isn’t on the list.',
  expired: 'That took too long. Try again.',
};

/** "Continue with Google" in a secure browser tab; resolves with null if the person backs out. */
export async function signInWithGoogle(): Promise<AppSession | null> {
  // A fresh 256-bit secret per attempt: the session comes back sealed with it (see sealForApp).
  const secret = base64url(getRandomBytes(32));
  const result = await WebBrowser.openAuthSessionAsync(
    `${SITE_URL}/api/app/auth/google?secret=${secret}`,
    'hidl://auth',
    { showInRecents: false },
  );
  if (result.type !== 'success') return null;
  const params = new URL(result.url).searchParams;
  const error = params.get('error');
  if (error) {
    const message = GOOGLE_ERRORS[error] ?? 'Google sign-in didn’t work. Try again.';
    if (!message) return null;
    throw new AuthError(message, error);
  }
  const blob = params.get('sealed');
  if (!blob) throw new AuthError('Google sign-in didn’t work. Try again.', 'failed');
  return (await post<{ session: AppSession }>('/api/app/auth/redeem', { blob, secret })).session;
}

/**
 * Connects the home-screen widget to the account right after sign-in. `exists` means a widget
 * link was already made elsewhere; replacing it would stop that one, so the caller asks first.
 */
export async function setUpWidget(session: AppSession, replace = false) {
  return post<{ status: 'created'; feedUrl: string } | { status: 'exists' }>('/api/app/widget', { replace }, session.access_token);
}

/** The web view's first address after sign-in: the session rides in the fragment, never sent to a server. */
export function handoffUrl(session: AppSession) {
  return `${SITE_URL}/auth/native#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`;
}
