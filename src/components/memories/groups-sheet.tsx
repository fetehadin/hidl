"use client";

import { useRouter } from "next/navigation";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState, useTransition } from "react";
import { createPhotoGroup, deletePhotoGroup, orderPhotoGroups, renamePhotoGroup } from "@/actions/photo-groups";
import { setPhotoGroupList, usePhotoGroups } from "@/components/calendar/photo-groups-store";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { GripIcon, PencilIcon, TrashIcon } from "@/components/icons";
import { type PhotoGroup, cleanGroupName, dropIndex, groupNameProblem, moveInOrder, moveToIndex } from "@/lib/photo-groups";

const arrow = "grid size-9 place-items-center rounded-full text-ocean hover:bg-mint disabled:opacity-25";
/** Near the list's top or bottom edge (px), a drag scrolls it. */
const SCROLL_EDGE = 44;

/** The row being dragged: where it started, where it would land, and how far it has moved (px). */
type Drag = { from: number; over: number; dy: number; height: number };

/**
 * The person's groups, to make, rename, delete and put in order. The order is their priority:
 * the first group sits in the middle of the memories board, the rest spiral out after it.
 */
export function GroupsSheet({ counts, onClose }: { counts: Map<string, number>; onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const groups = usePhotoGroups() ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [removing, setRemoving] = useState<PhotoGroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = useRef(false);
  const listRef = useRef<HTMLOListElement>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  /** The live drag, read by pointer events and the auto-scroll loop without waiting for a render. */
  const live = useRef<{
    from: number;
    over: number;
    startY: number;
    startScroll: number;
    pointerY: number;
    middles: number[];
    raf: number | null;
  } | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  /** Runs a group action; on success the list (and, on close, the board) updates. */
  function run(action: () => Promise<{ ok: true; groups: PhotoGroup[] } | { ok: false; message: string }>, then?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) return setError(res.message);
      setPhotoGroupList(res.groups);
      changed.current = true;
      then?.();
    });
  }

  function reorder(ids: string[]) {
    // Show the new order at once; the server's answer confirms it.
    setPhotoGroupList(ids.map((i) => groups.find((g) => g.id === i)!));
    run(() => orderPhotoGroups(ids));
  }

  /** Keyboard: arrow keys on a row's handle move it one place, and keep the focus on it. */
  function move(id: string, delta: -1 | 1) {
    const ids = groups.map((g) => g.id);
    const next = moveInOrder(ids, id, delta);
    if (next.every((v, i) => v === ids[i])) return;
    reorder(next);
    requestAnimationFrame(() => handles.current.get(id)?.focus());
  }

  /** Follows the pointer: how far the row has moved (scrolling included) and where it would land. */
  function follow() {
    const d = live.current;
    const list = listRef.current;
    if (!d || !list) return;
    const last = d.middles.length - 1;
    const raw = d.pointerY - d.startY + (list.scrollTop - d.startScroll);
    // It can't leave the list: from the first row's place to the last one's.
    const dy = Math.min(d.middles[last] - d.middles[d.from], Math.max(d.middles[0] - d.middles[d.from], raw));
    d.over = dropIndex(d.middles, d.from, d.middles[d.from] + dy);
    setDrag((prev) => (prev ? { ...prev, dy, over: d.over } : prev));
  }

  function startDrag(e: ReactPointerEvent<HTMLButtonElement>, index: number) {
    const list = listRef.current;
    if (pending || !list || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rows = [...list.querySelectorAll<HTMLElement>("[data-group-row]")];
    live.current = {
      from: index,
      over: index,
      startY: e.clientY,
      startScroll: list.scrollTop,
      pointerY: e.clientY,
      middles: rows.map((r) => r.offsetTop + r.offsetHeight / 2),
      raf: null,
    };
    setDrag({ from: index, over: index, dy: 0, height: rows[index]?.offsetHeight ?? 0 });
    // A long list scrolls while the row is held near its top or bottom edge.
    const tick = () => {
      const d = live.current;
      if (!d) return;
      const box = list.getBoundingClientRect();
      const speed =
        d.pointerY < box.top + SCROLL_EDGE
          ? -(box.top + SCROLL_EDGE - d.pointerY)
          : d.pointerY > box.bottom - SCROLL_EDGE
            ? d.pointerY - (box.bottom - SCROLL_EDGE)
            : 0;
      if (speed !== 0) {
        list.scrollTop += Math.max(-14, Math.min(14, speed / 3));
        follow();
      }
      d.raf = requestAnimationFrame(tick);
    };
    live.current.raf = requestAnimationFrame(tick);
  }

  function moveDrag(e: ReactPointerEvent) {
    if (!live.current) return;
    live.current.pointerY = e.clientY;
    follow();
  }

  function endDrag(drop: boolean) {
    const d = live.current;
    if (!d) return;
    if (d.raf !== null) cancelAnimationFrame(d.raf);
    live.current = null;
    setDrag(null);
    if (drop && d.over !== d.from) reorder(moveToIndex(groups.map((g) => g.id), d.from, d.over));
  }

  /** How far a row slides to make room for the one being dragged. */
  function shift(i: number) {
    if (!drag || i === drag.from) return 0;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -drag.height;
    if (drag.over < drag.from && i >= drag.over && i < drag.from) return drag.height;
    return 0;
  }

  function rename(group: PhotoGroup) {
    const name = cleanGroupName(draft);
    if (name === group.name) return setEditing(null);
    const problem = groupNameProblem(name, groups, group.id);
    if (problem) return setError(problem);
    run(() => renamePhotoGroup({ id: group.id, name }), () => setEditing(null));
  }

  function add() {
    const name = cleanGroupName(newName);
    const problem = groupNameProblem(name, groups);
    if (problem) return setError(problem);
    run(() => createPhotoGroup(name), () => setNewName(""));
  }

  function close() {
    if (changed.current) router.refresh();
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (!removing) close();
      }}
      aria-labelledby="groups-sheet-title"
      className="m-auto mb-0 w-full max-w-lg rounded-t-card border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-mint/70 backdrop:backdrop-blur-[2px] sm:mb-auto sm:rounded-card"
    >
      <div className="flex max-h-[85dvh] flex-col p-5 pb-[max(1.25rem,var(--safe-bottom))] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">your groups</p>
            <h2 id="groups-sheet-title" className="font-display text-xl font-semibold">
              Name them, put them in order
            </h2>
            <p className="mt-1 text-sm text-muted">The first one sits in the middle of your board. Hold the dots and drag to reorder.</p>
          </div>
          <button type="button" onClick={close} className="btn btn-ghost min-h-9 px-3" aria-label="Close">
            ✕
          </button>
        </div>

        <ol
          ref={listRef}
          className={`relative -mx-2 mt-4 min-h-0 flex-1 overflow-y-auto px-2 ${drag ? "select-none" : ""}`}
          aria-label="Groups, most important first"
        >
          {groups.length === 0 && (
            <li className="rounded-control bg-paper px-4 py-6 text-center text-sm text-ink-soft">
              No groups yet. Make your first one below.
            </li>
          )}
          {groups.map((g, i) => {
            const lifted = drag?.from === i;
            // While dragging, the rows show the order they'd have if it were dropped now.
            const place = drag ? (lifted ? drag.over : i + Math.sign(shift(i))) : i;
            return (
              <li
                key={g.id}
                data-group-row
                style={drag ? { transform: `translateY(${lifted ? drag.dy : shift(i)}px)` } : undefined}
                className={`flex items-center gap-1 border-b py-1.5 last:border-b-0 ${
                  lifted
                    ? "relative z-10 rounded-control border-transparent bg-card shadow-[0_10px_28px_rgb(var(--shadow)/0.22)]"
                    : `border-line ${drag ? "transition-transform duration-150 ease-out" : ""}`
                }`}
              >
                <button
                  type="button"
                  ref={(el) => {
                    if (el) handles.current.set(g.id, el);
                    else handles.current.delete(g.id);
                  }}
                  className={`grid size-9 shrink-0 touch-none place-items-center rounded-full text-muted hover:bg-paper-deep hover:text-ink-soft disabled:opacity-40 ${
                    lifted ? "cursor-grabbing text-ocean" : "cursor-grab"
                  }`}
                  disabled={pending && !drag}
                  aria-label={`Reorder ${g.name}, place ${i + 1} of ${groups.length}. Drag, or use the up and down arrow keys.`}
                  onPointerDown={(e) => startDrag(e, i)}
                  onPointerMove={moveDrag}
                  onPointerUp={() => endDrag(true)}
                  onPointerCancel={() => endDrag(false)}
                  onLostPointerCapture={() => endDrag(true)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      move(g.id, e.key === "ArrowUp" ? -1 : 1);
                    }
                  }}
                >
                  <GripIcon width={18} height={18} />
                </button>
                <span className="w-5 shrink-0 text-center text-sm font-bold text-muted tabular-nums">{place + 1}</span>
                {editing === g.id ? (
                  <form
                    className="flex min-w-0 flex-1 gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename(g);
                    }}
                  >
                    <label htmlFor={`rename-${g.id}`} className="sr-only">
                      New name for {g.name}
                    </label>
                    <input
                      id={`rename-${g.id}`}
                      value={draft}
                      maxLength={40}
                      autoFocus
                      autoComplete="off"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditing(null);
                        }
                      }}
                      className="field min-h-10 min-w-0 flex-1 px-3"
                    />
                    <button type="submit" className="btn btn-primary min-h-10 px-3" disabled={pending}>
                      Save
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate px-1 font-semibold">{g.name}</span>
                    <span className="shrink-0 px-1 text-xs font-bold text-muted">{counts.get(g.id) ?? 0}</span>
                    <button
                      type="button"
                      className={arrow}
                      onClick={() => {
                        setEditing(g.id);
                        setDraft(g.name);
                        setError(null);
                      }}
                      aria-label={`Rename ${g.name}`}
                    >
                      <PencilIcon width={17} height={17} />
                    </button>
                    <button type="button" className={`${arrow} text-wax`} onClick={() => setRemoving(g)} aria-label={`Delete ${g.name}`}>
                      <TrashIcon width={17} height={17} />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ol>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label htmlFor="groups-sheet-new" className="sr-only">
            New group name
          </label>
          <input
            id="groups-sheet-new"
            value={newName}
            maxLength={40}
            autoComplete="off"
            onChange={(e) => setNewName(e.target.value)}
            className="field min-h-11 flex-1 px-3"
            placeholder="Name a new group"
          />
          <button type="submit" className="btn btn-primary" disabled={pending || newName.trim() === ""}>
            Add
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-2 text-sm text-wax">
            {error}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        tone="danger"
        title={`Delete “${removing?.name ?? ""}”?`}
        confirmLabel="Delete group"
        pending={pending}
        onConfirm={() => {
          const g = removing;
          if (g) run(() => deletePhotoGroup(g.id), () => setRemoving(null));
        }}
        onCancel={() => setRemoving(null)}
      >
        The group goes, but its photos stay in your calendar and on the board.
      </ConfirmDialog>
    </dialog>
  );
}
