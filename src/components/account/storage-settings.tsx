"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_STORAGE,
  KEEP_OPTIONS,
  LIMIT_OPTIONS,
  type StorageSettings as Settings,
  clearSaved,
  formatBytes,
  readStorageSettings,
  savedBytes,
  writeStorageSettings,
} from "@/lib/offline-storage";

/**
 * Storage on this phone (Account → Preferences), like Telegram's "Data and Storage": how much the
 * offline copies take, a Clear button, how long unused photos stay, a space limit, and whether full
 * photos are kept on mobile data. Per device; the service worker (public/sw.js) applies it.
 */
export function StorageSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_STORAGE);
  const [used, setUsed] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const supported = typeof window === "undefined" || "caches" in window;

  useEffect(() => {
    readStorageSettings().then(setSettings);
    savedBytes().then(setUsed, () => setUsed(0));
  }, []);

  async function change(next: Partial<Settings>) {
    const s = { ...settings, ...next };
    setSettings(s);
    setNote(null);
    await writeStorageSettings(s).catch(() => setNote("Couldn't save that on this device."));
    // A shorter time or smaller limit frees space at once; show the new total shortly after.
    setTimeout(() => savedBytes().then(setUsed, () => {}), 1500);
  }

  async function clear() {
    setBusy(true);
    await clearSaved().catch(() => {});
    setUsed(await savedBytes().catch(() => 0));
    setBusy(false);
    setNote("Cleared. Everything is still safe in your account and comes back as you use Hidl.");
  }

  if (!supported) return <p className="text-sm text-muted">This browser can&apos;t keep anything for offline use.</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-mint px-4 py-3">
        <span>
          <span className="block text-sm font-semibold text-ink-soft">Saved on this phone</span>
          <span className="block font-display text-2xl font-extrabold text-ocean tabular-nums">
            {used === null ? "…" : formatBytes(used)}
          </span>
        </span>
        <button type="button" onClick={clear} disabled={busy || !used} className="btn btn-ghost min-h-10 px-4">
          {busy ? "Clearing…" : "Clear"}
        </button>
      </div>
      {note && (
        <p role="status" className="-mt-2 text-sm text-ink-soft">
          {note}
        </p>
      )}

      <Choice
        label="Keep photos not opened for"
        options={KEEP_OPTIONS}
        value={settings.keepDays}
        onChange={(keepDays) => change({ keepDays })}
      />
      <Choice label="Space limit" options={LIMIT_OPTIONS} value={settings.maxMB} onChange={(maxMB) => change({ maxMB })} />
      <Choice
        label="On mobile data, save"
        options={[
          { value: 0, label: "Previews only" },
          { value: 1, label: "Full photos" },
        ]}
        value={settings.fullOnMobile ? 1 : 0}
        onChange={(v) => change({ fullOnMobile: v === 1 })}
      />
      <p className="text-sm text-muted">
        Hidl saves what you&apos;ve seen so it opens without internet. Letters are never saved on the phone.
      </p>
    </div>
  );
}

function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: number; label: string }[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink-soft">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex rounded-full bg-paper-deep p-1">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => !active && onChange(o.value)}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-bold transition-colors ${
                active ? "bg-teal text-accent-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
