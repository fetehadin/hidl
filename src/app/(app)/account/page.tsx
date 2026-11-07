import { cookies } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { signOut } from "@/actions/auth";
import { AvatarBuilder } from "@/components/account/avatar-builder";
import { CalendarChoice } from "@/components/account/calendar-choice";
import { DeleteAccountButton } from "@/components/account/delete-account-button";
import { LetterEncryption } from "@/components/account/letter-encryption";
import { AppLockSettings } from "@/components/lock/app-lock-settings";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { ThemeChoice } from "@/components/theme/theme-choice";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { PageHeader } from "@/components/page-header";
import { DEFAULT_AVATAR } from "@/lib/avatar";
import { getKeyBundle } from "@/lib/data/letter-keys";
import { getProfile } from "@/lib/data/profile";
import { isAdmin, requireUser } from "@/lib/supabase/server";
import { requestNow, timeZoneCity } from "@/lib/time";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const { supabase, user, calendar, timeZone } = await requireUser();
  const [bundle, profile, admin] = await Promise.all([getKeyBundle(supabase), getProfile(supabase), isAdmin(supabase, user)]);
  const buddy = profile.avatar;
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

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

      <div id="profile" className="card mt-4 scroll-mt-6 p-5 sm:p-6">
        <p className="eyebrow mb-1">profile</p>
        <h2 className="font-display text-xl font-semibold">How others see you</h2>
        <p className="mt-1 mb-5 text-ink-soft">Your name and picture on the leaderboard. Your email is never shown to anyone.</p>
        <ProfileEditor
          displayName={profile.displayName}
          picturePath={profile.picturePath}
          avatar={buddy}
          showOnLeaderboard={profile.showOnLeaderboard}
        />
      </div>

      <div className="card mt-4 p-5 sm:p-6">
        <p className="eyebrow mb-1">you</p>
        <h2 className="font-display text-xl font-semibold">Your buddy</h2>
        <p className="mt-1 mb-5 text-ink-soft">Make a little character that&apos;s yours. It takes Hidi&apos;s place around the app (Hidi keeps the logo).</p>
        <AvatarBuilder initial={buddy ?? DEFAULT_AVATAR} hasBuddy={buddy !== null} />
      </div>

      <div className="card mt-4 p-5 sm:p-6">
        <p className="eyebrow mb-1">appearance</p>
        <h2 className="font-display text-xl font-semibold">Theme</h2>
        <p className="mt-1 mb-4 text-ink-soft">
          How hidl looks on this device. Hidi and your buddy change color with it. You can also switch with the{" "}
          <span className="font-semibold">half-circle</span> button in the menu.
        </p>
        <ThemeChoice serverTheme={theme} />
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

      <div className="card mt-4 p-5 sm:p-6">
        <p className="eyebrow mb-1">privacy</p>
        <h2 className="font-display text-xl font-semibold">Lock this device</h2>
        <p className="mt-1 mb-4 text-ink-soft">
          Ask for a PIN or pattern when hidl opens on this phone or computer, so nobody who picks it up can look through your
          journal. Set it on each device you want locked. Forgot it? Sign out and back in with your email.
        </p>
        <AppLockSettings userId={user.id} />
      </div>

      <div className="card mt-4 p-5 sm:p-6">
        <p className="eyebrow mb-1">leaderboard</p>
        <h2 className="font-display text-xl font-semibold">Photo streaks</h2>
        <p className="mt-1 mb-4 text-ink-soft">See who kept the longest photo streak this week and this month.</p>
        <Link href="/leaderboard" className="btn btn-ghost">
          Open the leaderboard
        </Link>
      </div>

      <div className="card mt-4 p-5 sm:p-6">
        <p className="eyebrow mb-1">feedback</p>
        <h2 className="font-display text-xl font-semibold">Tell us what you think</h2>
        <p className="mt-1 mb-4 text-ink-soft">Report a bug, suggest an idea, or just say hi. You&apos;ll see any reply on the feedback page.</p>
        <Link href="/feedback?from=/account" className="btn btn-ghost">
          Send feedback
        </Link>
      </div>

      {admin && (
        <div className="card mt-4 p-5 sm:p-6">
          <p className="eyebrow mb-1">admin</p>
          <h2 className="font-display text-xl font-semibold">Admin panel</h2>
          <p className="mt-1 mb-4 text-ink-soft">Usage numbers, accounts, feedback and the audit log.</p>
          <Link href="/admin" className="btn btn-ghost">
            Open the admin panel
          </Link>
        </div>
      )}

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
