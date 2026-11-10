"use client";

import { useState, useTransition } from "react";
import { createPhotoGroup } from "@/actions/photo-groups";
import { PlusIcon } from "@/components/icons";
import { type PhotoGroup, cleanGroupName, groupNameProblem } from "@/lib/photo-groups";
import { setPhotoGroupList, usePhotoGroups } from "./photo-groups-store";

/**
 * Chips for the person's own groups, in their order: tap to put the photo in a group or take it
 * out. "New group" makes one by name and puts the photo straight in it. No suggested names: the
 * groups are whatever the person wants them to be.
 */
export function PhotoGroupPicker({
  value,
  onChange,
  disabled,
  oneRow = false,
  className = "",
}: {
  /** Ids of the groups the photo is in. */
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** One swipeable row instead of wrapping (where height is scarce, like under a photo). */
  oneRow?: boolean;
  className?: string;
}) {
  const groups = usePhotoGroups();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((g) => g !== id) : [...value, id]);
  }

  function create() {
    const clean = cleanGroupName(name);
    const problem = groupNameProblem(clean, groups ?? []);
    if (problem) return setError(problem);
    setError(null);
    startTransition(async () => {
      const res = await createPhotoGroup(clean);
      if (!res.ok) return setError(res.message);
      setPhotoGroupList(res.groups);
      setName("");
      setAdding(false);
      onChange([...value, res.id]);
    });
  }

  const chip = "flex min-h-9 shrink-0 items-center gap-1 rounded-full border-2 px-3 text-sm font-bold whitespace-nowrap transition-colors";

  return (
    <div className={className}>
      <div
        role="group"
        aria-label="Groups"
        className={`flex gap-1.5 ${oneRow ? "-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" : "flex-wrap"}`}
      >
        {(groups ?? []).map((g: PhotoGroup) => {
          const on = value.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => toggle(g.id)}
              className={`${chip} disabled:opacity-40 ${on ? "border-teal bg-mint text-ocean" : "border-line bg-white text-ink-soft hover:bg-mint/60"}`}
            >
              {on && <span aria-hidden>✓</span>}
              {g.name}
            </button>
          );
        })}
        {!adding && (
          <button
            type="button"
            disabled={disabled || groups === null}
            onClick={() => {
              setAdding(true);
              setError(null);
            }}
            className={`${chip} border-dashed border-teal text-ocean hover:bg-mint/60 disabled:opacity-40`}
          >
            <PlusIcon width={16} height={16} />
            New group
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-2 flex gap-2">
          <label htmlFor="new-photo-group" className="sr-only">
            New group name
          </label>
          <input
            id="new-photo-group"
            value={name}
            maxLength={40}
            autoFocus
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setAdding(false);
              }
            }}
            className="field min-h-10 flex-1 px-3"
            placeholder="Name your group"
          />
          <button type="button" className="btn btn-primary min-h-10" onClick={create} disabled={pending}>
            {pending ? "Adding…" : "Add"}
          </button>
          <button type="button" className="btn btn-ghost min-h-10 px-3" onClick={() => setAdding(false)} aria-label="Cancel new group">
            ✕
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-wax">
          {error}
        </p>
      )}
    </div>
  );
}
