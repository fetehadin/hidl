"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { relativeUntil } from "@/lib/time";

/** "Opens in 41 days" that keeps itself current and refreshes the page when the moment arrives. */
export function LiveRelative({ target, prefix = "Opens" }: { target: string; prefix?: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const ms = new Date(target).getTime() - Date.now();
    const tick = setInterval(() => setNow(new Date()), ms < 3_600_000 ? 1_000 : 30_000);
    // setTimeout caps at ~24.8 days; beyond that the interval above keeps the label fresh.
    const unlock = ms > 0 && ms < 2 ** 31 - 1 ? setTimeout(() => router.refresh(), ms + 500) : undefined;
    return () => {
      clearInterval(tick);
      if (unlock) clearTimeout(unlock);
    };
  }, [target, router]);

  const phrase = relativeUntil(target, now);
  return (
    <span suppressHydrationWarning>
      {prefix} {phrase}
    </span>
  );
}
