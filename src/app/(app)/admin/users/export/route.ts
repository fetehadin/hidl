import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { listUsers } from "@/lib/data/admin";
import { isAdmin, requireUser } from "@/lib/supabase/server";
import { todayISO } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Every account as CSV: email, dates and counts (never content). Logged in the audit log. */
export async function GET() {
  const { supabase, timeZone } = await requireUser();
  if (!(await isAdmin(supabase))) return new NextResponse("Not found", { status: 404 });

  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await listUsers(supabase, { limit: 1000, offset });
    rows.push(...page.rows);
    if (page.rows.length < 1000) break;
  }
  const { error } = await supabase.rpc("admin_log", { p_action: "users.export", p_details: { rows: rows.length } });
  if (error) console.error("users export log", error);

  const csv = toCsv(
    ["id", "email", "created_at", "last_sign_in_at", "last_active", "suspended_until", "is_admin", "letters", "photos", "countdowns", "feedback"],
    rows.map((u) => [u.id, u.email, u.created_at, u.last_sign_in_at, u.last_active, u.banned_until, u.is_admin, u.letters, u.photos, u.countdowns, u.feedback]),
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hidl-users-${todayISO(timeZone)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
