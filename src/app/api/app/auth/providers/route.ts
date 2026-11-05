import { appOk } from "@/lib/app-auth";
import { googleSignInEnabled } from "@/lib/auth-providers";

export const dynamic = "force-dynamic";

/**
 * Phone app: which sign-in methods are switched on, so the app only shows "Continue with Google"
 * when it will work (the website's login page does the same). Nothing secret in the answer.
 */
export async function GET() {
  return appOk({ google: await googleSignInEnabled() });
}
