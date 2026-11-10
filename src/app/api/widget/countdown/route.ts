import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeUnits, timeLeft } from "@/lib/countdown-units";
import { daysUntil, resolveTimeZone } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated-by-session, authenticated-by-token read-only feed for a home-screen
 * widget (see src/actions/countdowns.ts generateWidgetToken). A token serves exactly one
 * countdown: the one it was made for, or (for the account feed) the next one coming up, plus the
 * list the phone app's widget flips through. Never letters or photos.
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
  // The owner's zone (no session here), so "days left" matches what they see in the app.
  const [{ data }, { data: settings }] = await Promise.all([
    tokenRow.countdown_id ? query.eq("id", tokenRow.countdown_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("user_settings").select("time_zone").eq("user_id", tokenRow.user_id).maybeSingle(),
  ]);
  const timeZone = resolveTimeZone(settings?.time_zone);

  // The account feed shows the next one coming up (there's no starring any more).
  let countdown = data;
  if (!countdown && !tokenRow.countdown_id) {
    ({ data: countdown } = await admin
      .from("countdowns")
      .select("kind, title, target_at, target_score, max_score, actual_score, details, units")
      .eq("user_id", tokenRow.user_id)
      .gt("target_at", new Date().toISOString())
      .order("target_at", { ascending: true })
      .limit(1)
      .maybeSingle());
  }
  // The account's feed (no fixed countdown) also lists every countdown still to come, soonest
  // first, so the phone app's widgets can flip through them all. Ones that ended in the last 7
  // days stay, so the widget can say "+2 days ago".
  let countdowns: Record<string, unknown>[] | undefined;
  if (!tokenRow.countdown_id) {
    const { data: all } = await admin
      .from("countdowns")
      .select("id, kind, title, target_at, target_score, max_score, actual_score, units, created_at")
      .eq("user_id", tokenRow.user_id)
      .gt("target_at", new Date(Date.now() - 7 * 24 * 3_600_000).toISOString())
      .order("target_at", { ascending: true })
      .limit(30);
    countdowns = (all ?? []).map((c) => {
      const units = normalizeUnits(c.units);
      const ended = new Date(c.target_at).getTime() <= Date.now();
      return {
        id: c.id,
        kind: c.kind,
        title: c.title,
        targetAt: c.target_at,
        targetScore: c.target_score,
        maxScore: c.max_score,
        actualScore: c.actual_score,
        // Kept for app versions that still read it (a public contract); nothing is starred now.
        starred: false,
        createdAt: c.created_at,
        done: ended,
        units,
        remaining: Object.fromEntries(ended ? [] : timeLeft(c.target_at, Date.now(), units, timeZone).map((p) => [p.unit, p.value])),
      };
    });
  }

  if (!countdown) {
    // Nothing to come. Old widgets read the 404; the list widget reads `countdowns`
    // (empty, or one that just ended).
    return NextResponse.json({ error: "no countdown yet", ...(countdowns ? { countdowns } : {}) }, { status: 404 });
  }

  const done = new Date(countdown.target_at).getTime() <= Date.now();
  return NextResponse.json(
    {
      kind: countdown.kind,
      title: countdown.title,
      targetAt: countdown.target_at,
      targetScore: countdown.target_score,
      maxScore: countdown.max_score,
      actualScore: countdown.actual_score,
      details: countdown.details,
      done,
      daysLeft: done ? 0 : daysUntil(countdown.target_at, timeZone),
      timeZone,
      // The time left in the countdown's chosen units, e.g. { months: 7, days: 13 }.
      units: normalizeUnits(countdown.units),
      remaining: Object.fromEntries(
        done ? [] : timeLeft(countdown.target_at, Date.now(), normalizeUnits(countdown.units), timeZone).map((p) => [p.unit, p.value]),
      ),
      ...(countdowns ? { countdowns } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
