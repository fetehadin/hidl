import type { NextRequest } from "next/server";
import { appError, appOk, statelessClient, toAppSession } from "@/lib/app-auth";
import { hashAppCode, normalizeAppCode } from "@/lib/app-code";
import { isAllowedEmail } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { appCodeSchema } from "@/lib/validation/app-auth";

export const dynamic = "force-dynamic";

const WHY: Record<string, [number, string, string]> = {
  invalid: [401, "invalid-code", "That code isn't right. Check it, or get a new one on the website."],
  used: [410, "used-code", "That code was already used or replaced. Get a new one on the website."],
  expired: [410, "expired-code", "That code has expired. Get a new one on the website."],
};

/**
 * Phone app: signs in with a one-time code from an open website tab (Account → "Get a code").
 * The code is checked and spent in one database call (redeem_app_handoff), then a fresh session
 * is minted for that account the same way an emailed sign-in link would, and handed to the app.
 */
export async function POST(request: NextRequest) {
  const parsed = appCodeSchema.safeParse(await request.json().catch(() => null));
  const code = parsed.success ? normalizeAppCode(parsed.data.code) : null;
  if (!code) return appError(400, "invalid-code", "Codes are 8 letters and numbers, like K7M2-Q9XP.");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("redeem_app_handoff", { p_code_hash: hashAppCode(code) });
  if (error) {
    console.error("appCode redeem", error);
    return appError(500, "failed", "Something went wrong. Try again.");
  }
  const row = (data as { out_user: string | null; out_status: string }[])[0];
  if (!row?.out_user || row.out_status !== "ok") {
    const [status, why, message] = WHY[row?.out_status ?? "invalid"] ?? WHY.invalid;
    return appError(status, why, message);
  }

  const { data: found } = await admin.auth.admin.getUserById(row.out_user);
  const email = found.user?.email;
  // The allowlist can change after the code was made.
  if (!email || !isAllowedEmail(email)) return appError(403, "not-allowed", "This journal is private.");

  // A sign-in link that's never emailed: generated and used right here.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link.properties?.hashed_token) {
    console.error("appCode link", linkError);
    return appError(500, "failed", "Something went wrong. Try again.");
  }
  const { data: signedIn, error: verifyError } = await statelessClient().auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError || !signedIn.session) {
    // A suspended account can't sign in.
    return appError(403, "not-allowed", "This account can't sign in right now.");
  }
  return appOk({ session: toAppSession(signedIn.session) });
}
