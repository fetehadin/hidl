"use client";

import { createContext, useContext } from "react";
import type { AvatarConfig } from "@/lib/avatar";

/**
 * The signed-in user's buddy, for the app's pages (provided by the (app) layout). When set,
 * <Mascot> draws the buddy instead of Hidi, except where it's the brand logo. Null (no buddy
 * yet, or a public page with no provider) means Hidi.
 */
const BuddyContext = createContext<AvatarConfig | null>(null);

export function BuddyProvider({ value, children }: { value: AvatarConfig | null; children: React.ReactNode }) {
  return <BuddyContext.Provider value={value}>{children}</BuddyContext.Provider>;
}

export function useBuddy() {
  return useContext(BuddyContext);
}
