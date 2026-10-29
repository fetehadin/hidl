import type { Metadata } from "next";
import Link from "next/link";
import { ExamSettingsForm } from "@/components/countdown/exam-settings-form";
import { WidgetToken } from "@/components/countdown/widget-token";
import { PageHeader } from "@/components/page-header";
import { getExam } from "@/lib/data/exam";
import { requireUser } from "@/lib/supabase/server";
import { utcToLocalInput } from "@/lib/time";

export const metadata: Metadata = { title: "Countdown settings" };

export default async function CountdownSettingsPage() {
  const { supabase } = await requireUser();
  const exam = await getExam(supabase);

  return (
    <>
      <Link href="/countdown" className="text-sm text-muted hover:text-ink">← Countdown</Link>
      <PageHeader eyebrow="settings" title={exam ? "Edit your exam" : "Set up your exam"} />
      <div className="card p-5 sm:p-6">
        <ExamSettingsForm
          defaults={{
            exam_name: exam?.exam_name ?? "",
            exam_local: exam ? utcToLocalInput(exam.exam_at) : "",
            target_score: exam ? String(exam.target_score) : "",
            max_score: exam ? String(exam.max_score) : "700",
          }}
        />
      </div>

      {exam && (
        <div className="mt-4">
          <WidgetToken createdAt={exam.widget_token_created_at} />
        </div>
      )}
    </>
  );
}
