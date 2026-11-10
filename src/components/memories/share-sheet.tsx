"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot";
import type { PhotoView } from "@/lib/data/photos";
import type { MemoryCluster } from "@/lib/memories";
import type { StickerText } from "./memory-board";

/** The board's camera and size (CSS px) at the moment Share was tapped. */
export type SharedView = { tx: number; ty: number; scale: number; width: number; height: number };

type Picture = { blob: Blob; url: string; file: File };
type State = { status: "drawing" } | ({ status: "ready" } & Picture) | { status: "error" };

/** The phone app (mobile/src/screens/WebShell.tsx) shares pictures for the page: a web view can't. */
const inApp = () => typeof window !== "undefined" && Boolean(window.ReactNativeWebView);
const appCanShare = () => inApp() && Boolean(window.hidlApp?.shareImage);

function canWebShare(file: File) {
  try {
    return typeof navigator.share === "function" && navigator.canShare?.({ files: [file] }) === true;
  } catch {
    return false;
  }
}

function toBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * "Share as a picture": draws the board as it is on screen right now, shows it, and then shares
 * it (the phone's share sheet) or saves it. Drawing happens here rather than on tap, because a
 * browser only lets a page open the share sheet straight after a tap, and loading the photos can
 * take longer than that allows.
 */
export function ShareSheet({
  boardRef,
  view,
  clusters,
  stickers,
  title,
  summary,
  today,
  onClose,
}: {
  boardRef: RefObject<HTMLDivElement | null>;
  view: SharedView;
  clusters: MemoryCluster<PhotoView>[];
  stickers: StickerText[];
  title: string;
  summary: string;
  today: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ status: "drawing" });
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Draw once, for the view as it was when Share was tapped.
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    const board = boardRef.current;
    if (!board) return;
    import("./snapshot")
      .then(({ drawMemorySnapshot }) => drawMemorySnapshot({ board, view, clusters, stickers, title, summary }))
      .then(
        (blob) => {
          if (cancelled) return;
          url = URL.createObjectURL(blob);
          const file = new File([blob], `hidl-memories-${today}.jpg`, { type: "image/jpeg" });
          setState({ status: "ready", blob, url, file });
        },
        (error) => {
          console.error("drawMemorySnapshot", error);
          if (!cancelled) setState({ status: "error" });
        },
      );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // The props are a snapshot of the moment Share was tapped; the sheet draws that once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The app answers a share with a "hidl-app" event.
  useEffect(() => {
    const onAnswer = (e: Event) => {
      const detail = (e as CustomEvent<{ type?: string; ok?: boolean }>).detail;
      if (detail?.type !== "share-image") return;
      setBusy(false);
      if (!detail.ok) setNote("Couldn't open sharing. Try again.");
    };
    window.addEventListener("hidl-app", onAnswer);
    return () => window.removeEventListener("hidl-app", onAnswer);
  }, []);

  const picture = state.status === "ready" ? state : null;
  const webShare = picture ? canWebShare(picture.file) : false;
  const appShare = appCanShare();
  // A web view can't save a file either; an older app can only point to the browser.
  const canSave = !inApp();

  async function share() {
    if (!picture) return;
    setNote(null);
    if (appShare) {
      setBusy(true);
      try {
        const data = await toBase64(picture.blob);
        window.ReactNativeWebView!.postMessage(JSON.stringify({ type: "share-image", name: picture.file.name, data }));
      } catch {
        setBusy(false);
        setNote("Couldn't open sharing. Try again.");
      }
      return;
    }
    try {
      await navigator.share({ files: [picture.file], title: "My hidl memories" });
    } catch (error) {
      // Closing the share sheet without picking anything isn't a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNote(canSave ? "Couldn't open sharing here. Save the picture instead." : "Couldn't open sharing. Try again.");
    }
  }

  function save() {
    if (!picture) return;
    const a = document.createElement("a");
    a.href = picture.url;
    a.download = picture.file.name;
    document.body.append(a);
    a.click();
    a.remove();
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="share-memories-title"
      className="m-auto mb-0 w-full max-w-lg rounded-t-card border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-mint/70 backdrop:backdrop-blur-[2px] sm:mb-auto sm:rounded-card"
    >
      <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">share as a picture</p>
            <h2 id="share-memories-title" className="font-display text-xl font-semibold">
              Your memories, as on screen
            </h2>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost min-h-9 px-3" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 grid min-h-48 place-items-center overflow-hidden rounded-card bg-paper-deep">
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={picture.url}
              alt="Your memories board as a picture"
              className="max-h-[55dvh] w-auto max-w-full object-contain"
            />
          ) : state.status === "error" ? (
            <p role="alert" className="px-6 py-10 text-center text-ink-soft">
              Couldn&apos;t make the picture. Check your connection and try again.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8" role="status">
              <Mascot mood="curious" size={72} />
              <p className="font-hand text-2xl text-accent">developing…</p>
            </div>
          )}
        </div>

        {picture && inApp() && !appShare && (
          <p className="mt-3 text-sm text-muted">
            To share it, update the hidl app, or open hidl in your phone&apos;s browser.
          </p>
        )}
        {note && (
          <p role="alert" className="mt-3 rounded-control bg-accent-soft px-3 py-2 text-sm">
            {note}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {canSave && (
            <button type="button" className={`btn ${webShare ? "btn-ghost" : "btn-primary"}`} onClick={save} disabled={!picture}>
              Save picture
            </button>
          )}
          {(webShare || appShare) && (
            <button type="button" className="btn btn-primary" onClick={share} disabled={!picture || busy}>
              {busy ? "Opening…" : "Share"}
            </button>
          )}
          {!canSave && !appShare && (
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
