import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { formatDayString, isSuspended, timeAgo } from "@/lib/admin-format";
import { listUsers } from "@/lib/data/admin";
import { requireAdmin } from "@/lib/supabase/server";
import { requestNow } from "@/lib/time";
import { adminListSchema } from "@/lib/validation/admin";

export const metadata: Metadata = { title: "Users" };

const PAGE_SIZE = 50;
const nf = new Intl.NumberFormat("en-US");

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const { q, page } = adminListSchema.parse(await searchParams);
  const { supabase, calendar } = await requireAdmin();
  const { rows, total } = await listUsers(supabase, { search: q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const now = requestNow();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form role="search" className="flex w-full gap-2 sm:w-auto sm:flex-1" action="/admin/users">
          <label htmlFor="user-search" className="sr-only">Search by email or ID</label>
          <input id="user-search" name="q" type="search" defaultValue={q} placeholder="Search by email or ID" className="field min-w-0 flex-1" />
          <button type="submit" className="btn btn-ghost">Search</button>
        </form>
        <a href="/admin/users/export" className="btn btn-ghost" download>
          Export CSV
        </a>
      </div>

      <p className="mb-3 text-sm text-muted" aria-live="polite">
        {q ? `${nf.format(total)} matching “${q}”` : `${nf.format(total)} ${total === 1 ? "account" : "accounts"}`}
        {q && (
          <>
            {" · "}
            <Link href="/admin/users" className="font-semibold text-accent">Clear search</Link>
          </>
        )}
      </p>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-ink-soft">No accounts found.</div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b-2 border-line bg-mint/40 text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-3 font-bold">Account</th>
                  <th className="px-4 py-3 font-bold">Joined</th>
                  <th className="px-4 py-3 font-bold">Last active</th>
                  <th className="px-4 py-3 text-right font-bold">Letters</th>
                  <th className="px-4 py-3 text-right font-bold">Photos</th>
                  <th className="px-4 py-3 text-right font-bold">Countdowns</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-t border-line first:border-t-0 hover:bg-mint/30">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${u.id}`} className="font-semibold text-heading hover:text-accent hover:underline">
                        {u.email}
                      </Link>
                      <span className="ml-2 inline-flex gap-1 align-middle">
                        {u.is_admin && <Badge tone="teal">admin</Badge>}
                        {isSuspended(u.banned_until, now) && <Badge tone="wax">suspended</Badge>}
                        {u.feedback > 0 && <Badge tone="plain">{u.feedback} feedback</Badge>}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-soft" title={u.created_at}>{timeAgo(u.created_at, now)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-soft">
                      {u.last_active ? formatDayString(u.last_active, calendar) : <span className="text-muted">never</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{u.letters}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{u.photos}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{u.countdowns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)} className="btn btn-ghost">← Newer</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={pageHref(page + 1)} className="btn btn-ghost">Older →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
