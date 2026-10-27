import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resendSender, sendUnlockEmails } from "@/lib/unlock-emails";

export const dynamic = "force-dynamic";

const envSchema = z.object({
  CRON_SECRET: z.string().min(16),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url(),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
});

function authorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Daily Vercel Cron (see vercel.json). Off unless ENABLE_UNLOCK_EMAILS=true. */
export async function GET(request: NextRequest) {
  if (process.env.ENABLE_UNLOCK_EMAILS !== "true") {
    return NextResponse.json({ skipped: "ENABLE_UNLOCK_EMAILS is not true" });
  }

  const env = envSchema.safeParse(process.env);
  if (!env.success) {
    console.error("unlock-emails: missing configuration", z.treeifyError(env.error));
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  if (!authorized(request.headers.get("authorization"), env.data.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createClient(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await sendUnlockEmails(
    admin,
    resendSender(env.data.RESEND_API_KEY, env.data.EMAIL_FROM),
    env.data.NEXT_PUBLIC_SITE_URL,
  );
  return NextResponse.json(result);
}
