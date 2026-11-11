"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetAvatar, setAvatar } from "@/actions/preferences";
import { Avatar } from "@/components/avatar";
import { AVATAR_PARTS, AVATAR_THEMES, type AvatarConfig, type AvatarPart, PART_LABELS, optionLabel, randomAvatar } from "@/lib/avatar";

const PARTS = Object.keys(AVATAR_PARTS) as AvatarPart[];

/** A small line icon per tab, so the parts read at a glance (like other avatar makers). */
function PartIcon({ part }: { part: AvatarPart }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  switch (part) {
    case "theme": // a paint drop
      return <svg {...common}><path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z" /></svg>;
    case "eyes":
      return <svg {...common}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></svg>;
    case "mouth":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2.5 4 2.5 4-2.5 4-2.5" /><path d="M9 9.5h.01M15 9.5h.01" /></svg>;
    case "top": // ears on a head
      return <svg {...common}><path d="M6.5 10 5 3.5l5 3.6M17.5 10 19 3.5l-5 3.6" /><circle cx="12" cy="14" r="6.5" /></svg>;
    case "extra": // glasses
      return <svg {...common}><circle cx="6.5" cy="14" r="3.5" /><circle cx="17.5" cy="14" r="3.5" /><path d="M10 14h4M3 14 4.5 8M21 14l-1.5-6" /></svg>;
    case "bg":
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m3 16 5-5 4 4 3-3 6 6" /></svg>;
  }
}

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
        <div role="tablist" aria-label="Avatar parts" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {PARTS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={part === p}
              onClick={() => setPart(p)}
              className={`flex min-w-[4.6rem] shrink-0 flex-col items-center gap-1 rounded-2xl border-2 px-2 py-2 text-xs font-bold transition-colors ${
                part === p ? "border-teal bg-mint text-ocean" : "border-transparent text-muted hover:bg-mint/60 hover:text-ocean"
              }`}
            >
              <PartIcon part={p} />
              {PART_LABELS[p]}
            </button>
          ))}
        </div>

        {part === "theme" ? (
          // Body colors as swatches: quicker to compare than whole buddies.
          <div role="tabpanel" aria-label={PART_LABELS.theme} className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-8">
            {AVATAR_PARTS.theme.map((value) => {
              const selected = config.theme === value;
              const t = AVATAR_THEMES[value];
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => choose(value)}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span
                    className={`size-12 rounded-full transition-transform ${selected ? "scale-105 ring-4 ring-teal ring-offset-2 ring-offset-[var(--card)]" : "ring-1 ring-line hover:scale-105"}`}
                    style={{ background: `radial-gradient(circle at 35% 30%, ${t.light}, ${t.mid} 45%, ${t.dark})` }}
                  />
                  <span className={`text-xs font-bold ${selected ? "text-ocean" : "text-muted"}`}>{optionLabel("theme", value)}</span>
                </button>
              );
            })}
          </div>
        ) : (
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
                    selected ? "border-teal bg-mint" : "border-line bg-white hover:bg-mint/60"
                  }`}
                >
                  <Avatar config={{ ...config, [part]: value } as AvatarConfig} size={64} className="rounded-full" />
                  <span className={`text-xs font-bold ${selected ? "text-ocean" : "text-muted"}`}>{optionLabel(part, value)}</span>
                </button>
              );
            })}
          </div>
        )}

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
