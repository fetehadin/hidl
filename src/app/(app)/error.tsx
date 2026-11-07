"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <div className="card mt-6 p-6 text-center">
      <p className="font-display text-2xl">Something smudged the ink.</p>
      <p className="mt-1 text-ink-soft">That didn&apos;t load. Try again.</p>
      <button type="button" onClick={reset} className="btn btn-primary mt-4">
        Try again
      </button>
    </div>
  );
}
