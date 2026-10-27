import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
  throw new Error("Integration tests must run against a local Supabase, not " + url);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export const admin = createClient(url, secretKey, opts);
export const anon = () => createClient(url, publishableKey, opts);

export type TestUser = { id: string; email: string; client: SupabaseClient };

/** Creates a confirmed user and returns a client signed in as them. */
export async function createTestUser(): Promise<TestUser> {
  const email = `test-${randomUUID()}@hidl.test`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;

  const client = anon();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

export async function deleteTestUser(user: TestUser | undefined) {
  if (user) await admin.auth.admin.deleteUser(user.id);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();
