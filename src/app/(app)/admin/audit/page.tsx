import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_ACTION_LABEL, formatWhen } from "@/lib/admin-format";
import { getAuditLog } from "@/lib/data/admin";
import { requireAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 100;

/** Everything admins have done, newest first. Entries outlive the accounts they name. */
export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const { before } = await searchParams;
  const beforeId = typeof before === "string" && /^\d{1,18}$/.test(before) ? Number(before) : undefined;
  const { supabase, calendar, timeZone } = await requireAdmin();
  const entries = await getAuditLog(supabase, { limit: PAGE_SIZE, before: beforeId });

  return (
    <>
      <p className="mb-4 text-ink-soft">Every change an admin makes is recorded here, and the log can&apos;t be edited from the app.</p>
      {entries.length === 0 ? (
        <div className="card p-8 text-center text-ink-soft">Nothing yet.</div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b-2 border-line bg-mint/40 text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-3 font-bold">When</th>
                  <th className="px-4 py-3 font-bold">Admin</th>
                  <th className="px-4 py-3 font-bold">What</th>
                  <th className="px-4 py-3 font-bold">Account</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((a) => (
                  <tr key={a.id} className="border-t border-line align-top first:border-t-0">
                    <td className="px-4 py-3 whitespace-nowrap text-ink-soft">{formatWhen(a.created_at, calendar, timeZone)}</td>
                    <td className="px-4 py-3">{a.admin_email}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">{AUDIT_ACTION_LABEL[a.action] ?? a.action}</span>
                      {Object.keys(a.details).length > 0 && (
                        <span className="block text-xs text-muted">
                          {Object.entries(a.details)
                            .map(([k, v]) => `${k.replaceAll("_", " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.target_user && a.target_exists ? (
                        <Link href={`/admin/users/${a.target_user}`} className="font-semibold text-accent hover:underline">{a.target_email}</Link>
                      ) : a.target_email ? (
                        <span className="text-ink-soft">{a.target_email} <span className="text-muted">(deleted)</span></span>
                      ) : a.target_user ? (
                        <span className="text-muted">deleted account</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {entries.length === PAGE_SIZE && (
        <p className="mt-4 text-right">
          <Link href={`/admin/audit?before=${entries.at(-1)!.id}`} className="btn btn-ghost">Older →</Link>
        </p>
      )}
    </>
  );
}
