import "server-only";
import { publicEnv } from "@/lib/env";

let cached: { value: boolean; at: number } | null = null;
const TTL_MS = 60_000;

/**
 * Whether Google sign-in is switched on in Supabase (Authentication → Sign In / Providers).
 * Read from Auth's public settings endpoint so the button appears by itself once it's set
 * up, and never shows as a broken button before. Successful answers are remembered for a
 * minute per server instance; a failed lookup isn't remembered, so a blip can't hide the
 * button for long.
 */
export async function googleSignInEnabled() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const res = await fetch(`${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return cached?.value ?? false;
    const settings = (await res.json()) as { external?: { google?: boolean } };
    cached = { value: settings.external?.google === true, at: Date.now() };
    return cached.value;
  } catch {
    return cached?.value ?? false;
  }
}
