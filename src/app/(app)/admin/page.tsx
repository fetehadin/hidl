import type { Metadata } from "next";
import Link from "next/link";
import { DailyChart } from "@/components/admin/daily-chart";
import { Stat } from "@/components/admin/stat";
import { formatBytes } from "@/lib/admin-format";
import { getAdminStats } from "@/lib/data/admin";
import { MEDIA_QUOTA_BYTES, formatSize } from "@/lib/media";
import { mediaCapacity } from "@/lib/storage";
import { requireAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview" };

const nf = new Intl.NumberFormat("en-US");

/**
 * How hidl is doing: people, activity and what's been made. These are the numbers that used
 * to be on the public /stats page (admin_stats() replaced public_stats()). Totals only.
 */
export default async function AdminOverviewPage() {
  const { supabase } = await requireAdmin();
  const stats = await getAdminStats(supabase);
  const capacity = mediaCapacity();
  const storageShare = stats.storage_bytes / capacity.bytes;
  const storageWhere = capacity.provider === "s3" ? "on the server" : "in Supabase";

  return (
    <div className="flex flex-col gap-6">
      {stats.feedback_new > 0 && (
        <Link href="/admin/feedback?status=new" className="card card-interactive flex items-center justify-between gap-3 border-wax/40 p-4">
          <span className="font-semibold">
            {stats.feedback_new} new {stats.feedback_new === 1 ? "piece" : "pieces"} of feedback waiting
          </span>
          <span className="text-sm font-bold text-accent">Open the inbox →</span>
        </Link>
      )}

      <section aria-labelledby="people">
        <h2 id="people" className="font-display mb-3 text-xl font-semibold">People</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={stats.people === 1 ? "account" : "accounts"} value={stats.people} sub={`${nf.format(stats.signups_7d)} new this week`} href="/admin/users" />
          <Stat label="used it today" value={stats.active_today} />
          <Stat label="in the last 7 days" value={stats.active_7d} />
          <Stat label="in the last 30 days" value={stats.active_30d} sub={`${nf.format(stats.visits_30d)} ${stats.visits_30d === 1 ? "visit" : "visits"}`} />
        </div>
      </section>

      <section aria-labelledby="retention">
        <h2 id="retention" className="font-display mb-3 text-xl font-semibold">Coming back</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="returning (30 days)" value={stats.returning_30d} sub="used it on 2+ days" />
          <Stat
            label="week-1 retention"
            value={stats.retention_cohort > 0 ? `${Math.round((stats.retention_d7 / stats.retention_cohort) * 100)}%` : "–"}
            sub={`${nf.format(stats.retention_d7)} of ${nf.format(stats.retention_cohort)} who joined 8–37 days ago`}
          />
        </div>
      </section>

      <DailyChart
        id="daily-people"
        title="People using hidl each day"
        note={`last 30 days · ${nf.format(stats.visits_30d)} ${stats.visits_30d === 1 ? "visit" : "visits"}`}
        daily={stats.daily}
        metric="people"
        unit={["person", "people"]}
      />

      <DailyChart
        id="daily-signups"
        title="New accounts each day"
        note={`last 30 days · ${nf.format(stats.signups_30d)} in all`}
        daily={stats.daily}
        metric="signups"
        unit={["sign-up", "sign-ups"]}
      />

      <section aria-labelledby="made">
        <h2 id="made" className="font-display mb-3 text-xl font-semibold">Made with hidl so far</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label={stats.letters === 1 ? "letter" : "letters"}
            value={stats.letters}
            sub={`${nf.format(stats.letters_sealed)} sealed · ${nf.format(stats.letters_opened)} opened`}
          />
          <Stat label={stats.photos === 1 ? "photo" : "photos"} value={stats.photos} />
          <Stat label={stats.videos === 1 ? "video" : "videos"} value={stats.videos} />
          <Stat label={stats.countdowns === 1 ? "countdown" : "countdowns"} value={stats.countdowns} />
        </div>
      </section>

      <section aria-labelledby="ops">
        <h2 id="ops" className="font-display mb-3 text-xl font-semibold">Running it</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="photo storage used"
            value={formatBytes(stats.storage_bytes)}
            sub={`${Math.round(storageShare * 100)}% of ${formatBytes(capacity.bytes)} ${storageWhere}${
              storageShare >= 0.7 ? ": time to make room" : ""
            }${stats.storage_near_quota > 0 ? ` · ${nf.format(stats.storage_near_quota)} near their ${formatSize(MEDIA_QUOTA_BYTES)}` : ""}`}
            highlight={storageShare >= 0.7}
          />
          <Stat label="open feedback" value={stats.feedback_open} sub={`${nf.format(stats.feedback_new)} new`} href="/admin/feedback" highlight={stats.feedback_new > 0} />
          <Stat label={stats.suspended === 1 ? "suspended account" : "suspended accounts"} value={stats.suspended} />
          <Stat label={stats.admins === 1 ? "admin" : "admins"} value={stats.admins} />
        </div>
      </section>
    </div>
  );
}
