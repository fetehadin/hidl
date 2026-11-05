import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { FeedbackReview } from "@/components/admin/feedback-review";
import { formatWhen, timeAgo } from "@/lib/admin-format";
import { listFeedback } from "@/lib/data/admin";
import { FEEDBACK_KIND_SHORT, FEEDBACK_STATUSES, FEEDBACK_STATUS_LABEL, type FeedbackStatus } from "@/lib/feedback";
import { requireAdmin } from "@/lib/supabase/server";
import { requestNow } from "@/lib/time";
import { adminListSchema } from "@/lib/validation/admin";

export const metadata: Metadata = { title: "Feedback" };

const PAGE_SIZE = 25;

export default async function AdminFeedbackPage({ searchParams }: PageProps<"/admin/feedback">) {
  const sp = await searchParams;
  const { page } = adminListSchema.parse(sp);
  const status = FEEDBACK_STATUSES.includes(sp.status as FeedbackStatus) ? (sp.status as FeedbackStatus) : undefined;
  const { supabase, calendar, timeZone } = await requireAdmin();
  const { rows, total } = await listFeedback(supabase, { status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const now = requestNow();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (s: FeedbackStatus | undefined, p = 1) =>
    `/admin/feedback?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <>
      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-1.5">
        {[undefined, ...FEEDBACK_STATUSES].map((s) => {
          const active = s === status;
          return (
            <Link
              key={s ?? "all"}
              href={href(s)}
              aria-current={active ? "true" : undefined}
              className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-bold ${active ? "border-teal bg-mint text-ocean" : "border-line bg-white text-muted hover:text-ocean"}`}
            >
              {s ? FEEDBACK_STATUS_LABEL[s] : "All"}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-ink-soft">
          {status ? `Nothing ${FEEDBACK_STATUS_LABEL[status].toLowerCase()}.` : "No feedback yet. People can send it from Account → Send feedback."}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((f) => (
            <li key={f.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <Badge tone={f.kind === "bug" ? "wax" : "plain"}>{FEEDBACK_KIND_SHORT[f.kind]}</Badge>
                <Badge tone={f.status === "new" ? "wax" : "teal"}>{FEEDBACK_STATUS_LABEL[f.status]}</Badge>
                {f.email ? (
                  <Link href={`/admin/users/${f.user_id}`} className="font-semibold text-heading hover:text-accent hover:underline">{f.email}</Link>
                ) : (
                  <span className="text-muted">deleted account</span>
                )}
                <span className="text-muted" title={formatWhen(f.created_at, calendar, timeZone)}>· {timeAgo(f.created_at, now)}</span>
                {f.page && <span className="text-muted">· from <code className="text-xs">{f.page}</code></span>}
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words">{f.message}</p>
              {f.user_agent && (
                <details className="mt-2 text-xs text-muted">
                  <summary className="cursor-pointer font-semibold">Device</summary>
                  <p className="mt-1 break-all">{f.user_agent}</p>
                </details>
              )}
              {f.reply && f.replied_at && (
                <p className="mt-3 text-xs text-muted">Replied {timeAgo(f.replied_at, now)}</p>
              )}
              <FeedbackReview key={f.updated_at} id={f.id} status={f.status} reply={f.reply} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-sm">
          {page > 1 ? <Link href={href(status, page - 1)} className="btn btn-ghost">← Newer</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={href(status, page + 1)} className="btn btn-ghost">Older →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
