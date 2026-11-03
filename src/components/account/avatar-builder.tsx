"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetAvatar, setAvatar } from "@/actions/preferences";
import { Avatar } from "@/components/avatar";
import { AVATAR_PARTS, type AvatarConfig, type AvatarPart, PART_LABELS, optionLabel, randomAvatar } from "@/lib/avatar";

const PARTS = Object.keys(AVATAR_PARTS) as AvatarPart[];

/** Account page: build your buddy. Every option previews on your current buddy. */
export function AvatarBuilder({ initial, hasBuddy }: { initial: AvatarConfig; hasBuddy: boolean }) {
  const router = useRouter();
  const [config, setConfig] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [part, setPart] = useState<AvatarPart>("theme");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState(hasBuddy);
  // Before the first save there's nothing to compare with: saving the default look is a choice too.
  const dirty = !chosen || PARTS.some((p) => config[p] !== saved[p]);

  function choose(value: string) {
    setMessage(null);
    setConfig((c) => ({ ...c, [part]: value }) as AvatarConfig);
  }

  function save() {
    startTransition(async () => {
      const result = await setAvatar(config);
      if (!result.ok) return setMessage(result.message);
      setSaved(config);
      setChosen(true);
      setMessage("Saved. Say hi to your buddy!");
      router.refresh();
    });
  }

  function backToHidi() {
    startTransition(async () => {
      const result = await resetAvatar();
      if (!result.ok) return setMessage(result.message);
      setChosen(false);
      setMessage("Hidi's back.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[12rem_1fr]">
      <div className="flex flex-col items-center gap-3">
        <Avatar config={config} size={168} label="Your avatar" className="rounded-full ring-4 ring-aqua" />
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-ghost min-h-10 px-3 text-sm" onClick={() => { setConfig(randomAvatar()); setMessage(null); }}>
            Surprise me
          </button>
          {chosen && dirty && (
            <button type="button" className="btn btn-ghost min-h-10 px-3 text-sm" onClick={() => setConfig(saved)}>
              Undo changes
            </button>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div role="tablist" aria-label="Avatar parts" className="flex flex-wrap gap-1.5">
          {PARTS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={part === p}
              onClick={() => setPart(p)}
              className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-bold transition-colors ${
                part === p ? "border-teal bg-mint text-ocean" : "border-aqua bg-white text-muted hover:text-ocean"
              }`}
            >
              {PART_LABELS[p]}
            </button>
          ))}
        </div>

        <div role="tabpanel" aria-label={PART_LABELS[part]} className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
          {(AVATAR_PARTS[part] as readonly string[]).map((value) => {
            const selected = config[part] === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => choose(value)}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-2 transition-colors ${
                  selected ? "border-teal bg-mint" : "border-aqua bg-white hover:bg-mint/60"
                }`}
              >
                <Avatar config={{ ...config, [part]: value } as AvatarConfig} size={56} className="rounded-full" />
                <span className={`text-xs font-bold ${selected ? "text-ocean" : "text-muted"}`}>{optionLabel(part, value)}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          {message && (
            <p role="status" className="mr-auto text-sm font-semibold text-ocean">
              {message}
            </p>
          )}
          {chosen && (
            <button type="button" className="btn btn-ghost" onClick={backToHidi} disabled={pending}>
              Go back to Hidi
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || pending}>
            {pending ? "Saving…" : "Save avatar"}
          </button>
        </div>
      </div>
    </div>
  );
}
