"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { photosForShare } from "@/actions/photos";
import { useCalendarPref } from "@/components/calendar-pref";
import { CopyIcon, DownloadIcon, ShareIcon } from "@/components/icons";
import { Mascot } from "@/components/mascot";
import type { PhotoView } from "@/lib/data/photos";
import { pickForPicture } from "@/lib/lane-layout";
import type { MemoryCluster } from "@/lib/memories";
import { type SharePeriod, dayTag, periodRange, periodTitle, stepPeriod } from "@/lib/share-periods";
import type { StickerText } from "./memory-board";

/** The board's camera and size (CSS px) at the moment Share was tapped. */
export type SharedView = { tx: number; ty: number; scale: number; width: number; height: number };

/** The memories board as it was on screen, for the "This view" picture. */
export type ScreenShare = {
  boardRef: RefObject<HTMLDivElement | null>;
  view: SharedView;
  clusters: MemoryCluster<PhotoView>[];
  stickers: StickerText[];
  title: string;
  summary: string;
};

export type ShareMode = "screen" | SharePeriod;

type Picture = { canvas: HTMLCanvasElement; blob: Blob; url: string; file: File };
type State = { status: "drawing" } | ({ status: "ready" } & Picture) | { status: "empty" } | { status: "error"; message?: string };

const MODE_LABEL: Record<ShareMode, string> = { screen: "This view", day: "Day", week: "Week", month: "Month" };
const EMPTY: Record<SharePeriod, string> = {
  day: "No photos on this day.",
  week: "No photos this week.",
  month: "No photos this month.",
};
/** Photos in one picture at most: past this they'd be too small to make out on a phone. */
const MAX_IN_PICTURE = 48;

/** The phone app (mobile/src/screens/WebShell.tsx) shares and saves pictures for the page: a web view can't. */
const inApp = () => typeof window !== "undefined" && Boolean(window.ReactNativeWebView);
const appCan = (what: "shareImage" | "saveImage") => inApp() && Boolean(window.hidlApp?.[what]);

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

function canWebShare(file: File) {
  try {
    return typeof navigator.share === "function" && navigator.canShare?.({ files: [file] }) === true;
  } catch {
    return false;
  }
}

const canCopy = () => typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";

function toBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * "Share as a picture": a day, a week or a month of photos drawn as Memory Lane (the board's sky,
 * every photo framed and fitted to the screen), or the board exactly as it is on screen. It draws
 * the picture, shows it, and then copies, downloads or shares it. Drawing happens here rather than
 * on tap, because a browser only lets a page open the share sheet straight after a tap, and
 * loading the photos can take longer than that allows.
 */
export function ShareSheet({
  screen,
  initialMode,
  initialDate,
  today,
  onClose,
}: {
  /** Given on the memories board: offers "This view". */
  screen?: ScreenShare;
  initialMode: ShareMode;
  /** A day inside the period to start on. */
  initialDate: string;
  today: string;
  onClose: () => void;
}) {
  const pref = useCalendarPref();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<ShareMode>(screen ? initialMode : initialMode === "screen" ? "month" : initialMode);
  const [date, setDate] = useState(initialDate);
  const [state, setState] = useState<State>({ status: "drawing" });
  const [note, setNote] = useState<{ text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState<"share" | "save" | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Draw the picture for the current choice; a newer choice cancels an older one still drawing.
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    const done = async (canvas: HTMLCanvasElement | null, name: string) => {
      if (cancelled || !canvas) return;
      const { canvasBlob } = await import("./snapshot");
      const blob = await canvasBlob(canvas);
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setState({ status: "ready", canvas, blob, url, file: new File([blob], name, { type: "image/jpeg" }) });
    };
    const fail = (error: unknown) => {
      console.error("sharePicture", error);
      if (!cancelled) setState({ status: "error" });
    };

    if (mode === "screen") {
      const board = screen?.boardRef.current;
      if (!screen || !board) return;
      import("./snapshot")
        .then(({ drawMemorySnapshot }) => drawMemorySnapshot({ ...screen, board }))
        .then((canvas) => done(canvas, `hidl-memories-${today}.jpg`))
        .catch(fail);
    } else {
      const period = mode;
      const { from, to } = periodRange(period, date, pref);
      Promise.all([photosForShare(from, to), import("./snapshot")])
        .then(([res, { drawLanePicture }]) => {
          if (cancelled) return null;
          if (!res.ok) {
            setState({ status: "error", message: res.message });
            return null;
          }
          if (res.photos.length === 0) {
            setState({ status: "empty" });
            return null;
          }
          // Oldest first, and each day's wallpaper first within its day.
          const ordered = [...res.photos].sort(
            (a, b) => a.date.localeCompare(b.date) || Number(b.isCover) - Number(a.isCover),
          );
          const days = new Set(ordered.map((p) => p.date)).size;
          const count = plural(ordered.length, "photo");
          return drawLanePicture({
            title: periodTitle(period, date, pref),
            summary: period === "day" ? count : `${count} · ${plural(days, "day")}`,
            photos: pickForPicture(ordered, MAX_IN_PICTURE),
            dayTag: period === "day" ? undefined : (d) => dayTag(d, pref),
            screen: { width: window.innerWidth, height: window.innerHeight },
          });
        })
        .then((canvas) => done(canvas, `hidl-${period}-${from}.jpg`))
        .catch(fail);
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // `screen` is a snapshot of the moment Share was tapped; it never changes while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date, pref]);

  // The app answers a share or a save with a "hidl-app" event.
  useEffect(() => {
    const onAnswer = (e: Event) => {
      const detail = (e as CustomEvent<{ type?: string; ok?: boolean; cancelled?: boolean }>).detail;
      if (detail?.type === "share-image") {
        setBusy(null);
        if (!detail.ok) setNote({ text: "Couldn't open sharing. Try again." });
      } else if (detail?.type === "save-image") {
        setBusy(null);
        if (detail.ok) setNote({ text: "Saved.", ok: true });
        else if (!detail.cancelled) setNote({ text: "Couldn't save it there. Try another folder." });
      }
    };
    window.addEventListener("hidl-app", onAnswer);
    return () => window.removeEventListener("hidl-app", onAnswer);
  }, []);

  function choose(next: ShareMode) {
    if (next === mode) return;
    setNote(null);
    setState({ status: "drawing" });
    setMode(next);
  }

  function step(delta: -1 | 1) {
    if (mode === "screen") return;
    setNote(null);
    setState({ status: "drawing" });
    setDate(stepPeriod(mode, date, pref, delta));
  }

  const picture = state.status === "ready" ? state : null;
  const appShare = appCan("shareImage");
  const appSave = appCan("saveImage");
  const webShare = picture && !inApp() ? canWebShare(picture.file) : false;
  const showShare = appShare || webShare;
  // A web view can't download a file; the app saves it, or (an older app) the browser has to.
  const showSave = !inApp() || appSave;
  const modes: ShareMode[] = screen ? ["day", "week", "month", "screen"] : ["day", "week", "month"];
  const atLatest = mode !== "screen" && periodRange(mode, date, pref).to >= today;

  async function postToApp(type: "share-image" | "save-image") {
    if (!picture) return;
    setBusy(type === "share-image" ? "share" : "save");
    try {
      const data = await toBase64(picture.blob);
      window.ReactNativeWebView!.postMessage(JSON.stringify({ type, name: picture.file.name, data }));
    } catch {
      setBusy(null);
      setNote({ text: "Something went wrong. Try again." });
    }
  }

  async function share() {
    if (!picture) return;
    setNote(null);
    if (appShare) return postToApp("share-image");
    try {
      await navigator.share({ files: [picture.file], title: "My hidl memories" });
    } catch (error) {
      // Closing the share sheet without picking anything isn't a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNote({ text: "Couldn't open sharing here. Download the picture instead." });
    }
  }

  function save() {
    if (!picture) return;
    setNote(null);
    if (inApp()) return postToApp("save-image");
    const a = document.createElement("a");
    a.href = picture.url;
    a.download = picture.file.name;
    document.body.append(a);
    a.click();
    a.remove();
  }

  async function copy() {
    if (!picture) return;
    setNote(null);
    try {
      if (!canCopy()) throw new Error("no clipboard");
      const { canvasBlob } = await import("./snapshot");
      // Clipboards take PNG. The item gets a promise so Safari still counts this as the tap's action.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": canvasBlob(picture.canvas, "image/png") })]);
      setNote({ text: "Copied. Paste it into a chat or a post.", ok: true });
    } catch {
      setNote({
        text: showSave ? "Copying pictures doesn't work here. Download it instead." : "Copying pictures doesn't work here. Use Share instead.",
      });
    }
  }

  const actionClass = "btn flex-1 gap-2 px-3";

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
      <div className="p-5 pb-[max(1.25rem,var(--safe-bottom))] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">share as a picture</p>
            <h2 id="share-memories-title" className="font-display text-xl font-semibold">
              Share your memories
            </h2>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost min-h-9 px-3" aria-label="Close">
            ✕
          </button>
        </div>

        <div role="group" aria-label="What to share" className="mt-4 flex rounded-full bg-paper-deep p-0.5">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => choose(m)}
              className={`flex-1 rounded-full px-2 py-2 text-sm font-bold whitespace-nowrap transition-colors ${
                mode === m ? "bg-teal text-accent-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        {mode !== "screen" && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <button type="button" onClick={() => step(-1)} className="grid size-10 place-items-center rounded-full text-xl text-ocean hover:bg-mint" aria-label={`Previous ${mode}`}>
              ‹
            </button>
            <p className="min-w-0 truncate text-center font-semibold" aria-live="polite">
              {periodTitle(mode, date, pref)}
            </p>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={atLatest}
              className="grid size-10 place-items-center rounded-full text-xl text-ocean hover:bg-mint disabled:opacity-25"
              aria-label={`Next ${mode}`}
            >
              ›
            </button>
          </div>
        )}

        <div className="mt-2 grid min-h-48 place-items-center overflow-hidden rounded-card bg-paper-deep">
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picture.url} alt="The picture to share" className="max-h-[48dvh] w-auto max-w-full object-contain" />
          ) : state.status === "empty" && mode !== "screen" ? (
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
              <Mascot mood="curious" size={64} />
              <p className="text-ink-soft">{EMPTY[mode]}</p>
            </div>
          ) : state.status === "error" ? (
            <p role="alert" className="px-6 py-10 text-center text-ink-soft">
              {state.message ?? "Couldn't make the picture. Check your connection and try again."}
            </p>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8" role="status">
              <Mascot mood="curious" size={72} />
              <p className="font-hand text-2xl text-accent">developing…</p>
            </div>
          )}
        </div>

        {picture && inApp() && !appShare && !appSave && (
          <p className="mt-3 text-sm text-muted">To share or save it, update the hidl app, or open hidl in your phone&apos;s browser.</p>
        )}
        {note && (
          <p role={note.ok ? "status" : "alert"} className={`mt-3 rounded-control px-3 py-2 text-sm ${note.ok ? "bg-mint" : "bg-accent-soft"}`}>
            {note.text}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button type="button" className={`${actionClass} btn-ghost`} onClick={copy} disabled={!picture}>
            <CopyIcon width={18} height={18} />
            Copy
          </button>
          {showSave && (
            <button
              type="button"
              className={`${actionClass} ${showShare ? "btn-ghost" : "btn-primary"}`}
              onClick={save}
              disabled={!picture || busy !== null}
            >
              <DownloadIcon width={18} height={18} />
              {busy === "save" ? "Saving…" : "Download"}
            </button>
          )}
          {showShare && (
            <button type="button" className={`${actionClass} btn-primary`} onClick={share} disabled={!picture || busy !== null}>
              <ShareIcon width={18} height={18} />
              {busy === "share" ? "Opening…" : "Share"}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
