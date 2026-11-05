import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { resendSender, sendUnlockEmails } from "@/lib/unlock-emails";

export const dynamic = "force-dynamic";

// NEXT_PUBLIC_* come from publicEnv (inlined at build time): the Docker image only gets them as
// build args, so they aren't in process.env at runtime.
const envSchema = z.object({
  CRON_SECRET: z.string().min(16),
  SUPABASE_SECRET_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
});

function authorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Daily cron: Vercel Cron (vercel.json) or the `cron` service in deploy/docker-compose.yml. Off unless ENABLE_UNLOCK_EMAILS=true. */
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

  const admin = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, env.data.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await sendUnlockEmails(
    admin,
    resendSender(env.data.RESEND_API_KEY, env.data.EMAIL_FROM),
    publicEnv.NEXT_PUBLIC_SITE_URL,
  );
  return NextResponse.json(result);
}
