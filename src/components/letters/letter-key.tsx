"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { addLetterPasskey, emailLetterKey, setupLetterKeys, upgradeLetterKeys } from "@/actions/encryption";
import { Mascot } from "@/components/mascot";
import {
  type KeyBundle,
  WrongSecretError,
  createEmailKey,
  createLetterPair,
  decryptLetter,
  encryptForPublicKey,
  newLetterKey,
  nonExtractable,
  unlockWithEmailKey,
  unlockWithPasskey,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
  wrapForPasskey,
} from "@/lib/e2ee";
import type { LetterPasskey } from "@/lib/data/letter-keys";
import { loadLetterKey, saveLetterKey } from "@/lib/key-store";
import { PasskeyError, askLetterPasskey, createLetterPasskey, passkeysAvailable } from "@/lib/passkey";

/**
 * Everything between a person and their encrypted letters (src/lib/e2ee.ts).
 *
 * Writing needs only the public key, so it never asks for anything once letters are set up.
 * Reading needs the letter key: remembered on this device after the first unlock, otherwise
 * unlocked with fingerprint / Face ID (a passkey), the passphrase, or the key from the
 * "Your hidl letter key" email. Setup asks for nothing: it makes the keys and emails the key.
 */
type Writer = { encrypt: (text: string) => Promise<string> };
type Reader = { decrypt: (body: string) => Promise<string> };

const WriterContext = createContext<Writer | null>(null);
const ReaderContext = createContext<Reader | null>(null);

export function useLetterWriter() {
  const w = useContext(WriterContext);
  if (!w) throw new Error("useLetterWriter must be used inside <LetterKeyGate need=\"write\">.");
  return w;
}
export function useLetterReader() {
  const r = useContext(ReaderContext);
  if (!r) throw new Error("useLetterReader must be used inside <LetterKeyGate need=\"read\">.");
  return r;
}

export type KeyUser = { id: string; email: string };

export function LetterKeyGate({
  user,
  bundle: initialBundle,
  passkeys,
  need,
  children,
}: {
  user: KeyUser;
  bundle: KeyBundle | null;
  passkeys: LetterPasskey[];
  need: "write" | "read";
  children: React.ReactNode;
}) {
  const [bundle, setBundle] = useState(initialBundle);
  // undefined: still checking this device; null: not unlocked here.
  const [key, setKey] = useState<CryptoKey | null | undefined>(need === "read" && initialBundle ? undefined : null);
  // After an unlock or setup: what's left to show (the emailed key, the passkey offer).
  const [after, setAfter] = useState<AfterUnlock | null>(null);

  useEffect(() => {
    if (need !== "read" || !initialBundle) return;
    let live = true;
    loadLetterKey(user.id).then((k) => live && setKey(k));
    return () => {
      live = false;
    };
  }, [user.id, initialBundle, need]);

  const writer = useMemo<Writer | null>(() => {
    const publicKey = bundle?.public_key;
    return publicKey ? { encrypt: (text) => encryptForPublicKey(publicKey, text) } : null;
  }, [bundle?.public_key]);
  const reader = useMemo<Reader | null>(() => {
    if (!key || !bundle) return null;
    return { decrypt: (body) => decryptLetter(key, bundle, body) };
  }, [key, bundle]);

  async function unlocked(extractable: CryptoKey, current: KeyBundle) {
    const next = await finishUnlock(user, extractable, current, passkeys);
    setBundle(next.bundle);
    setKey(next.key);
    if (next.after) setAfter(next.after);
  }

  if (after) return <AfterUnlockCard user={user} after={after} onDone={() => setAfter(null)} />;

  if (need === "write") {
    if (writer) return <WriterContext.Provider value={writer}>{children}</WriterContext.Provider>;
    if (!bundle) return <SetupCard onReady={(k, b, a) => (setBundle(b), setKey(k), setAfter(a))} />;
    // An account from before the key pair: one unlock adds it, and writing never asks again.
    return <UnlockCard bundle={bundle} passkeys={passkeys} onUnlock={(k) => unlocked(k, bundle)} upgrading />;
  }

  if (!bundle) return <p className="card mx-auto max-w-lg p-5 text-center text-ink-soft">Letters aren&apos;t set up yet.</p>;
  if (key === undefined) return <p className="py-10 text-center text-muted">Unlocking your letters…</p>;
  if (reader) return <ReaderContext.Provider value={reader}>{children}</ReaderContext.Provider>;
  return <UnlockCard bundle={bundle} passkeys={passkeys} onUnlock={(k) => unlocked(k, bundle)} />;
}

// ---- after unlocking: fill in what an older account is missing, remember the key, offer a passkey

type AfterUnlock = {
  /** Set when a new email key was made: whether the email went out, and the key to save if not. */
  email?: { sent: boolean; key: string; keyText: string };
  /** The extractable letter key, kept only while the passkey offer is on screen. */
  offerPasskey?: CryptoKey;
};

async function finishUnlock(user: KeyUser, extractable: CryptoKey, bundle: KeyBundle, passkeys: LetterPasskey[]) {
  let next = bundle;
  const after: AfterUnlock = {};
  const upgrade: { pair?: Awaited<ReturnType<typeof createLetterPair>>; email?: Awaited<ReturnType<typeof createEmailKey>>["parts"] } = {};
  let emailKey: Awaited<ReturnType<typeof createEmailKey>> | null = null;
  if (!bundle.public_key) upgrade.pair = await createLetterPair(extractable);
  if (!bundle.email_wrapped_key) {
    emailKey = await createEmailKey(extractable);
    upgrade.email = emailKey.parts;
  }
  if (upgrade.pair || upgrade.email) {
    const saved = await upgradeLetterKeys(upgrade);
    if (saved.ok) {
      next = { ...bundle, ...upgrade.pair, ...upgrade.email };
      if (emailKey) {
        const sent = await emailLetterKey({ key: emailKey.emailKey });
        after.email = { sent: sent.ok, key: emailKey.emailKey, keyText: emailKey.emailKeyText };
      }
    }
  }
  const key = await nonExtractable(extractable);
  await saveLetterKey(user.id, key);
  if (passkeys.length === 0 && (await passkeysAvailable())) after.offerPasskey = extractable;
  return { key, bundle: next, after: after.email || after.offerPasskey ? after : null };
}

function AfterUnlockCard({ user, after, onDone }: { user: KeyUser; after: AfterUnlock; onDone: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState(after.email);
  const [passkey, setPasskey] = useState<"offer" | "busy" | "done" | null>(after.offerPasskey ? "offer" : null);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    if (!email) return;
    setError(null);
    const sent = await emailLetterKey({ key: email.key });
    if (sent.ok) setEmail({ ...email, sent: true });
    else setError(sent.message);
  }

  async function addPasskey() {
    if (!after.offerPasskey) return;
    setError(null);
    setPasskey("busy");
    try {
      const { credentialId, secret } = await createLetterPasskey(user);
      const saved = await addLetterPasskey({ credential_id: credentialId, wrapped_key: await wrapForPasskey(after.offerPasskey, secret) });
      if (!saved.ok) throw new PasskeyError("failed", saved.message);
      setPasskey("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof PasskeyError ? e.message : "Couldn't add the passkey.");
      setPasskey("offer");
    }
  }

  return (
    <GateCard mood="cheer" eyebrow="private letters" title="You're all set">
      {email &&
        (email.sent ? (
          <Note icon="✉️">
            We emailed your <strong className="text-ink">letter key</strong> to {user.email}. Keep that email: it opens your
            letters on any device, even years from now.
          </Note>
        ) : (
          <div className="rounded-control border-2 border-aqua bg-mint p-4">
            <p className="text-sm font-semibold text-ink">
              We couldn&apos;t email your letter key. Save it somewhere safe: it opens your letters on a new device.
            </p>
            <p className="mt-2 font-mono text-[15px] leading-relaxed font-bold tracking-wide break-all text-ocean select-all">
              {email.keyText}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-ghost min-h-10" onClick={() => navigator.clipboard?.writeText(email.keyText)}>
                Copy
              </button>
              <button type="button" className="btn btn-ghost min-h-10" onClick={resend}>
                Try the email again
              </button>
            </div>
          </div>
        ))}

      {passkey && (
        <div className="mt-4 flex items-center gap-4 rounded-control bg-ice-soft p-4">
          <FingerprintIcon className="size-10 shrink-0 text-ice" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">{passkey === "done" ? "Fingerprint / Face ID is on" : "Open letters with your fingerprint"}</p>
            <p className="text-sm text-ink-soft">
              {passkey === "done" ? "Next time, just touch or look." : "Saved in your Apple or Google account, so it moves to your next phone."}
            </p>
          </div>
          {passkey !== "done" && (
            <button type="button" className="btn btn-primary min-h-10 shrink-0" onClick={addPasskey} disabled={passkey === "busy"}>
              {passkey === "busy" ? "…" : "Turn on"}
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-control bg-accent-soft px-3 py-2 text-sm">{error}</p>}
      <div className="mt-5 flex justify-end">
        <button type="button" className="btn btn-primary" onClick={onDone}>
          {passkey === "offer" ? "Not now" : "Continue"}
        </button>
      </div>
    </GateCard>
  );
}

// ---- first-time setup: nothing to choose or remember

function SetupCard({ onReady }: { onReady: (key: CryptoKey, bundle: KeyBundle, after: AfterUnlock) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setup() {
    setError(null);
    setBusy(true);
    try {
      const extractable = await newLetterKey();
      const pair = await createLetterPair(extractable);
      const emailKey = await createEmailKey(extractable);
      const saved = await setupLetterKeys({ ...pair, ...emailKey.parts });
      if (!saved.ok) throw new Error(saved.message);
      const sent = await emailLetterKey({ key: emailKey.emailKey });
      const key = await nonExtractable(extractable);
      const bundle: KeyBundle = {
        kdf_salt: null,
        kdf_iterations: null,
        passphrase_wrapped_key: null,
        recovery_wrapped_key: null,
        ...pair,
        ...emailKey.parts,
      };
      onReady(key, bundle, {
        email: { sent: sent.ok, key: emailKey.emailKey, keyText: emailKey.emailKeyText },
        offerPasskey: (await passkeysAvailable()) ? extractable : undefined,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <GateCard mood="wave" eyebrow="private letters" title="Only you can read them">
      <div className="space-y-3">
        <Note icon="🔒">Letters are locked on this device before they&apos;re saved. Not even hidl can read them.</Note>
        <Note icon="✉️">We email you a letter key. It opens your letters on any device, even years from now.</Note>
        <Note icon="👆">Then open them with your fingerprint or Face ID. Nothing to remember.</Note>
      </div>
      {error && <p role="alert" className="mt-4 rounded-control bg-accent-soft px-3 py-2 text-sm">{error}</p>}
      <button type="button" className="btn btn-primary mt-5 w-full" onClick={setup} disabled={busy}>
        {busy ? "Setting up…" : "Turn on private letters"}
      </button>
    </GateCard>
  );
}

// ---- unlocking: passkey, passphrase, the email key, or the old recovery key

type Way = "passkey" | "passphrase" | "email" | "recovery";

export function UnlockCard({
  bundle,
  passkeys,
  onUnlock,
  upgrading = false,
  title = "Unlock your letters",
}: {
  bundle: KeyBundle;
  passkeys: LetterPasskey[];
  /** Gets an extractable letter key (so new ways in can be added right after). */
  onUnlock: (key: CryptoKey) => Promise<void>;
  upgrading?: boolean;
  title?: string;
}) {
  const id = useId();
  const [canPasskey, setCanPasskey] = useState(false);
  const ways: Way[] = [
    ...(passkeys.length > 0 && canPasskey ? (["passkey"] as const) : []),
    ...(bundle.passphrase_wrapped_key ? (["passphrase"] as const) : []),
    ...(bundle.email_wrapped_key ? (["email"] as const) : []),
    ...(bundle.recovery_wrapped_key ? (["recovery"] as const) : []),
  ];
  const [chosen, setChosen] = useState<Way | null>(null);
  const way = chosen && ways.includes(chosen) ? chosen : ways[0];
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (passkeys.length === 0) return;
    let live = true;
    passkeysAvailable().then((ok) => live && setCanPasskey(ok));
    return () => {
      live = false;
    };
  }, [passkeys.length]);

  async function attempt(fn: () => Promise<CryptoKey>) {
    setError(null);
    setBusy(true);
    try {
      await onUnlock(await fn());
    } catch (e) {
      setError(e instanceof WrongSecretError || e instanceof PasskeyError ? e.message : "Couldn't unlock. Try again.");
      setBusy(false);
    }
  }

  function tryPasskey() {
    return attempt(async () => {
      const { credentialId, secret: prf } = await askLetterPasskey(passkeys.map((p) => p.credential_id));
      const match = passkeys.find((p) => p.credential_id === credentialId);
      if (!match) throw new WrongSecretError("passkey");
      return unlockWithPasskey(match.wrapped_key, prf, true);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (way === "passphrase") return attempt(() => unlockWithPassphrase(bundle, secret, true));
    if (way === "email") return attempt(() => unlockWithEmailKey(bundle, secret, true));
    if (way === "recovery") return attempt(() => unlockWithRecoveryKey(bundle, secret, true));
  }

  const others = ways.filter((w) => w !== way);

  return (
    <GateCard mood="curious" eyebrow="private letters" title={title}>
      {upgrading && (
        <p className="mb-4 text-sm text-ink-soft">One last time: after this, writing a letter never asks again.</p>
      )}

      {way === "passkey" ? (
        <button type="button" onClick={tryPasskey} disabled={busy}
          className="flex w-full flex-col items-center gap-2 rounded-card bg-ice-soft px-4 py-6 text-ice transition-transform active:scale-[0.99]">
          <FingerprintIcon className="size-14" />
          <span className="font-display text-lg font-bold text-ink">{busy ? "Checking…" : "Use fingerprint or Face ID"}</span>
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {way === "passphrase" ? (
            <PassField id={`${id}-p`} label="Passphrase" value={secret} onChange={setSecret} autoComplete="current-password" autoFocus />
          ) : (
            <div>
              <label htmlFor={`${id}-k`} className="mb-1.5 block text-sm font-semibold text-ink-soft">
                {way === "email" ? "Key from your email" : "Recovery key"}
              </label>
              <textarea id={`${id}-k`} rows={2} className="field font-mono" value={secret} autoFocus spellCheck={false}
                autoCapitalize="characters" onChange={(e) => setSecret(e.target.value)} placeholder="XXXX-XXXX-…" />
              {way === "email" && (
                <p className="mt-2 text-sm text-muted">
                  Search your inbox for &ldquo;Your hidl letter key&rdquo;. Tapping the button in it works too.
                </p>
              )}
            </div>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={busy || !secret}>
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </form>
      )}

      {error && <p role="alert" className="mt-3 rounded-control bg-accent-soft px-3 py-2 text-sm">{error}</p>}

      {others.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
          {others.map((w) => (
            <button key={w} type="button" className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
              onClick={() => { setChosen(w); setSecret(""); setError(null); }}>
              {{ passkey: "Use fingerprint or Face ID", passphrase: "Use your passphrase", email: "Forgot it? Use your email", recovery: "Use your recovery key" }[w]}
            </button>
          ))}
        </div>
      )}
    </GateCard>
  );
}

// ---- the link in the "Your hidl letter key" email: /letters/key#k=…

export function LetterKeyLink({ user, bundle, passkeys }: { user: KeyUser; bundle: KeyBundle | null; passkeys: LetterPasskey[] }) {
  const [state, setState] = useState<"checking" | "missing" | "wrong" | "after" | "done">("checking");
  const [after, setAfter] = useState<AfterUnlock | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    // Once: the key is read from the address bar and then removed from it.
    if (ran.current) return;
    ran.current = true;
    const k = new URLSearchParams(location.hash.slice(1)).get("k");
    // Off the address bar (and out of history) straight away.
    history.replaceState(null, "", location.pathname);
    if (!k || !bundle) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("missing");
      return;
    }
    unlockWithEmailKey(bundle, k, true)
      .then((extractable) => finishUnlock(user, extractable, bundle, passkeys))
      .then((r) => {
        setAfter(r.after);
        setState(r.after ? "after" : "done");
      })
      .catch(() => setState("wrong"));
  }, [user, bundle, passkeys]);

  if (state === "checking") return <p className="py-10 text-center text-muted">Unlocking your letters…</p>;
  if (state === "after" && after) return <AfterUnlockCard user={user} after={after} onDone={() => setState("done")} />;
  if (state === "done") {
    return (
      <GateCard mood="cheer" eyebrow="private letters" title="Letters unlocked">
        <p className="text-ink-soft">Your letters open on this device now.</p>
        <Link href="/letters" className="btn btn-primary mt-5 w-full">Go to your letters</Link>
      </GateCard>
    );
  }
  return (
    <GateCard mood="curious" eyebrow="private letters" title="That link didn't work">
      <p className="text-ink-soft">
        {state === "wrong"
          ? "This key doesn't match your letters. Use the newest \"Your hidl letter key\" email, and make sure you're signed in to the same account."
          : "Open the link from your \"Your hidl letter key\" email, or type the key in when a letter asks."}
      </p>
      <Link href="/letters" className="btn btn-ghost mt-5 w-full">Go to your letters</Link>
    </GateCard>
  );
}

// ---- bits

function GateCard({ mood, eyebrow, title, children }: { mood: "curious" | "cheer" | "wave"; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="card animate-fade-up mx-auto max-w-md p-5 sm:p-7">
      <div className="mb-5 flex flex-col items-center text-center">
        <Mascot mood={mood} size={72} />
        <p className="eyebrow mt-2">{eyebrow}</p>
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Note({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-ink-soft">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-mint text-lg">{icon}</span>
      <span className="pt-1.5">{children}</span>
    </div>
  );
}

export function FingerprintIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
      <path d="M6.5 5.6A8 8 0 0 1 20 11.5v1" />
      <path d="M4 9.5a8 8 0 0 0-.2 1.9c0 2 .4 3.6 1 5" />
      <path d="M8.2 19.4c-.9-1.9-1.4-4.6-1.4-7.6a5.2 5.2 0 0 1 10.4 0c0 1.2 0 2.3-.2 3.3" />
      <path d="M12 11.6c0 3.4.6 6.4 1.9 8.6" />
      <path d="M9.6 11.8c0 3 .5 5.9 1.4 8" />
      <path d="M14.4 11.6c0 1.7.2 3.4.5 4.9" />
      <path d="M16.9 17.9c.3.8.7 1.5 1.1 2.1" />
    </svg>
  );
}

export function PassField({ id, label, hint, value, onChange, autoComplete, autoFocus }: {
  id: string; label: string; hint?: string; value: string; onChange: (v: string) => void;
  autoComplete: string; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-soft">
        {label} {hint && <span className="font-normal text-muted">· {hint}</span>}
      </label>
      <div className="relative">
        <input id={id} type={show ? "text" : "password"} className="field pr-16" value={value} autoFocus={autoFocus}
          autoComplete={autoComplete} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-control px-2 py-1 text-sm font-semibold text-accent hover:bg-mint">
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
