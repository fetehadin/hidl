/** A small play mark over a video's still frame. */
export function VideoBadge({ className = "absolute bottom-1 left-1" }: { className?: string }) {
  return (
    <span aria-hidden className={`${className} grid size-6 place-items-center rounded-full bg-scrim/70 text-snow`}>
      <svg viewBox="0 0 24 24" width={12} height={12} fill="currentColor">
        <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
      </svg>
    </span>
  );
}
