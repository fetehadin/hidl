import Constants from 'expo-constants';

/**
 * The hidl website this app is a shell for. Everything (sign-in checks, data, the journal
 * itself) lives there; set per build with EXPO_PUBLIC_SITE_URL (see eas.json).
 */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || (Constants.expoConfig?.extra?.siteUrl as string | undefined) || 'https://hidl-sigma.vercel.app').replace(/\/$/, '');

export const SITE_ORIGIN = new URL(SITE_URL).origin;

/** Appended to the web view's user agent, so the site can tell it's running inside the app. */
export const APP_UA = 'hidl-app/0.2';
