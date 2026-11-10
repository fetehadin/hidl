"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { addLetterPasskey, changePassphrase, emailLetterKey, removeLetterPasskey, replaceEmailKey } from "@/actions/encryption";
import { FingerprintIcon, PassField, type KeyUser, UnlockCard } from "@/components/letters/letter-key";
import type { LetterPasskey } from "@/lib/data/letter-keys";
import { type KeyBundle, MIN_PASSPHRASE, createEmailKey, passphraseParts, wrapForPasskey } from "@/lib/e2ee";
import { PasskeyError, createLetterPasskey } from "@/lib/passkey";

type Action = "passkey" | "passphrase" | "email";

/**
 * Account page card: the ways into private letters (fingerprint / Face ID, passphrase, the
 * letter key email) and changing them. Adding or changing one needs the letter key, so it asks
 * to unlock first, with any way that already works.
 */
export function LetterEncryption({ user, bundle, passkeys }: { user: KeyUser; bundle: KeyBundle | null; passkeys: LetterPasskey[] }) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!bundle) {
    return (
      <p className="text-ink-soft">
        Turns on the first time you{" "}
        <Link href="/letters/new" className="font-semibold text-accent underline-offset-4 hover:underline">
          write a letter
        </Link>
        . Nothing to choose or remember.
      </p>
    );
  }

  function start(a: Action) {
    setAction(a);
    setKey(null);
    setStatus(null);
    setError(null);
  }
  function finish(message: string) {
    setAction(null);
    setKey(null);
    setStatus(message);
    router.refresh();
  }

  async function run(a: Action, letterKey: CryptoKey) {
    setError(null);
    try {
      if (a === "passkey") {
        const { credentialId, secret } = await createLetterPasskey(user);
        const saved = await addLetterPasskey({ credential_id: credentialId, wrapped_key: await wrapForPasskey(letterKey, secret) });
        if (!saved.ok) throw new Error(saved.message);
        finish("Fingerprint / Face ID now opens your letters.");
      } else if (a === "email") {
        const fresh = await createEmailKey(letterKey);
        const saved = await replaceEmailKey(fresh.parts);
        if (!saved.ok) throw new Error(saved.message);
        const sent = await emailLetterKey({ key: fresh.emailKey });
        finish(sent.ok ? `New letter key sent to ${user.email}. Older key emails no longer work.` : `Couldn't email it. Save this key: ${fresh.emailKeyText}`);
      } else {
        setKey(letterKey); // the passphrase form needs it
      }
    } catch (e) {
      setError(e instanceof PasskeyError || e instanceof Error ? e.message : "Something went wrong.");
      setAction(null);
    }
  }

  if (action && !key) {
    return (
      <div>
        <UnlockCard bundle={bundle} passkeys={passkeys} title="First, unlock your letters" onUnlock={async (k) => run(action, k)} />
        <button type="button" className="mx-auto mt-3 block text-sm font-semibold text-muted hover:text-ink" onClick={() => setAction(null)}>
          Cancel
        </button>
      </div>
    );
  }
  if (action === "passphrase" && key) {
    return <PassphraseForm letterKey={key} hasOne={Boolean(bundle.passphrase_wrapped_key)} onDone={finish} onCancel={() => setAction(null)} />;
  }

  return (
    <div>
      <p className="text-ink-soft">
        <span className="mr-2 rounded-full bg-mint px-2.5 py-0.5 text-sm font-bold text-ocean">On</span>
        Letters are encrypted on your device. Only these can open them:
      </p>
      {status && <p role="status" className="mt-3 rounded-control bg-mint px-3 py-2 text-sm font-semibold text-ocean break-words">{status}</p>}
      {error && <p role="alert" className="mt-3 rounded-control bg-accent-soft px-3 py-2 text-sm">{error}</p>}

      <ul className="mt-4 divide-y divide-line rounded-control border border-line">
        <Row
          icon={<FingerprintIcon className="size-5" />}
          title="Fingerprint / Face ID"
          detail={passkeys.length ? `${passkeys.length} ${passkeys.length === 1 ? "passkey" : "passkeys"}` : "Off"}
          action={<RowButton onClick={() => start("passkey")}>{passkeys.length ? "Add another" : "Turn on"}</RowButton>}
        >
          {passkeys.length > 0 && (
            <ul className="mt-2 space-y-1">
              {passkeys.map((p, i) => (
                <PasskeyItem key={p.credential_id} passkey={p} index={i} onRemoved={() => finish("Passkey removed.")} />
              ))}
            </ul>
          )}
        </Row>
        <Row
          icon={<span aria-hidden>✉️</span>}
          title="Letter key email"
          detail={bundle.email_wrapped_key ? `Sent to ${user.email}` : "Not sent yet"}
          action={<RowButton onClick={() => start("email")}>{bundle.email_wrapped_key ? "Send a new one" : "Send it"}</RowButton>}
        />
        <Row
          icon={<span aria-hidden>🔑</span>}
          title="Passphrase"
          detail={bundle.passphrase_wrapped_key ? "Set" : "None (optional)"}
          action={<RowButton onClick={() => start("passphrase")}>{bundle.passphrase_wrapped_key ? "Change" : "Add one"}</RowButton>}
        />
      </ul>
    </div>
  );
}

function Row({ icon, title, detail, action, children }: { icon: React.ReactNode; title: string; detail: string; action: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-mint text-accent">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{title}</span>
          <span className="block truncate text-sm text-muted">{detail}</span>
        </span>
        {action}
      </div>
      {children}
    </li>
  );
}

function RowButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 rounded-control px-3 py-2 text-sm font-bold text-accent hover:bg-mint">
      {children}
    </button>
  );
}

function PasskeyItem({ passkey, index, onRemoved }: { passkey: LetterPasskey; index: number; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex items-center gap-2 pl-12 text-sm text-ink-soft">
      <span className="flex-1">
        Passkey {index + 1} · added {new Date(passkey.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
      </span>
      <button
        type="button"
        disabled={busy}
        className="font-semibold text-wax hover:underline"
        onClick={async () => {
          setBusy(true);
          const res = await removeLetterPasskey(passkey.credential_id);
          setBusy(false);
          if (res.ok) onRemoved();
        }}
      >
        Remove
      </button>
    </li>
  );
}

function PassphraseForm({ letterKey, hasOne, onDone, onCancel }: { letterKey: CryptoKey; hasOne: boolean; onDone: (m: string) => void; onCancel: () => void }) {
  const id = useId();
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < MIN_PASSPHRASE) return setError(`Use at least ${MIN_PASSPHRASE} characters.`);
    if (next !== again) return setError("The two passphrases don't match.");
    setError(null);
    setBusy(true);
    const saved = await changePassphrase(await passphraseParts(letterKey, next));
    setBusy(false);
    if (saved.ok) onDone(hasOne ? "Passphrase changed." : "Passphrase added.");
    else setError(saved.message);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PassField id={`${id}-n`} label={hasOne ? "New passphrase" : "Passphrase"} hint={`at least ${MIN_PASSPHRASE} characters`} value={next}
        onChange={setNext} autoComplete="new-password" autoFocus />
      <PassField id={`${id}-a`} label="Type it again" value={again} onChange={setAgain} autoComplete="new-password" />
      {error && <p role="alert" className="rounded-control bg-accent-soft px-3 py-2 text-sm">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save passphrase"}</button>
      </div>
    </form>
  );
}
