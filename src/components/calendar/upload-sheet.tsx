"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { prepareUpload, savePhoto } from "@/actions/photos";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { dayLabel } from "@/lib/calendar";
import { type ProcessedImage, processImage } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";

type Step = "pick" | "processing" | "ready" | "uploading";

export function UploadSheet({
  date,
  hasPhoto,
  initialCaption,
  onClose,
}: {
  date: string;
  hasPhoto: boolean;
  initialCaption?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputId = useId();
  const [step, setStep] = useState<Step>("pick");
  const [image, setImage] = useState<ProcessedImage | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState(initialCaption ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStep("processing");
    try {
      const processed = await processImage(file);
      setImage(processed);
      setPreview(URL.createObjectURL(processed.full));
      setStep("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that image.");
      setStep("pick");
    }
  }

  async function upload() {
    if (!image) return;
    setConfirmReplace(false);
    setError(null);
    setStep("uploading");
    try {
      const ticket = await prepareUpload(date, image.ext);
      if (!ticket.ok) throw new Error(ticket.message);

      const bucket = createClient().storage.from("photos");
      const [full, thumb] = await Promise.all([
        bucket.uploadToSignedUrl(ticket.image.path, ticket.image.token, image.full, { contentType: image.type }),
        bucket.uploadToSignedUrl(ticket.thumb.path, ticket.thumb.token, image.thumb, { contentType: image.type }),
      ]);
      if (full.error || thumb.error) throw new Error("Upload failed. Check your connection and try again.");

      const saved = await savePhoto({ date, imagePath: ticket.image.path, thumbPath: ticket.thumb.path, caption });
      if (!saved.ok) throw new Error(saved.message);

      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStep("ready");
    }
  }

  const busy = step === "processing" || step === "uploading";

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby={`${inputId}-title`}
      className="m-auto mb-0 w-full max-w-lg rounded-t-3xl border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-black/50 sm:mb-auto sm:rounded-3xl"
    >
      <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{hasPhoto ? "replace the picture" : "a picture for"}</p>
            <h2 id={`${inputId}-title`} className="font-display text-xl font-semibold">
              {dayLabel(date)}
            </h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost min-h-9 px-3" aria-label="Close">
            ✕
          </button>
        </div>

        <label
          htmlFor={inputId}
          className={`mt-4 grid aspect-[4/3] cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-paper text-center transition-colors hover:border-accent ${
            busy ? "pointer-events-none opacity-70" : ""
          }`}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Selected photo preview" className="h-full w-full object-cover" />
          ) : (
            <span className="px-6 text-ink-soft">
              <span className="block font-hand text-2xl text-accent">
                {step === "processing" ? "developing…" : "tap to choose a photo"}
              </span>
              <span className="text-sm">It&apos;s resized on your phone before upload.</span>
            </span>
          )}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0])}
        />

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

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={step !== "ready"}
            onClick={() => (hasPhoto ? setConfirmReplace(true) : upload())}
          >
            {step === "uploading" ? "Saving…" : hasPhoto ? "Replace photo" : "Save photo"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReplace}
        title="Replace this day's photo?"
        confirmLabel="Replace"
        onConfirm={upload}
        onCancel={() => setConfirmReplace(false)}
      >
        There&apos;s already a picture for {dayLabel(date)}. The old one will be deleted.
      </ConfirmDialog>
    </dialog>
  );
}
