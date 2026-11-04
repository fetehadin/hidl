import type { NextRequest } from "next/server";
import { appError, appOk, openFromApp } from "@/lib/app-auth";
import { appRedeemSchema } from "@/lib/validation/app-auth";

export const dynamic = "force-dynamic";

/** Phone app, "Continue with Google" step 3: the app trades the sealed blob plus its secret for the session. */
export async function POST(request: NextRequest) {
  const parsed = appRedeemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return appError(400, "invalid-request", "Sign-in failed. Try again.");
  const session = openFromApp(parsed.data.blob, parsed.data.secret);
  if (!session) return appError(401, "expired", "That sign-in took too long. Try again.");
  return appOk({ session });
}
