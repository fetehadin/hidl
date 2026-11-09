import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { calendarPref } from "@/lib/dates";
import { isAdminEmail, isSuperAdminEmail, isAllowedEmail, publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { TZ_COOKIE, resolveTimeZone } from "@/lib/time";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component: cookies are read-only there.
            // The proxy refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Verifies the session server-side and returns the signed-in, allowlisted user.
 * Use in every server component, server action and route handler that touches data.
 */
export async function requireUser() {
  const [supabase, cookieStore] = await Promise.all([createClient(), cookies()]);
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) redirect("/login");
  if (!isAllowedEmail(claims.email)) {
    await supabase.auth.signOut();
    redirect("/login?error=not-allowed");
  }

  const metadata = claims.user_metadata as Record<string, unknown> | undefined;
  return {
    supabase,
    user: { id: claims.sub, email: claims.email as string },
    /** Which calendar to show dates in (see src/lib/dates.ts). */
    calendar: calendarPref(metadata?.calendar),
    /**
     * The user's IANA time zone, for "today" and every displayed time (see src/lib/time.ts).
     * From the cookie TimeZoneSync keeps matched to the device; DEFAULT_TZ until the first sync.
     */
    timeZone: resolveTimeZone(cookieStore.get(TZ_COOKIE)?.value),
  };
}

/**
 * requireUser() plus "is an admin" (public.admins, via is_admin()). Non-admins get a 404, so the
 * panel's existence isn't advertised. The database checks again inside every admin_* function,
 * so this is the UX gate, not the security boundary.
 */
export async function requireAdmin() {
  const ctx = await requireUser();
  const role = await getAdminRole(ctx.supabase, ctx.user);
  if (!role) notFound();
  return { ...ctx, role };
}

export type AdminRole = "admin" | "super";

/** Whether the signed-in user is an admin (of either level). False on any error (fails closed). */
export async function isAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user?: { id: string; email: string },
) {
  return (await getAdminRole(supabase, user)) !== null;
}

/**
 * The signed-in user's admin role: "super", "admin", or null. Null on any error (fails closed).
 *
 * Pass `user` to also honor SUPER_ADMIN_EMAIL and ADMIN_EMAIL: an address on one of those lists is
 * given that role in public.admins the first time it asks (raised, never lowered; the email on a
 * session is already verified by the code or Google), so the first admins need no SQL. The
 * database stays the single source of truth for who is an admin and at what level.
 */
export async function getAdminRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user?: { id: string; email: string },
): Promise<AdminRole | null> {
  const { data, error } = await supabase.rpc("my_admin_role");
  if (error) {
    console.error("getAdminRole", error);
    return null;
  }
  const role = data === "super" || data === "admin" ? (data as AdminRole) : null;
  if (role === "super" || !user) return role;

  const wanted: AdminRole | null = isSuperAdminEmail(user.email) ? "super" : isAdminEmail(user.email) ? "admin" : null;
  if (!wanted || wanted === role) return role;

  // Service role: admins has no grants for anyone else. Only reached for addresses on the lists.
  // Update first, then insert (no .upsert(), which would also lower a role it shouldn't touch).
  const admin = createAdminClient();
  const { data: updated, error: updateError } = await admin.from("admins").update({ role: wanted }).eq("user_id", user.id).select("user_id");
  const { error: grantError } =
    updateError || (updated && updated.length > 0) ? { error: updateError } : await admin.from("admins").insert({ user_id: user.id, role: wanted });
  if (grantError) {
    console.error("getAdminRole: granting from the email list", grantError);
    return role;
  }
  return wanted;
}
