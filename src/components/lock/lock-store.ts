"use client";

import { LOCK_COOKIE, type LockConfig, configKey, parseLockConfig, seenKey } from "@/lib/app-lock";

// Browser storage for the app lock (src/lib/app-lock.ts). Storage can be blocked (private
// mode); then there's simply no lock, and every call here fails quietly.

export function readLock(userId: string): LockConfig | null {
  try {
    return parseLockConfig(localStorage.getItem(configKey(userId)));
  } catch {
    return null;
  }
}

export function writeLock(userId: string, config: LockConfig) {
  try {
    localStorage.setItem(configKey(userId), JSON.stringify(config));
  } catch {
    return false;
  }
  setCookieUsers((ids) => [...new Set([...ids, userId])]);
  return true;
}

export function clearLock(userId: string) {
  try {
    localStorage.removeItem(configKey(userId));
    sessionStorage.removeItem(seenKey(userId));
  } catch {
    // Nothing stored then.
  }
  setCookieUsers((ids) => ids.filter((id) => id !== userId));
}

export function readSeen(userId: string): number | null {
  try {
    const v = Number(sessionStorage.getItem(seenKey(userId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function markSeen(userId: string, at: number) {
  try {
    sessionStorage.setItem(seenKey(userId), String(at));
  } catch {
    // A reload will ask again; that's the safe side.
  }
}

/**
 * The cookie lists the users who have a lock on this device, so the server renders their pages
 * hidden behind the lock screen from the first byte. It holds no secret.
 */
function setCookieUsers(update: (ids: string[]) => string[]) {
  const current = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${LOCK_COOKIE}=`))
    ?.slice(LOCK_COOKIE.length + 1);
  const ids = update(current ? decodeURIComponent(current).split(",").filter(Boolean) : []);
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = ids.length
    ? `${LOCK_COOKIE}=${encodeURIComponent(ids.join(","))}; path=/; max-age=31536000; samesite=lax${secure}`
    : `${LOCK_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
}
