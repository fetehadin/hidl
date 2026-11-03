"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useId, useState } from "react";
import { setupLetterKey } from "@/actions/encryption";
import { Mascot } from "@/components/mascot";
import {
  type KeyBundle,
  MIN_PASSPHRASE,
  WrongSecretError,
  createKeyBundle,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from "@/lib/e2ee";
import { loadLetterKey, saveLetterKey } from "@/lib/key-store";

/**
 * Wraps anything that needs the letter key (writing a letter, reading an encrypted one).
 * Shows first-time setup, or an unlock prompt, until the key is available on this device;
 * then renders its children with the key in context (useLetterKey).
 */
const LetterKeyContext = createContext<CryptoKey | null>(null);

export function useLetterKey() {
  const key = useContext(LetterKeyContext);
  if (!key) throw new Error("useLetterKey must be used inside <LetterKeyGate>.");
  return key;
}

export function LetterKeyGate({
  userId,
  bundle,
  children,
}: {
  userId: string;
  bundle: KeyBundle | null;
  children: React.ReactNode;
}) {
  // undefined: still checking this device; null: not unlocked here yet.
  const [key, setKey] = useState<CryptoKey | null | undefined>(bundle ? undefined : null);
  const [recovery, setRecovery] = useState<string | null>(null);

  useEffect(() => {
    // A remembered key only counts if the account actually has one set up.
    if (!bundle) return;
    let live = true;
    loadLetterKey(userId).then((k) => live && setKey(k));
    return () => {
      live = false;
    };
  }, [userId, bundle]);

  async function unlocked(k: CryptoKey) {
    await saveLetterKey(userId, k);
    setKey(k);
  }

  if (key === undefined) {
    return <p className="py-10 text-center text-muted">Unlocking your letters…</p>;
  }
  if (recovery) {
    return <RecoveryKeyShown recoveryKey={recovery} onDone={() => setRecovery(null)} />;
  }
  if (key) return <LetterKeyContext.Provider value={key}>{children}</LetterKeyContext.Provider>;
  if (!bundle) {
    return (
      <SetupPassphrase
        onDone={async (k, recoveryKey) => {
          await unlocked(k);
          setRecovery(recoveryKey);
        }}
      />
    );
  }
  return <UnlockPrompt bundle={bundle} onUnlock={unlocked} />;
}

function GateCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="card mx-auto max-w-lg p-5 sm:p-7">
      <div className="mb-4 flex items-center gap-3">
        <Mascot mood="curious" size={56} float={false} />
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
        </div>
      </div>
      {children}
    </div>
  );
}

function SetupPassphrase({ onDone }: { onDone: (key: CryptoKey, recoveryKey: string) => Promise<void> }) {
  const router = useRouter();
  const id = useId();
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pass.length < MIN_PASSPHRASE) return setError(`Use at least ${MIN_PASSPHRASE} characters.`);
    if (pass !== again) return setError("The two passphrases don't match.");
    setError(null);
    setBusy(true);
    try {
      const { bundle, recoveryKey, letterKey } = await createKeyBundle(pass);
      const saved = await setupLetterKey(bundle);
      if (!saved.ok) throw new Error(saved.message);
      await onDone(letterKey, recoveryKey);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GateCard eyebrow="private letters" title="Choose a passphrase">
      <p className="text-ink-soft">
        Your letters are encrypted on this device before they&apos;re saved. Only this passphrase, or the recovery key
        you&apos;ll get next, can open them: not hidl, not the server, not anyone with the database.
      </p>
      <p className="mt-2 text-sm font-semibold text-wax">
        If you lose both, your letters can never be opened. There&apos;s no reset.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <PassField id={`${id}-p`} label="Passphrase" hint={`at least ${MIN_PASSPHRASE} characters`} value={pass}
          onChange={setPass} autoComplete="new-password" autoFocus />
        <PassField id={`${id}-a`} label="Type it again" value={again} onChange={setAgain} autoComplete="new-password" />
        <p className="text-sm text-muted">A few unrelated words is easy to remember and hard to guess.</p>
        {error && <p role="alert" className="rounded-control bg-accent-soft px-3 py-2 text-sm">{error}</p>}
        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Setting up…" : "Turn on encryption"}
          </button>
        </div>
      </form>
    </GateCard>
  );
}

function RecoveryKeyShown({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  function download() {
    const text = `hidl recovery key\n\n${recoveryKey}\n\nThis unlocks your hidl letters if you forget your passphrase.\nKeep it somewhere safe and private.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "hidl-recovery-key.txt" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <GateCard eyebrow="write this down" title="Your recovery key">
      <p className="text-ink-soft">
        If you ever forget your passphrase, this key is the only other way to open your letters. It&apos;s shown{" "}
        <strong className="text-ink">once</strong>. Save it somewhere safe that isn&apos;t this app: a password
        manager, or on paper.
      </p>
      <p className="mt-4 rounded-control border-2 border-aqua bg-mint px-4 py-3 text-center font-mono text-[15px] leading-relaxed font-bold tracking-wide break-all text-ocean select-all">
        {recoveryKey}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost min-h-10"
          onClick={() => navigator.clipboard?.writeText(recoveryKey).then(() => setCopied(true), () => {})}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" className="btn btn-ghost min-h-10" onClick={download}>
          Download as a file
        </button>
      </div>
      <label className="mt-5 flex items-start gap-3 text-ink">
        <input type="checkbox" className="mt-1 size-5 accent-[var(--teal)]" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>I&apos;ve saved my recovery key somewhere safe.</span>
      </label>
      <div className="mt-5 flex justify-end">
        <button type="button" className="btn btn-primary" disabled={!saved} onClick={onDone}>
          Continue
        </button>
      </div>
    </GateCard>
  );
}

function UnlockPrompt({ bundle, onUnlock }: { bundle: KeyBundle; onUnlock: (key: CryptoKey) => Promise<void> }) {
  const id = useId();
  const [mode, setMode] = useState<"passphrase" | "recovery">("passphrase");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const key =
        mode === "passphrase" ? await unlockWithPassphrase(bundle, secret) : await unlockWithRecoveryKey(bundle, secret);
      await onUnlock(key);
    } catch (err) {
      setError(err instanceof WrongSecretError ? err.message : "Couldn't unlock. Try again.");
      setBusy(false);
    }
  }

  return (
    <GateCard eyebrow="private letters" title="Unlock your letters">
      <p className="text-ink-soft">
        {mode === "passphrase"
          ? "Enter your passphrase. It stays unlocked on this device until you sign out."
          : "Enter the recovery key you saved when you turned on encryption. Afterwards, set a new passphrase on your Account page."}
      </p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {mode === "passphrase" ? (
          <PassField id={`${id}-p`} label="Passphrase" value={secret} onChange={setSecret} autoComplete="current-password" autoFocus />
        ) : (
          <div>
            <label htmlFor={`${id}-r`} className="mb-1.5 block text-sm font-semibold text-ink-soft">Recovery key</label>
            <textarea id={`${id}-r`} rows={2} className="field font-mono" value={secret} autoFocus spellCheck={false}
              autoCapitalize="characters" onChange={(e) => setSecret(e.target.value)} placeholder="XXXX-XXXX-…" />
          </div>
        )}
        {error && <p role="alert" className="rounded-control bg-accent-soft px-3 py-2 text-sm">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
            onClick={() => {
              setMode(mode === "passphrase" ? "recovery" : "passphrase");
              setSecret("");
              setError(null);
            }}>
            {mode === "passphrase" ? "Forgot it? Use your recovery key" : "Use your passphrase instead"}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !secret}>
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </div>
      </form>
    </GateCard>
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
