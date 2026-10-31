import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysUntil } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated-by-session, authenticated-by-token read-only feed for a home-screen
 * widget (see src/actions/countdowns.ts generateWidgetToken). Exposes only whichever one
 * countdown its owner starred for the widget — never letters or photos, and never any
 * countdown the owner didn't flag.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });

  const token_hash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();

  const { data: tokenRow } = await admin.from("widget_tokens").select("user_id").eq("token_hash", token_hash).maybeSingle();
  if (!tokenRow) return NextResponse.json({ error: "invalid token" }, { status: 404 });

  const { data } = await admin
    .from("countdowns")
    .select("kind, title, target_at, target_score, max_score, actual_score, details")
    .eq("user_id", tokenRow.user_id)
    .eq("is_widget", true)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "no countdown is starred for the widget" }, { status: 404 });

  const done = new Date(data.target_at).getTime() <= Date.now();
  return NextResponse.json(
    {
      kind: data.kind,
      title: data.title,
      targetAt: data.target_at,
      targetScore: data.target_score,
      maxScore: data.max_score,
      actualScore: data.actual_score,
      details: data.details,
      done,
      daysLeft: done ? 0 : daysUntil(data.target_at),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
