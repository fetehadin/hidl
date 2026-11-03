"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { changePassphrase } from "@/actions/encryption";
import { PassField } from "@/components/letters/letter-key";
import { type KeyBundle, MIN_PASSPHRASE, WrongSecretError, rewrapWithNewPassphrase } from "@/lib/e2ee";

/**
 * Account page card: whether letter encryption is on, and changing the passphrase. Changing it
 * re-wraps the same letter key, so every existing letter still opens; it needs the current
 * passphrase or the recovery key (that's also how a forgotten passphrase gets reset).
 */
export function LetterEncryption({ bundle }: { bundle: KeyBundle | null }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"passphrase" | "recovery">("passphrase");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!bundle) {
    return (
      <p className="text-ink-soft">
        Not set up yet. You&apos;ll choose a passphrase the first time you{" "}
        <Link href="/letters/new" className="font-semibold text-accent underline-offset-4 hover:underline">
          write a letter
        </Link>
        .
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < MIN_PASSPHRASE) return setError(`Use at least ${MIN_PASSPHRASE} characters.`);
    if (next !== again) return setError("The new passphrases don't match.");
    setError(null);
    setBusy(true);
    try {
      const update = await rewrapWithNewPassphrase(
        bundle!,
        mode === "passphrase" ? { passphrase: current } : { recoveryKey: current },
        next,
      );
      const saved = await changePassphrase(update);
      if (!saved.ok) throw new Error(saved.message);
      setDone(true);
      setOpen(false);
      setCurrent("");
      setNext("");
      setAgain("");
      router.refresh();
    } catch (err) {
      setError(err instanceof WrongSecretError || err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-ink-soft">
        <span className="mr-2 rounded-full bg-mint px-2.5 py-0.5 text-sm font-bold text-ocean">On</span>
        New letters are encrypted on your device. Only your passphrase or recovery key can open them.
      </p>
      {done && <p role="status" className="mt-3 text-sm font-semibold text-ocean">Passphrase changed.</p>}

      {!open ? (
        <button type="button" className="btn btn-ghost mt-4" onClick={() => { setOpen(true); setDone(false); }}>
          Change passphrase
        </button>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4">
          {mode === "passphrase" ? (
            <PassField id={`${id}-c`} label="Current passphrase" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
          ) : (
            <div>
              <label htmlFor={`${id}-r`} className="mb-1.5 block text-sm font-semibold text-ink-soft">Recovery key</label>
              <textarea id={`${id}-r`} rows={2} className="field font-mono" value={current} autoFocus spellCheck={false}
                onChange={(e) => setCurrent(e.target.value)} placeholder="XXXX-XXXX-…" />
            </div>
          )}
          <button type="button" className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
            onClick={() => { setMode(mode === "passphrase" ? "recovery" : "passphrase"); setCurrent(""); setError(null); }}>
            {mode === "passphrase" ? "Forgot it? Use your recovery key" : "Use your current passphrase instead"}
          </button>
          <PassField id={`${id}-n`} label="New passphrase" hint={`at least ${MIN_PASSPHRASE} characters`} value={next}
            onChange={setNext} autoComplete="new-password" />
          <PassField id={`${id}-a`} label="Type it again" value={again} onChange={setAgain} autoComplete="new-password" />
          {error && <p role="alert" className="rounded-control bg-accent-soft px-3 py-2 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setError(null); }} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !current}>
              {busy ? "Saving…" : "Save passphrase"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
