"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { photosForShare } from "@/actions/photos";
import { useCalendarPref } from "@/components/calendar-pref";
import { Mascot } from "@/components/mascot";
import type { PhotoView } from "@/lib/data/photos";
import type { MemoryCluster } from "@/lib/memories";
import { type SharePeriod, periodDays, periodRange, periodTitle, stepPeriod } from "@/lib/share-periods";
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

type Picture = { blob: Blob; url: string; file: File };
type State = { status: "drawing" } | ({ status: "ready" } & Picture) | { status: "empty" } | { status: "error"; message?: string };

const MODE_LABEL: Record<ShareMode, string> = { screen: "This view", day: "Day", week: "Week", month: "Month" };
const EMPTY: Record<SharePeriod, string> = {
  day: "No photos on this day.",
  week: "No photos this week.",
  month: "No photos this month.",
};

/** The phone app (mobile/src/screens/WebShell.tsx) shares pictures for the page: a web view can't. */
const inApp = () => typeof window !== "undefined" && Boolean(window.ReactNativeWebView);
const appCanShare = () => inApp() && Boolean(window.hidlApp?.shareImage);

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

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
 * "Share as a picture": the memories board as it is on screen, or a classic card of one day, a
 * week or a month. It draws the picture, shows it, and then shares it (the phone's share sheet)
 * or saves it. Drawing happens here rather than on tap, because a browser only lets a page open
 * the share sheet straight after a tap, and loading the photos can take longer than that allows.
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
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Draw the picture for the current choice; a newer choice cancels an older one still drawing.
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    const done = (blob: Blob, name: string) => {
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setState({ status: "ready", blob, url, file: new File([blob], name, { type: "image/jpeg" }) });
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
        .then((blob) => done(blob, `hidl-memories-${today}.jpg`), fail);
    } else {
      const period = mode;
      const { from, to } = periodRange(period, date, pref);
      Promise.all([photosForShare(from, to), import("./snapshot")])
        .then(([res, { drawPeriodCard }]) => {
          if (cancelled) return null;
          if (!res.ok) {
            setState({ status: "error", message: res.message });
            return null;
          }
          if (res.photos.length === 0) {
            setState({ status: "empty" });
            return null;
          }
          const { days, dayNumbers, leadingBlanks } = periodDays(period, date, pref);
          const byDay = days.map((d, i) => ({
            date: d,
            number: dayNumbers[i],
            // The day's pinned wallpaper first, then upload order.
            photos: res.photos.filter((p) => p.date === d).sort((a, b) => Number(b.isCover) - Number(a.isCover)),
          }));
          const withPhotos = byDay.filter((d) => d.photos.length > 0).length;
          const count = plural(res.photos.length, "photo");
          return drawPeriodCard({
            period,
            eyebrow: `my ${period}`,
            title: periodTitle(period, date, pref),
            summary: period === "day" ? count : `${count} · ${plural(withPhotos, "day")}`,
            days: byDay,
            leadingBlanks,
          });
        })
        .then((blob) => blob && done(blob, `hidl-${period}-${periodRange(period, date, pref).from}.jpg`), fail);
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // `screen` is a snapshot of the moment Share was tapped; it never changes while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date, pref]);

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
  const webShare = picture ? canWebShare(picture.file) : false;
  const appShare = appCanShare();
  // A web view can't save a file either; an older app can only point to the browser.
  const canSave = !inApp();
  const modes: ShareMode[] = screen ? ["screen", "day", "week", "month"] : ["day", "week", "month"];
  const atLatest = mode !== "screen" && periodRange(mode, date, pref).to >= today;

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
          <div className="mt-3 flex items-center justify-between gap-2">
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

        <div className="mt-3 grid min-h-48 place-items-center overflow-hidden rounded-card bg-paper-deep">
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picture.url} alt="The picture to share" className="max-h-[50dvh] w-auto max-w-full object-contain" />
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

        {picture && inApp() && !appShare && (
          <p className="mt-3 text-sm text-muted">To share it, update the hidl app, or open hidl in your phone&apos;s browser.</p>
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
