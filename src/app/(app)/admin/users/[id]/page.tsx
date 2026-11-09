import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/badge";
import { Stat } from "@/components/admin/stat";
import { UserActions } from "@/components/admin/user-actions";
import { AUDIT_ACTION_LABEL, formatBytes, formatDayString, formatWhen, isSuspended } from "@/lib/admin-format";
import { getAuditLog, getUserDetail, listFeedback } from "@/lib/data/admin";
import { FEEDBACK_KIND_SHORT, FEEDBACK_STATUS_LABEL } from "@/lib/feedback";
import { requireAdmin } from "@/lib/supabase/server";
import { requestNow } from "@/lib/time";
import { userIdSchema } from "@/lib/validation/admin";

export const metadata: Metadata = { title: "Account" };

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  if (!userIdSchema.safeParse(id).success) notFound();
  const { supabase, user: me, calendar, timeZone, role: myRole } = await requireAdmin();
  const [u, feedback, audit] = await Promise.all([
    getUserDetail(supabase, id),
    listFeedback(supabase, { user: id, limit: 20 }),
    getAuditLog(supabase, { target: id, limit: 20 }),
  ]);
  if (!u) notFound();
  const theirs = feedback.rows;
  const now = requestNow();
  const suspended = isSuspended(u.banned_until, now);
  const when = (d: string | null) => (d ? formatWhen(d, calendar, timeZone) : "never");

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/users" className="text-sm font-semibold text-accent">← All users</Link>

      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-2xl font-semibold break-all">{u.email}</h2>
          {u.is_admin && <Badge tone="teal">{u.admin_role === "super" ? "super admin" : "admin"}</Badge>}
          {suspended && <Badge tone="wax">suspended</Badge>}
          {u.id === me.id && <Badge tone="plain">you</Badge>}
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Joined">{when(u.created_at)}</Row>
          <Row label="Last signed in">{when(u.last_sign_in_at)}</Row>
          <Row label="Last used the app">{u.last_active ? formatDayString(u.last_active, calendar) : "never"}</Row>
          <Row label="Email confirmed">{when(u.email_confirmed_at)}</Row>
          <Row label="Signs in with">{u.providers.length ? u.providers.join(", ") : "email"}</Row>
          <Row label="Time zone">{u.time_zone ?? "not reported yet"}</Row>
          <Row label="Calendar">{u.calendar === "ethiopian" ? "Ethiopian" : "Gregorian"}</Row>
          <Row label="Letter encryption">{u.has_letter_key ? "set up" : "not set up"}</Row>
          {suspended && <Row label="Suspended until">{when(u.banned_until)}</Row>}
          <Row label="ID"><code className="text-xs break-all">{u.id}</code></Row>
        </dl>
      </div>

      <section aria-labelledby="usage">
        <h2 id="usage" className="sr-only">Usage</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={`${u.active_days_30d === 1 ? "day" : "days"} active (30 days)`} value={u.active_days_30d} sub={`${u.visits_30d} ${u.visits_30d === 1 ? "visit" : "visits"}`} />
          <Stat label={u.letters === 1 ? "letter" : "letters"} value={u.letters} sub={`${u.letters_sealed} still sealed · ${u.letters_encrypted} encrypted`} />
          <Stat label="photos and videos" value={u.photos + u.videos} sub={`${formatBytes(u.storage_bytes)} of ${formatBytes(u.storage_quota)} used`} />
          <Stat label={u.countdowns === 1 ? "countdown" : "countdowns"} value={u.countdowns} />
        </div>
        <p className="mt-2 text-xs text-muted">Counts only. Letters, photos and captions are never shown here.</p>
      </section>

      <div className="card p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">Actions</h2>
        {u.id === me.id ? (
          <p className="mt-2 text-ink-soft">This is your own account. Manage it from <Link href="/account" className="font-semibold text-accent">Account</Link>.</p>
        ) : myRole === "super" ? (
          <UserActions userId={u.id} email={u.email} role={u.admin_role} suspended={suspended} />
        ) : (
          <p className="mt-2 text-ink-soft">Only a super admin can suspend or delete accounts or change admin access.</p>
        )}
      </div>

      <div className="card p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">Their feedback</h2>
        {theirs.length === 0 ? (
          <p className="mt-2 text-ink-soft">None yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {theirs.map((f) => (
              <li key={f.id} className="rounded-xl border-2 border-line p-3">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge tone="plain">{FEEDBACK_KIND_SHORT[f.kind]}</Badge>
                  <Badge tone={f.status === "new" ? "wax" : "teal"}>{FEEDBACK_STATUS_LABEL[f.status]}</Badge>
                  <span className="text-muted">{when(f.created_at)}</span>
                </div>
                <p className="mt-1.5 line-clamp-3 text-sm whitespace-pre-wrap">{f.message}</p>
              </li>
            ))}
          </ul>
        )}
        {theirs.length > 0 && (
          <Link href="/admin/feedback" className="mt-3 inline-block text-sm font-semibold text-accent">Answer in the inbox →</Link>
        )}
      </div>

      <div className="card p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">Admin history</h2>
        {audit.length === 0 ? (
          <p className="mt-2 text-ink-soft">No admin has done anything to this account.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
            {audit.map((a) => (
              <li key={a.id} className="py-2">
                <span className="font-semibold">{AUDIT_ACTION_LABEL[a.action] ?? a.action}</span>
                <span className="text-muted"> · {a.admin_email} · {when(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-bold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
