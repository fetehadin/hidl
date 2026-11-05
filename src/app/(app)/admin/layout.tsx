import type { Metadata } from "next";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { PageHeader } from "@/components/page-header";
import { listFeedback } from "@/lib/data/admin";
import { requireAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { template: "%s · Admin", default: "Admin" } };

/**
 * The admin panel. requireAdmin() 404s for everyone else; the admin_* database functions
 * behind every page check again, so a layout that didn't run (e.g. a direct action call)
 * still can't read or change anything.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { supabase } = await requireAdmin();
  const { total: newFeedback } = await listFeedback(supabase, { status: "new", limit: 1 });

  return (
    <>
      <PageHeader eyebrow="admin" title="Admin panel" />
      <AdminTabs newFeedback={newFeedback} />
      {children}
    </>
  );
}
