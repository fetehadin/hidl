import type { Metadata } from "next";
import { Badge } from "@/components/badge";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { PageHeader } from "@/components/page-header";
import { formatWhen } from "@/lib/admin-format";
import { getMyFeedback } from "@/lib/data/feedback";
import { FEEDBACK_KIND_SHORT, FEEDBACK_STATUS_FOR_SENDER } from "@/lib/feedback";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Feedback" };

/** Send feedback to the people running hidl, and see what you've sent and any replies. */
export default async function FeedbackPage({ searchParams }: PageProps<"/feedback">) {
  const { from } = await searchParams;
  const { supabase, calendar, timeZone } = await requireUser();
  const mine = await getMyFeedback(supabase);
  // Only same-site paths, and not the feedback page itself.
  const fromPage = typeof from === "string" && from.startsWith("/") && !from.startsWith("//") && from !== "/feedback" ? from : undefined;

  return (
    <>
      <PageHeader eyebrow="feedback" title="Tell us what you think" />
      <div className="card p-5 sm:p-6">
        <p className="mb-5 text-ink-soft">
          Found a bug, missing something, or just like it? Every message is read by the people who run hidl.
        </p>
        <FeedbackForm from={fromPage} />
      </div>

      {mine.length > 0 && (
        <section aria-labelledby="sent" className="mt-6">
          <h2 id="sent" className="font-display mb-3 text-xl font-semibold">What you&apos;ve sent</h2>
          <ul className="flex flex-col gap-3">
            {mine.map((f) => (
              <li key={f.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <Badge tone="plain">{FEEDBACK_KIND_SHORT[f.kind]}</Badge>
                  <Badge tone={f.status === "resolved" ? "teal" : "plain"}>{FEEDBACK_STATUS_FOR_SENDER[f.status]}</Badge>
                  <span className="text-muted">{formatWhen(f.created_at, calendar, timeZone)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words">{f.message}</p>
                {f.reply && (
                  <div className="mt-3 rounded-2xl border-2 border-aqua bg-mint/50 p-4">
                    <p className="eyebrow mb-1">reply from hidl</p>
                    <p className="whitespace-pre-wrap break-words">{f.reply}</p>
                    {f.replied_at && <p className="mt-1 text-xs text-muted">{formatWhen(f.replied_at, calendar, timeZone)}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
