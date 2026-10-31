"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { addPhoto, prepareUpload, replacePhoto } from "@/actions/photos";
import { dayLabel } from "@/lib/calendar";
import { type ProcessedImage, processImage } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";

type Mode = { kind: "add"; date: string } | { kind: "replace"; date: string; photoId: string };

type PendingItem = { key: string; image: ProcessedImage; preview: string; error?: string };

let nextKey = 0;

export function UploadSheet({ mode, initialCaption, onClose }: { mode: Mode; initialCaption?: string | null; onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputId = useId();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [caption, setCaption] = useState(initialCaption ?? "");
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReplace = mode.kind === "replace";
  const maxFiles = isReplace ? 1 : Infinity;
  const busy = processing || uploading;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    return () => {
      for (const item of items) URL.revokeObjectURL(item.preview);
    };
    // Only on unmount: revoking on every items change would break previews still in use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files).slice(0, maxFiles - items.length);
    if (list.length === 0) return;
    setError(null);
    setProcessing(true);
    for (const file of list) {
      try {
        const image = await processImage(file);
        setItems((prev) => [...prev, { key: String(nextKey++), image, preview: URL.createObjectURL(image.full) }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read that image.");
      }
    }
    setProcessing(false);
  }

  function removeItem(key: string) {
    setItems((prev) => {
      const item = prev.find((i) => i.key === key);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.key !== key);
    });
  }

  async function save() {
    if (items.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const item of items) {
        const ticket = await prepareUpload(mode.date, item.image.ext);
        if (!ticket.ok) throw new Error(ticket.message);

        const bucket = createClient().storage.from("photos");
        const [full, thumb] = await Promise.all([
          bucket.uploadToSignedUrl(ticket.image.path, ticket.image.token, item.image.full, { contentType: item.image.type }),
          bucket.uploadToSignedUrl(ticket.thumb.path, ticket.thumb.token, item.image.thumb, { contentType: item.image.type }),
        ]);
        if (full.error || thumb.error) throw new Error("Upload failed. Check your connection and try again.");

        const result =
          mode.kind === "replace"
            ? await replacePhoto({ id: mode.photoId, imagePath: ticket.image.path, thumbPath: ticket.thumb.path })
            : await addPhoto({
                date: mode.date,
                imagePath: ticket.image.path,
                thumbPath: ticket.thumb.path,
                caption: items.length === 1 ? caption : null,
              });
        if (!result.ok) throw new Error(result.message);
        removeItem(item.key);
      }
      router.refresh();
      onClose();
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "Something went wrong."} ${
          items.length > 0 ? "The rest are still here — try again." : ""
        }`.trim(),
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby={`${inputId}-title`}
      className="m-auto mb-0 w-full max-w-lg rounded-t-card border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-mint/70 backdrop:backdrop-blur-[2px] sm:mb-auto sm:rounded-card"
    >
      <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{isReplace ? "replace the picture" : "a picture for"}</p>
            <h2 id={`${inputId}-title`} className="font-display text-xl font-semibold">
              {dayLabel(mode.date)}
            </h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost min-h-9 px-3" aria-label="Close">
            ✕
          </button>
        </div>

        {items.length < maxFiles && (
          <label
            htmlFor={inputId}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`mt-4 grid aspect-[4/3] cursor-pointer place-items-center overflow-hidden rounded-card border-2 border-dashed text-center transition-colors ${
              dragOver ? "border-accent bg-accent-soft" : "border-line bg-paper hover:border-accent"
            } ${busy ? "pointer-events-none opacity-70" : ""}`}
          >
            <span className="px-6 text-ink-soft">
              <span className="block font-hand text-2xl text-accent">
                {processing ? "developing…" : "tap, or drop photos here"}
              </span>
              <span className="text-sm">
                {isReplace ? "It's resized on your phone before upload." : "Pick or drop as many as you like."}
              </span>
            </span>
          </label>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple={!isReplace}
          className="sr-only"
          disabled={busy || items.length >= maxFiles}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {items.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items.map((item) => (
              <div key={item.key} className="group relative aspect-square overflow-hidden rounded-control bg-paper-deep">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.preview} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeItem(item.key)}
                  disabled={busy}
                  aria-label="Remove this photo"
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-ocean/85 text-xs text-white hover:bg-ocean"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {!isReplace && items.length === 1 && (
          <>
            <label htmlFor={`${inputId}-caption`} className="mt-4 mb-1.5 block text-sm font-semibold text-ink-soft">
              Caption <span className="font-normal text-muted">· optional</span>
            </label>
            <input
              id={`${inputId}-caption`}
              className="field"
              maxLength={140}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What made today, today?"
              disabled={busy}
            />
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-control bg-accent-soft px-3 py-2 text-sm">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={items.length === 0 || busy} onClick={save}>
            {uploading
              ? "Saving…"
              : isReplace
                ? "Replace photo"
                : items.length > 1
                  ? `Save ${items.length} photos`
                  : "Save photo"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
