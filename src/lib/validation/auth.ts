import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
});

/** An email plus the 6-digit code from the sign-in email (website and phone app). */
export const emailCodeSchema = loginSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email."),
});

/** Only allow same-site relative redirects after sign-in. */
export const nextPathSchema = z
  .string()
  .regex(/^\/(?!\/)[\w\-/?=&%.]*$/)
  .catch("/");
