"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function NativeHandoff() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    // Out of the address bar and history before anything else.
    window.history.replaceState(null, "", window.location.pathname);
    if (!access_token || !refresh_token) {
      window.location.replace("/login");
      return;
    }
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) setFailed(true);
        else window.location.replace("/");
      });
  }, []);

  if (!failed) return null;
  return (
    <p className="text-ink-soft">
      That didn&rsquo;t work. <a href="/login" className="font-semibold text-accent underline">Sign in again</a>
    </p>
  );
}
