import Link from "next/link";
import type { Metadata } from "next";
import { signOut } from "@/actions/auth";
import { AvatarBuilder } from "@/components/account/avatar-builder";
import { CalendarChoice } from "@/components/account/calendar-choice";
import { DeleteAccountButton } from "@/components/account/delete-account-button";
import { LetterEncryption } from "@/components/account/letter-encryption";
import { PageHeader } from "@/components/page-header";
import { DEFAULT_AVATAR } from "@/lib/avatar";
import { getKeyBundle } from "@/lib/data/letter-keys";
import { getAvatar } from "@/lib/data/profile";
import { requireUser } from "@/lib/supabase/server";
import { requestNow, timeZoneCity } from "@/lib/time";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const { supabase, user, calendar, timeZone } = await requireUser();
  const [bundle, buddy] = await Promise.all([getKeyBundle(supabase), getAvatar(supabase)]);

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

      <div className="card mt-4 p-5 sm:p-6">
        <p className="eyebrow mb-1">you</p>
        <h2 className="font-display text-xl font-semibold">Your buddy</h2>
        <p className="mt-1 mb-5 text-ink-soft">Make a little character that&apos;s yours. It takes Hidi&apos;s place around the app (Hidi keeps the logo).</p>
        <AvatarBuilder initial={buddy ?? DEFAULT_AVATAR} hasBuddy={buddy !== null} />
      </div>

      <div className="card mt-4 p-5 sm:p-6">
        <p className="eyebrow mb-1">dates</p>
        <h2 className="font-display text-xl font-semibold">Calendar</h2>
        <p className="mt-1 mb-4 text-ink-soft">Which calendar hidl shows your dates in.</p>
        <CalendarChoice current={calendar} now={requestNow()} />
        <p className="mt-4 text-sm text-muted">
          Times and &ldquo;today&rdquo; follow your device&rsquo;s time zone, now{" "}
          <span className="font-semibold text-ink-soft">{timeZoneCity(timeZone)}</span> ({timeZone}). It updates by itself when you
          travel.
        </p>
      </div>

      <div className="card mt-4 p-5 sm:p-6">
        <p className="eyebrow mb-1">privacy</p>
        <h2 className="font-display text-xl font-semibold">Private letters</h2>
        <p className="mt-1 mb-4 text-ink-soft">End-to-end encryption for what you write in your letters.</p>
        <LetterEncryption bundle={bundle} />
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

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/stats" className="font-semibold text-accent underline-offset-4 hover:underline">hidl in numbers</Link>
        {" "}· how many people use hidl
      </p>
    </>
  );
}
