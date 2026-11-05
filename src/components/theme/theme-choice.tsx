"use client";

import { THEMES, THEME_INFO, type Theme } from "@/lib/theme";
import { applyTheme, useTheme } from "./use-theme";

/** The two looks side by side with their colors, on /account. */
export function ThemeChoice({ serverTheme }: { serverTheme: Theme }) {
  const theme = useTheme(serverTheme);
  return (
    <fieldset>
      <legend className="sr-only">Theme</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {THEMES.map((t) => {
          const info = THEME_INFO[t];
          const on = t === theme;
          return (
            <label
              key={t}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition-colors ${on ? "border-teal bg-mint" : "border-line bg-white hover:border-fresh"}`}
            >
              <input type="radio" name="theme" value={t} checked={on} onChange={() => applyTheme(t)} className="size-5 accent-[var(--teal)]" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-heading">{info.label}</span>
                <span className="block text-sm text-ink-soft">{info.description}</span>
              </span>
              <span aria-hidden className="flex overflow-hidden rounded-full border border-line">
                {info.swatches.map((c) => (
                  <span key={c} className="size-5" style={{ background: c }} />
                ))}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
