"use client";

import { useEffect, useSyncExternalStore } from "react";
import { myPhotoGroups } from "@/actions/photo-groups";
import type { PhotoGroup } from "@/lib/photo-groups";

/*
 * The person's photo groups, shared by every picker on the page (upload sheet, photo viewer,
 * the groups sheet). Pages that already have them (Memories) put them in with setPhotoGroupList; elsewhere the first picker
 * asks the server once. Every group action answers with the new list, which goes straight in.
 */
let groups: PhotoGroup[] | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setPhotoGroupList(next: PhotoGroup[]) {
  groups = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function load() {
  if (groups !== null || loading) return;
  loading = myPhotoGroups()
    .then((res) => {
      if (res.ok) setPhotoGroupList(res.groups);
    })
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
}

/** The groups, in the person's order; null until known. */
export function usePhotoGroups() {
  const value = useSyncExternalStore(subscribe, () => groups, () => null);
  useEffect(load, []);
  return value;
}
