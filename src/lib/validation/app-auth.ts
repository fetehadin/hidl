import { z } from "zod";
import { emailCodeSchema, loginSchema } from "./auth";

export const appEmailStartSchema = loginSchema;

export const appEmailVerifySchema = emailCodeSchema;

export const appRedeemSchema = z.object({
  blob: z.string().min(40).max(8000),
  secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export const appCodeSchema = z.object({ code: z.string().max(40) });

export const appWidgetSchema = z.object({ replace: z.boolean().default(false) });
