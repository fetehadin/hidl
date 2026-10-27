"use client";

import { useEffect } from "react";
import { DRAFT_KEY } from "./letter-form";

/** Rendered after a successful seal: the local draft is no longer needed. */
export function ClearDraft() {
  useEffect(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }, []);
  return null;
}
