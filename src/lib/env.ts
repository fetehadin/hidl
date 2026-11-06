import { z } from "zod";

export { publicEnv } from "./public-env";

const serverSchema = z.object({
  ALLOWED_EMAIL: z
    .string()
    .min(1)
    .transform((s) => s.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)),
});

export function serverEnv() {
  return serverSchema.parse({ ALLOWED_EMAIL: process.env.ALLOWED_EMAIL });
}

export function isAllowedEmail(email: string | null | undefined) {
  if (!email) return false;
  const allowed = serverEnv().ALLOWED_EMAIL;
  if (allowed.includes("*")) return true;
  return allowed.includes(email.toLowerCase());
}

/**
 * Emails that are admins the moment they sign in (ADMIN_EMAIL, comma-separated, optional).
 * Read straight from the environment: it's a plain list, and the app must still start without it.
 */
export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAIL ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}
