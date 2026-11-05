import { z } from "zod";

export const userIdSchema = z.uuid();

/** How long a suspension lasts. "forever" is Supabase's longest ban (about 100 years). */
export const SUSPEND_FOR = { "1d": "24h", "7d": "168h", "30d": "720h", forever: "876000h" } as const;

export const suspendSchema = z.object({
  userId: userIdSchema,
  duration: z.enum(Object.keys(SUSPEND_FOR) as [keyof typeof SUSPEND_FOR, ...(keyof typeof SUSPEND_FOR)[]]),
});

export const adminListSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
