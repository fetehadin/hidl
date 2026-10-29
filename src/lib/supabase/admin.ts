import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { publicEnv } from "@/lib/env";

const adminSchema = z.object({ SUPABASE_SECRET_KEY: z.string().min(1) });

/** Service-role client. Bypasses RLS — only for admin actions like account deletion. */
export function createAdminClient() {
  const { SUPABASE_SECRET_KEY } = adminSchema.parse({ SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY });
  return createSupabaseClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
