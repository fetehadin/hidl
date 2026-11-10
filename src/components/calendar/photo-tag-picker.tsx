"use client";

import { MAX_PHOTO_TAGS, PHOTO_TAGS, PHOTO_TAG_INFO, type PhotoTag, togglePhotoTag } from "@/lib/photo-tags";

/**
 * A row of chips for what a photo shows (nature, food, family...). Tapping one adds or removes
 * it; at the limit, the others are greyed until one is removed.
 */
export function PhotoTagPicker({
  value,
  onChange,
  disabled,
  label = "What's in it?",
  oneRow = false,
  className = "",
}: {
  value: readonly PhotoTag[];
  onChange: (next: PhotoTag[]) => void;
  disabled?: boolean;
  label?: string;
  /** One swipeable row instead of wrapping (where height is scarce, like under a photo). */
  oneRow?: boolean;
  className?: string;
}) {
  const full = value.length >= MAX_PHOTO_TAGS;
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex gap-1.5 ${oneRow ? "-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" : "flex-wrap"} ${className}`}
    >
      {PHOTO_TAGS.map((tag) => {
        const on = value.includes(tag);
        const info = PHOTO_TAG_INFO[tag];
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            disabled={disabled || (!on && full)}
            onClick={() => onChange(togglePhotoTag(value, tag))}
            className={`flex min-h-9 shrink-0 items-center whitespace-nowrap gap-1 rounded-full border-2 px-2.5 text-sm font-bold transition-colors disabled:opacity-40 ${
              on ? "border-teal bg-mint text-ocean" : "border-line bg-white text-ink-soft hover:bg-mint/60"
            }`}
          >
            <span aria-hidden>{info.emoji}</span>
            {info.label}
          </button>
        );
      })}
    </div>
  );
}
