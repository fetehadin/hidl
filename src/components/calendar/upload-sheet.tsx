"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { addPhoto, discardUpload, photoSpace, prepareUpload, replacePhoto } from "@/actions/photos";
import { PhotoSpaceNotice } from "@/components/photo-space-notice";
import { dayLabel } from "@/lib/calendar";
import { type ProcessedMedia, processMedia } from "@/lib/image";
import { MAX_UPLOAD_BYTES, formatMB } from "@/lib/media";
import { PhotoGroupPicker } from "./photo-group-picker";
import { VideoBadge } from "./video-badge";

type Mode = { kind: "add"; date: string } | { kind: "replace"; date: string; photoId: string };

type Uploaded = { imagePath: string; thumbPath: string };

type PendingItem = {
  key: string;
  media: ProcessedMedia;
  preview: string;
  /** Started as soon as the photo is picked, so Save usually only has to record it. */
  upload: Promise<Uploaded>;
  uploaded: boolean;
};

/** One PUT of a file to the link the server signed for it (exact size and type). */
async function put(target: { url: string; headers: Record<string, string> }, body: Blob) {
  const res = await fetch(target.url, { method: "PUT", headers: target.headers, body });
  if (!res.ok) throw new Error(`Upload answered ${res.status}`);
}

/** Sends one photo's (or video's) two files straight to the media store via one-time upload links. */
async function uploadFiles(date: string, media: ProcessedMedia): Promise<Uploaded> {
  if (media.full.size > MAX_UPLOAD_BYTES) throw new Error(`That file is over ${formatMB(MAX_UPLOAD_BYTES)}.`);
  const ticket = await prepareUpload(
    date,
    { ext: media.fullExt, bytes: media.full.size },
    { ext: media.thumbExt, bytes: media.thumb.size },
  );
  if (!ticket.ok) throw new Error(ticket.message);
  const uploaded = { imagePath: ticket.image.path, thumbPath: ticket.thumb.path };
  try {
    await Promise.all([put(ticket.image, media.full), put(ticket.thumb, media.thumb)]);
  } catch {
    // Reserved but not (fully) uploaded: give the space back.
    discardUpload([uploaded.imagePath, uploaded.thumbPath]).catch(() => {});
    throw new Error("Upload failed. Check your connection and try again.");
  }
  return uploaded;
}

/** Best effort: delete what was uploaded for a photo that won't be saved. */
function discard(upload: Promise<Uploaded>) {
  upload.then((u) => discardUpload([u.imagePath, u.thumbPath]), () => {});
}

/** "photo", "video", "3 photos", "2 photos and a video"... for the save button. */
function itemsLabel(items: PendingItem[]) {
  const videos = items.filter((i) => i.media.mediaType === "video").length;
  const photos = items.length - videos;
  const part = (n: number, word: string) => (n === 0 ? "" : n === 1 ? (items.length === 1 ? word : `a ${word}`) : `${n} ${word}s`);
  return [part(photos, "photo"), part(videos, "video")].filter(Boolean).join(" and ");
}

let nextKey = 0;

export function UploadSheet({ mode, initialCaption, onClose }: { mode: Mode; initialCaption?: string | null; onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputId = useId();
  const [items, setItems] = useState<PendingItem[]>([]);
  // Mirrors `items` for the unmount cleanup, which can't read state.
  const itemsRef = useRef<PendingItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const [caption, setCaption] = useState(initialCaption ?? "");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [space, setSpace] = useState<{ used: number; quota: number } | null>(null);

  const isReplace = mode.kind === "replace";
  const maxFiles = isReplace ? 1 : Infinity;
  const busy = processing || uploading;

  useEffect(() => {
    dialogRef.current?.showModal();
    // Only says anything at 90% or more of the photo space.
    photoSpace().then(setSpace, () => {});
  }, []);

  useEffect(() => {
    // On close: anything still here was never saved, so drop its uploaded files too.
    return () => {
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.preview);
        discard(item.upload);
      }
    };
  }, []);

  async function addFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files).slice(0, maxFiles - items.length);
    if (list.length === 0) return;
    setError(null);
    setProcessing(true);
    for (const file of list) {
      try {
        const media = await processMedia(file);
        // Videos preview as their still frame (the same picture the calendar will show).
        const preview = URL.createObjectURL(media.mediaType === "video" ? media.thumb : media.full);
        const key = String(nextKey++);
        const upload = uploadFiles(mode.date, media);
        upload.then(
          () => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, uploaded: true } : i))),
          () => {}, // retried on Save
        );
        setItems((prev) => [...prev, { key, media, preview, upload, uploaded: false }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read that file.");
      }
    }
    setProcessing(false);
  }

  /** `saved`: it's a photo now, so keep its files; otherwise they're deleted. */
  function removeItem(key: string, saved = false) {
    const item = itemsRef.current.find((i) => i.key === key);
    if (item) {
      URL.revokeObjectURL(item.preview);
      if (!saved) discard(item.upload);
    }
    itemsRef.current = itemsRef.current.filter((i) => i.key !== key);
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  async function save() {
    if (items.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const count = items.length;
      for (const item of items) {
        const { media } = item;
        // Usually already done in the background; if that attempt failed, try once more now.
        let files: Uploaded;
        try {
          files = await item.upload;
        } catch {
          files = await uploadFiles(mode.date, media);
          // Remember the retry's files, so closing without saving still cleans them up.
          const retried = { ...item, upload: Promise.resolve(files), uploaded: true };
          itemsRef.current = itemsRef.current.map((i) => (i.key === item.key ? retried : i));
          setItems((prev) => prev.map((i) => (i.key === item.key ? retried : i)));
        }

        const result =
          mode.kind === "replace"
            ? await replacePhoto({ id: mode.photoId, mediaType: media.mediaType, imagePath: files.imagePath, thumbPath: files.thumbPath })
            : await addPhoto({
                date: mode.date,
                mediaType: media.mediaType,
                imagePath: files.imagePath,
                thumbPath: files.thumbPath,
                caption: count === 1 ? caption : null,
                groupIds,
              });
        if (!result.ok) throw new Error(result.message);
        removeItem(item.key, true);
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
                {processing ? "developing…" : "tap, or drop photos or videos here"}
              </span>
              <span className="text-sm">
                {isReplace ? "Photos are resized on your phone before upload." : "Pick or drop as many as you like."}
                <span className="block">Videos up to {formatMB(MAX_UPLOAD_BYTES)} each.</span>
              </span>
            </span>
          </label>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/*,video/mp4,video/webm,video/quicktime"
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
                {!item.uploaded && (
                  <span className="absolute inset-x-0 bottom-0 bg-white/80 py-0.5 text-center text-[10px] font-bold text-ocean">
                    uploading…
                  </span>
                )}
                {item.media.mediaType === "video" && <VideoBadge />}
                <button
                  type="button"
                  onClick={() => removeItem(item.key)}
                  disabled={busy}
                  aria-label={item.media.mediaType === "video" ? "Remove this video" : "Remove this photo"}
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-scrim/70 text-xs text-snow hover:bg-scrim"
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

        {!isReplace && items.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-sm font-semibold text-ink-soft">
              Groups <span className="font-normal text-muted">· optional, for Memories</span>
            </p>
            <PhotoGroupPicker value={groupIds} onChange={setGroupIds} disabled={busy} />
          </div>
        )}

        {space && <PhotoSpaceNotice used={space.used} quota={space.quota} className="mt-3" />}

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
                ? items[0]?.media.mediaType === "video"
                  ? "Replace with video"
                  : "Replace photo"
                : `Save ${itemsLabel(items) || "photo"}`}
          </button>
        </div>
      </div>
    </dialog>
  );
}

