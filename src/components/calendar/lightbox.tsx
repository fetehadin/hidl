"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deletePhoto, setCoverPhoto, updateCaption, updatePhotoTags } from "@/actions/photos";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PinIcon } from "@/components/icons";
import { dayLabel } from "@/lib/calendar";
import type { PhotoView } from "@/lib/data/photos";
import { useCalendarPref } from "@/components/calendar-pref";
import { formatEthiopianDay } from "@/lib/ethiopian";
import type { PhotoTag } from "@/lib/photo-tags";
import { PhotoTagPicker } from "./photo-tag-picker";

export function Lightbox({
  photos,
  dayPhotos,
  index,
  onIndex,
  onClose,
  onReplace,
  onAddAnother,
}: {
  /** What Prev / Next walk through. */
  photos: PhotoView[];
  /** Every photo the page has, when `photos` is only some of them (to know a day's other photos). */
  dayPhotos?: PhotoView[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onReplace: (photoId: string) => void;
  onAddAnother: (date: string) => void;
}) {
  const router = useRouter();
  const ethiopian = useCalendarPref() === "ethiopian";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchX = useRef<number | null>(null);
  const photo = photos[index];
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(photo?.caption ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [pinnedId, setPinnedId] = useState<string | null | undefined>(undefined);
  const sameDay = photo ? (dayPhotos ?? photos).filter((p) => p.date === photo.date) : [];

  // Kinds save as they're tapped; shown from here until the page's photo list catches up, which
  // happens once, on close, so the board doesn't regroup under the viewer while you sort.
  const [tagEdits, setTagEdits] = useState<Record<string, PhotoTag[]>>({});
  const tagsChanged = useRef(false);
  useEffect(() => {
    return () => {
      if (tagsChanged.current) router.refresh();
    };
  }, [router]);
  // Optimistic until the refreshed photo list arrives with the new pin.
  const isPinned = photo ? (pinnedId === undefined ? photo.isCover : pinnedId === photo.id) : false;

  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing || confirmDelete) return;
      if (e.key === "ArrowLeft" && hasPrev) onIndex(index - 1);
      if (e.key === "ArrowRight" && hasNext) onIndex(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, hasPrev, hasNext, onIndex, editing, confirmDelete]);

  if (!photo) return null;

  function togglePin() {
    const pin = !isPinned;
    setError(null);
    setPinnedId(pin ? photo.id : null);
    startTransition(async () => {
      const res = await setCoverPhoto(photo.id, pin);
      if (!res.ok) {
        setPinnedId(undefined);
        return setError(res.message);
      }
      router.refresh();
    });
  }

  function changeTags(next: PhotoTag[]) {
    const id = photo.id;
    const before = tagEdits[id] ?? photo.tags;
    setError(null);
    setTagEdits((prev) => ({ ...prev, [id]: next }));
    tagsChanged.current = true;
    updatePhotoTags({ id, tags: next }).then(
      (res) => {
        if (res.ok) return;
        setTagEdits((prev) => ({ ...prev, [id]: before }));
        setError(res.message);
      },
      () => {
        setTagEdits((prev) => ({ ...prev, [id]: before }));
        setError("Couldn't save that. Try again.");
      },
    );
  }

  function go(i: number) {
    setPinnedId(undefined);
    setEditing(false);
    setError(null);
    setCaption(photos[i]?.caption ?? "");
    onIndex(i);
  }

  function saveCaption() {
    startTransition(async () => {
      const res = await updateCaption({ id: photo.id, caption });
      if (!res.ok) return setError(res.message);
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deletePhoto(photo.id);
      if (!res.ok) {
        setConfirmDelete(false);
        return setError(res.message);
      }
      setConfirmDelete(false);
      router.refresh();
      onClose();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={`Photo for ${dayLabel(photo.date)}`}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-white p-0 text-ink backdrop:bg-white"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
          <div>
            <p className="font-display text-lg font-semibold text-heading">
              {ethiopian ? formatEthiopianDay(photo.date) : dayLabel(photo.date)}
            </p>
            {ethiopian && <p className="text-sm text-muted">{dayLabel(photo.date)}</p>}
          </div>
          <div className="flex items-center gap-1">
            {/* Only worth choosing when the day has more than one picture. */}
            {sameDay.length > 1 && (
              <button
                type="button"
                onClick={togglePin}
                disabled={pending}
                aria-pressed={isPinned}
                title={isPinned ? "This is the day's wallpaper. Tap to unpin" : "Pin as this day's wallpaper in the calendar"}
                className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition-colors ${
                  isPinned ? "bg-mint text-ocean shadow-[inset_0_0_0_2px_var(--teal)]" : "text-ocean hover:bg-mint"
                }`}
              >
                <PinIcon width={18} height={18} filled={isPinned} className={isPinned ? "text-teal" : ""} />
                {isPinned ? "Pinned" : "Pin as wallpaper"}
              </button>
            )}
            <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full text-ocean hover:bg-mint" aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center px-2"
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (dx > 50 && hasPrev) go(index - 1);
            if (dx < -50 && hasNext) go(index + 1);
          }}
        >
          {photo.isVideo ? (
            <video
              key={photo.fullUrl}
              src={photo.fullUrl}
              poster={photo.thumbUrl}
              controls
              playsInline
              preload="metadata"
              aria-label={photo.caption ?? `Video from ${dayLabel(photo.date)}`}
              className="animate-fade-up max-h-full max-w-full rounded-control bg-white object-contain shadow-[0_16px_40px_-20px_rgb(var(--shadow)/0.45)]"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.fullUrl}
              src={photo.fullUrl}
              alt={photo.caption ?? `Photo from ${dayLabel(photo.date)}`}
              className="animate-fade-up max-h-full max-w-full rounded-control object-contain shadow-[0_16px_40px_-20px_rgb(var(--shadow)/0.45)]"
            />
          )}
          <button type="button" onClick={() => go(index - 1)} disabled={!hasPrev} aria-label="Previous photo"
            className="absolute top-1/2 left-2 hidden -translate-y-1/2 rounded-full bg-mint px-4 py-3 text-2xl text-ocean hover:bg-aqua disabled:opacity-0 sm:block">
            ‹
          </button>
          <button type="button" onClick={() => go(index + 1)} disabled={!hasNext} aria-label="Next photo"
            className="absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-full bg-mint px-4 py-3 text-2xl text-ocean hover:bg-aqua disabled:opacity-0 sm:block">
            ›
          </button>
        </div>

        <div className="mx-auto w-full max-w-xl px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {editing ? (
            <div className="flex gap-2">
              <label htmlFor="lightbox-caption" className="sr-only">Caption</label>
              <input id="lightbox-caption" value={caption} maxLength={140} autoFocus
                onChange={(e) => setCaption(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveCaption()}
                className="field min-h-11 flex-1 px-3"
                placeholder="Add a caption" />
              <button type="button" className="btn btn-primary" onClick={saveCaption} disabled={pending}>
                Save
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="w-full text-left text-lg text-ink">
              {photo.caption ?? <span className="text-muted">Add a caption…</span>}
            </button>
          )}
          <PhotoTagPicker value={tagEdits[photo.id] ?? photo.tags} onChange={changeTags} oneRow className="mt-3" />
          {error && <p role="alert" className="mt-2 text-sm text-wax">{error}</p>}

          <div className="mt-3 flex items-center justify-between text-sm">
            <div className="flex gap-1 sm:hidden">
              <button type="button" onClick={() => go(index - 1)} disabled={!hasPrev}
                className="rounded-full px-3 py-2 hover:bg-mint text-ocean disabled:opacity-30" aria-label="Previous photo">‹ Prev</button>
              <button type="button" onClick={() => go(index + 1)} disabled={!hasNext}
                className="rounded-full px-3 py-2 hover:bg-mint text-ocean disabled:opacity-30" aria-label="Next photo">Next ›</button>
            </div>
            <span className="hidden text-muted sm:inline">{index + 1} of {photos.length}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => onAddAnother(photo.date)} className="rounded-full px-3 py-2 hover:bg-mint text-ocean">
                Add another
              </button>
              <button type="button" onClick={() => onReplace(photo.id)} className="rounded-full px-3 py-2 hover:bg-mint text-ocean">
                Replace
              </button>
              <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-full px-3 py-2 text-wax hover:bg-mint text-ocean">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog open={confirmDelete} tone="danger" title={photo.isVideo ? "Delete this video?" : "Delete this photo?"} confirmLabel="Delete"
        pending={pending} onConfirm={remove} onCancel={() => setConfirmDelete(false)}>
        The picture for {dayLabel(photo.date)} will be removed for good.
      </ConfirmDialog>
    </dialog>
  );
}
