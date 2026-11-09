import Link from "next/link";
import { MEDIA_QUOTA_WARN_AT, formatSize } from "@/lib/media";

/**
 * How much of their photo space someone has used, shown only from 90% on (below that, nothing).
 * Uploads stop at 100%: reserve_media refuses them, this only explains why.
 */
export function PhotoSpaceNotice({
  used,
  quota,
  showLink = false,
  className = "",
}: {
  used: number;
  quota: number;
  /** Link to the calendar, where photos can be deleted. */
  showLink?: boolean;
  className?: string;
}) {
  if (quota <= 0 || used < quota * MEDIA_QUOTA_WARN_AT) return null;
  const full = used >= quota;
  return (
    <p role="status" className={`rounded-control bg-accent-soft px-3 py-2 text-sm ${className}`}>
      {full
        ? `Your photo space is full (${formatSize(quota)}). Delete some photos or videos to add new ones.`
        : `You've used ${formatSize(used)} of your ${formatSize(quota)} photo space.`}
      {showLink && (
        <>
          {" "}
          <Link href="/calendar" className="font-semibold text-accent hover:underline">
            Open the calendar
          </Link>
        </>
      )}
    </p>
  );
}
