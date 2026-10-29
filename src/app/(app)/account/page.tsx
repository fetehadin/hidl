import type { Metadata } from "next";
import { signOut } from "@/actions/auth";
import { DeleteAccountButton } from "@/components/account/delete-account-button";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const { user } = await requireUser();

  return (
    <>
      <PageHeader eyebrow="account" title="Your account" />
      <div className="card p-5 sm:p-6">
        <p className="text-sm text-ink-soft">Signed in as</p>
        <p className="font-display text-xl">{user.email}</p>
        <form action={signOut} className="mt-4">
          <button type="submit" className="btn btn-ghost">
            Sign out
          </button>
        </form>
      </div>

      <div className="card mt-4 border-wax/30 p-5 sm:p-6">
        <p className="eyebrow mb-1 text-wax">danger zone</p>
        <h2 className="font-display text-xl font-semibold">Delete your account</h2>
        <p className="mt-1 text-ink-soft">
          Permanently removes your letters, photos, and countdowns. This can&apos;t be undone.
        </p>
        <div className="mt-4">
          <DeleteAccountButton />
        </div>
      </div>
    </>
  );
}
