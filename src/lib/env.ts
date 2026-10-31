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
