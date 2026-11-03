/**
 * Keeps the unlocked letter key on this device so the passphrase is asked once, not on every
 * letter. Stored in IndexedDB as a non-extractable CryptoKey: the browser can use it to
 * encrypt and decrypt, but nothing (including scripts on the page) can read the raw key out.
 * Wiped on the sign-in page, where sign-out and account deletion land (ClearPhotoCache).
 *
 * Keyed by user id, so someone else signing in on the same browser doesn't pick it up.
 */
const DB = "hidl-keys";
const STORE = "letter-keys";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function loadLetterKey(userId: string): Promise<CryptoKey | null> {
  try {
    const key = await run<CryptoKey | undefined>("readonly", (s) => s.get(userId));
    return key instanceof CryptoKey ? key : null;
  } catch {
    return null; // private mode / storage blocked: just ask for the passphrase again
  }
}

export async function saveLetterKey(userId: string, key: CryptoKey) {
  try {
    await run("readwrite", (s) => s.put(key, userId));
  } catch {
    // Not fatal: the key still works for this page, it just won't be remembered.
  }
}

export async function forgetLetterKeys() {
  try {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  } catch {}
}
