"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deletePhoto, updateCaption } from "@/actions/photos";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { dayLabel } from "@/lib/calendar";
import type { PhotoView } from "@/lib/data/photos";

export function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
  onReplace,
  onAddAnother,
}: {
  photos: PhotoView[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onReplace: (photoId: string) => void;
  onAddAnother: (date: string) => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchX = useRef<number | null>(null);
  const photo = photos[index];
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(photo?.caption ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  function go(i: number) {
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
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/95 p-0 text-white backdrop:bg-black"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
          <p className="font-display text-lg">{dayLabel(photo.date)}</p>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 text-white/80 hover:bg-white/10" aria-label="Close">
            ✕
          </button>
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.fullUrl}
            src={photo.fullUrl}
            alt={photo.caption ?? `Photo from ${dayLabel(photo.date)}`}
            className="animate-fade-up max-h-full max-w-full rounded-control object-contain"
          />
          <button type="button" onClick={() => go(index - 1)} disabled={!hasPrev} aria-label="Previous photo"
            className="absolute top-1/2 left-2 hidden -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl hover:bg-white/20 disabled:opacity-0 sm:block">
            ‹
          </button>
          <button type="button" onClick={() => go(index + 1)} disabled={!hasNext} aria-label="Next photo"
            className="absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl hover:bg-white/20 disabled:opacity-0 sm:block">
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
                className="min-h-11 flex-1 rounded-control border border-white/20 bg-white/10 px-3 text-white placeholder:text-white/50"
                placeholder="Add a caption" />
              <button type="button" className="btn bg-white text-black" onClick={saveCaption} disabled={pending}>
                Save
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="w-full text-left text-lg text-white/90">
              {photo.caption ?? <span className="text-white/50">Add a caption…</span>}
            </button>
          )}
          {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}

          <div className="mt-3 flex items-center justify-between text-sm">
            <div className="flex gap-1 sm:hidden">
              <button type="button" onClick={() => go(index - 1)} disabled={!hasPrev}
                className="rounded-full px-3 py-2 hover:bg-white/10 disabled:opacity-30" aria-label="Previous photo">‹ Prev</button>
              <button type="button" onClick={() => go(index + 1)} disabled={!hasNext}
                className="rounded-full px-3 py-2 hover:bg-white/10 disabled:opacity-30" aria-label="Next photo">Next ›</button>
            </div>
            <span className="hidden text-white/50 sm:inline">{index + 1} of {photos.length}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => onAddAnother(photo.date)} className="rounded-full px-3 py-2 hover:bg-white/10">
                Add another
              </button>
              <button type="button" onClick={() => onReplace(photo.id)} className="rounded-full px-3 py-2 hover:bg-white/10">
                Replace
              </button>
              <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-full px-3 py-2 text-red-300 hover:bg-white/10">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog open={confirmDelete} tone="danger" title="Delete this photo?" confirmLabel="Delete"
        pending={pending} onConfirm={remove} onCancel={() => setConfirmDelete(false)}>
        The picture for {dayLabel(photo.date)} will be removed for good.
      </ConfirmDialog>
    </dialog>
  );
}
