import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysUntil } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated-by-session, authenticated-by-token read-only feed for a home-screen
 * widget (see src/actions/exam.ts generateWidgetToken). Exposes only the exam countdown —
 * never letters or photos — and nothing the owner didn't already choose to put here.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });

  const widget_token_hash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();
  const { data } = await admin
    .from("exam_settings")
    .select("exam_name, exam_at, target_score, max_score, actual_score")
    .eq("widget_token_hash", widget_token_hash)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "invalid token" }, { status: 404 });

  const done = new Date(data.exam_at).getTime() <= Date.now();
  return NextResponse.json(
    {
      examName: data.exam_name,
      examAt: data.exam_at,
      targetScore: data.target_score,
      maxScore: data.max_score,
      actualScore: data.actual_score,
      done,
      daysLeft: done ? 0 : daysUntil(data.exam_at),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
