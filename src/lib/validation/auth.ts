import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
});

/** Only allow same-site relative redirects after sign-in. */
export const nextPathSchema = z
  .string()
  .regex(/^\/(?!\/)[\w\-/?=&%.]*$/)
  .catch("/");
