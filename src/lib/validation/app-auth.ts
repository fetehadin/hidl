import { z } from "zod";
import { loginSchema } from "./auth";

export const appEmailStartSchema = loginSchema;

export const appEmailVerifySchema = loginSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email."),
});

export const appRedeemSchema = z.object({
  blob: z.string().min(40).max(8000),
  secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export const appCodeSchema = z.object({ code: z.string().max(40) });

export const appWidgetSchema = z.object({ replace: z.boolean().default(false) });
