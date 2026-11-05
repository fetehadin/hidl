import type { Metadata } from "next";
import type { ReactNode } from "react";
import { formatWhen } from "@/lib/admin-format";
import { googleSignInEnabled } from "@/lib/auth-providers";
import { getAdminStats } from "@/lib/data/admin";
import { publicEnv, serverEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "System" };

type Check = { label: string; ok: boolean | null; value: ReactNode; hint?: string };

/**
 * How this server is set up: which optional features are on and whether their settings are
 * present. Only says whether a secret is set, never what it is.
 */
export default async function AdminSystemPage() {
  const { supabase, calendar, timeZone } = await requireAdmin();

  const [[stats, dbMs], google] = await Promise.all([timed(() => getAdminStats(supabase)), googleSignInEnabled()]);

  const allowed = serverEnv().ALLOWED_EMAIL;
  const unlockOn = process.env.ENABLE_UNLOCK_EMAILS === "true";
  const has = (name: string) => Boolean(process.env[name]?.trim());
  const version = process.env.HIDL_VERSION && process.env.HIDL_VERSION !== "unknown" ? process.env.HIDL_VERSION : null;

  const app: Check[] = [
    {
      label: "Version",
      ok: null,
      value: version ? (
        <a href={`https://github.com/fetehadin/hidl/commit/${version}`} className="font-mono text-accent hover:underline">{version.slice(0, 7)}</a>
      ) : (
        "local build"
      ),
    },
    { label: "Site address", ok: null, value: publicEnv.NEXT_PUBLIC_SITE_URL },
    { label: "Supabase", ok: null, value: new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL).host },
    { label: "Database answered in", ok: dbMs < 1500, value: `${dbMs} ms`, hint: "The overview numbers, fetched just now." },
    { label: "Node.js", ok: null, value: process.version },
    { label: "Server up for", ok: null, value: uptime(process.uptime()) },
  ];

  const access: Check[] = [
    {
      label: "Who can sign up",
      ok: null,
      value: allowed.includes("*") ? "Anyone" : `${allowed.length} allowed ${allowed.length === 1 ? "email" : "emails"}`,
      hint: "ALLOWED_EMAIL",
    },
    { label: "Google sign-in", ok: google ? true : null, value: google ? "On" : "Off", hint: "Switched on in deploy/supabase-prod/config.toml" },
    { label: "CAPTCHA on sign-in", ok: publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? true : null, value: publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? "On" : "Off", hint: "NEXT_PUBLIC_TURNSTILE_SITE_KEY" },
    { label: "Service key (account deletion)", ok: has("SUPABASE_SECRET_KEY"), value: has("SUPABASE_SECRET_KEY") ? "Set" : "Missing", hint: "SUPABASE_SECRET_KEY" },
  ];

  const emailsReady = has("CRON_SECRET") && has("RESEND_API_KEY") && has("EMAIL_FROM");
  const email: Check[] = [
    { label: "Unlock-day emails", ok: unlockOn ? emailsReady : null, value: unlockOn ? (emailsReady ? "On" : "On, but settings are missing") : "Off", hint: "ENABLE_UNLOCK_EMAILS" },
    // Only a problem when unlock emails are switched on; otherwise these are just unset.
    { label: "Cron secret", ok: unlockOn ? has("CRON_SECRET") : null, value: has("CRON_SECRET") ? "Set" : "Not set", hint: "CRON_SECRET" },
    { label: "Resend API key", ok: unlockOn ? has("RESEND_API_KEY") : null, value: has("RESEND_API_KEY") ? "Set" : "Not set", hint: "RESEND_API_KEY" },
    { label: "Sender", ok: unlockOn ? has("EMAIL_FROM") : null, value: process.env.EMAIL_FROM?.trim() || "Not set", hint: "EMAIL_FROM" },
    {
      label: "Last unlock email sent",
      ok: null,
      value: stats.last_unlock_email_at ? formatWhen(stats.last_unlock_email_at, calendar, timeZone) : "never",
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="App" checks={app} />
      <Panel title="Sign-in and access" checks={access} />
      <Panel title="Emails" checks={email} />
      <section className="card p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">Adding the first admin</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Admins add each other from a user&apos;s page. To add one by hand (the first one, or if everyone lost access), run this in the
          Supabase SQL editor:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl border-2 border-line bg-mint/30 p-3 text-xs">
          {"insert into public.admins (user_id)\nselect id from auth.users where email = 'you@example.com';"}
        </pre>
      </section>
    </div>
  );
}

function Panel({ title, checks }: { title: string; checks: Check[] }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <dl className="mt-3 divide-y divide-line">
        {checks.map((c) => (
          <div key={c.label} className="flex items-start justify-between gap-4 py-2.5 text-sm">
            <dt>
              <span className="font-semibold">{c.label}</span>
              {c.hint && <span className="block text-xs text-muted">{c.hint}</span>}
            </dt>
            <dd className="flex items-center gap-2 text-right break-all">
              {c.ok !== null && (
                <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${c.ok ? "bg-teal" : "bg-wax"}`} />
              )}
              <span className={c.ok === false ? "font-semibold text-wax" : "text-ink-soft"}>{c.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Runs `fn` and says how long it took, in whole ms (outside the component: timing isn't render). */
async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now();
  const value = await fn();
  return [value, Math.round(performance.now() - started)];
}

function uptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}
