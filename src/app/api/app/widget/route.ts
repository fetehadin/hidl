import type { NextRequest } from "next/server";
import { appError, appOk, statelessClient } from "@/lib/app-auth";
import { issueWidgetToken } from "@/lib/data/widget-token";
import { isAllowedEmail, publicEnv } from "@/lib/env";
import { appWidgetSchema } from "@/lib/validation/app-auth";

export const dynamic = "force-dynamic";

/**
 * Phone app: sets up the home-screen widget right after sign-in, so nobody pastes links.
 * Gives the app a feed URL for the account's starred countdown. If that feed already has a
 * token (a widget set up elsewhere), it answers `exists` unless the caller passes `replace: true`,
 * which is what the app does: the phone's own widget takes over from older links without asking.
 */
export async function POST(request: NextRequest) {
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!accessToken) return appError(401, "signed-out", "Sign in first.");
  const parsed = appWidgetSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return appError(400, "invalid-request", "Invalid request.");

  const supabase = statelessClient(accessToken);
  const { data: claims } = await supabase.auth.getClaims(accessToken);
  const userId = claims?.claims.sub;
  if (!userId) return appError(401, "signed-out", "Sign in first.");
  if (!isAllowedEmail(claims.claims.email as string | undefined)) return appError(403, "not-allowed", "This journal is private.");

  if (!parsed.data.replace) {
    const { data: existing, error } = await supabase.from("widget_tokens").select("created_at").is("countdown_id", null).maybeSingle();
    if (error) return appError(502, "failed", "Couldn't set up the widget.");
    if (existing) return appOk({ status: "exists" });
  }

  const issued = await issueWidgetToken(supabase, userId, null);
  if (!issued.ok) {
    console.error("app widget token", issued.error);
    return appError(502, "failed", "Couldn't set up the widget.");
  }
  return appOk({ status: "created", feedUrl: `${publicEnv.NEXT_PUBLIC_SITE_URL}/api/widget/countdown?token=${issued.token}` });
}
