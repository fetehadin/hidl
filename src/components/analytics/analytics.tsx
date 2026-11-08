"use client";

import { useEffect } from "react";
import type { PostHog } from "posthog-js";
import { publicEnv } from "@/lib/public-env";

// Product analytics (PostHog): page views and active people, nothing more. Off unless
// NEXT_PUBLIC_POSTHOG_KEY is set. Autocapture and session recording stay off on purpose:
// they would read what's on screen, and that can be a letter or a caption. People are
// identified by their account id only, never their email.

let loading: Promise<PostHog> | null = null;

function posthog() {
  loading ??= import("posthog-js").then(({ default: ph }) => {
    ph.init(publicEnv.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: publicEnv.NEXT_PUBLIC_POSTHOG_HOST,
      capture_pageview: "history_change",
      capture_pageleave: true,
      autocapture: false,
      disable_session_recording: true,
      disable_surveys: true,
      person_profiles: "identified_only",
      respect_dnt: true,
    });
    return ph;
  });
  return loading;
}

/**
 * Mount once per layout. `userId` ties the visit to an account (signed-in pages); `signedOut`
 * forgets the last account on this device (the sign-in page), so the next person starts fresh.
 */
export function Analytics({ userId, signedOut = false }: { userId?: string; signedOut?: boolean }) {
  useEffect(() => {
    if (!publicEnv.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog()
      .then((ph) => {
        if (userId && ph.get_distinct_id() !== userId) ph.identify(userId);
        else if (signedOut && ph._isIdentified()) ph.reset();
      })
      .catch(() => {});
  }, [userId, signedOut]);
  return null;
}
