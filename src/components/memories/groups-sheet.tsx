"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPhotoGroup, deletePhotoGroup, orderPhotoGroups, renamePhotoGroup } from "@/actions/photo-groups";
import { setPhotoGroupList, usePhotoGroups } from "@/components/calendar/photo-groups-store";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { type PhotoGroup, cleanGroupName, groupNameProblem, moveInOrder } from "@/lib/photo-groups";

const arrow = "grid size-9 place-items-center rounded-full text-ocean hover:bg-mint disabled:opacity-25";

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

  function move(id: string, delta: -1 | 1) {
    const ids = moveInOrder(groups.map((g) => g.id), id, delta);
    // Show the new order at once; the server's answer confirms it.
    setPhotoGroupList(ids.map((i) => groups.find((g) => g.id === i)!));
    run(() => orderPhotoGroups(ids));
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
            <p className="mt-1 text-sm text-muted">The first one sits in the middle of your board.</p>
          </div>
          <button type="button" onClick={close} className="btn btn-ghost min-h-9 px-3" aria-label="Close">
            ✕
          </button>
        </div>

        <ol className="-mx-2 mt-4 min-h-0 flex-1 overflow-y-auto px-2" aria-label="Groups, most important first">
          {groups.length === 0 && (
            <li className="rounded-control bg-paper px-4 py-6 text-center text-sm text-ink-soft">
              No groups yet. Make your first one below.
            </li>
          )}
          {groups.map((g, i) => (
            <li key={g.id} className="flex items-center gap-1 border-b border-line py-1.5 last:border-b-0">
              <span className="w-6 shrink-0 text-center text-sm font-bold text-muted tabular-nums">{i + 1}</span>
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
                  <button type="button" className={arrow} onClick={() => move(g.id, -1)} disabled={pending || i === 0} aria-label={`Move ${g.name} up`}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className={arrow}
                    onClick={() => move(g.id, 1)}
                    disabled={pending || i === groups.length - 1}
                    aria-label={`Move ${g.name} down`}
                  >
                    ↓
                  </button>
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
          ))}
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
