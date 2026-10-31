import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeUnits, timeLeft } from "@/lib/countdown-units";
import { daysUntil } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated-by-session, authenticated-by-token read-only feed for a home-screen
 * widget (see src/actions/countdowns.ts generateWidgetToken). A token serves exactly one
 * countdown: the one it was made for, or (for the account's starred-feed token) whichever
 * one its owner starred. Never letters or photos, and never any other countdown.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });

  const token_hash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();

  const { data: tokenRow } = await admin
    .from("widget_tokens")
    .select("user_id, countdown_id")
    .eq("token_hash", token_hash)
    .maybeSingle();
  if (!tokenRow) return NextResponse.json({ error: "invalid token" }, { status: 404 });

  const query = admin
    .from("countdowns")
    .select("kind, title, target_at, target_score, max_score, actual_score, details, units")
    .eq("user_id", tokenRow.user_id);
  const { data } = await (tokenRow.countdown_id ? query.eq("id", tokenRow.countdown_id) : query.eq("is_widget", true)).maybeSingle();

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
      // The time left in the countdown's chosen units, e.g. { months: 7, days: 13 }.
      units: normalizeUnits(data.units),
      remaining: Object.fromEntries(
        done ? [] : timeLeft(data.target_at, Date.now(), normalizeUnits(data.units)).map((p) => [p.unit, p.value]),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
