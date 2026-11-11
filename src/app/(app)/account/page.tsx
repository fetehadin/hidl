import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { signOut } from "@/actions/auth";
import { AppCodeCard } from "@/components/account/app-code-card";
import { AvatarBuilder } from "@/components/account/avatar-builder";
import { BuddyCard } from "@/components/account/buddy-card";
import { CalendarChoice } from "@/components/account/calendar-choice";
import { DeleteAccountButton } from "@/components/account/delete-account-button";
import { Avatar } from "@/components/avatar";
import { AppLockSettings } from "@/components/lock/app-lock-settings";
import { Mascot } from "@/components/mascot";
import { PageHeader } from "@/components/page-header";
import { PhotoSpaceNotice } from "@/components/photo-space-notice";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { DEFAULT_AVATAR } from "@/lib/avatar";
import { getProfile } from "@/lib/data/profile";
import { mediaUsage } from "@/lib/storage";
import { isAdmin, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account" };

/**
 * Account, in a few groups with quick links at the top: profile, security, preferences, the
 * phone app (on the website only), help, and deleting the account. The theme lives in the menu's
 * half-circle button, and letters need no setup here (they're sealed on the server).
 */
export default async function AccountPage() {
  const { supabase, user, calendar } = await requireUser();
  const [profile, admin, space] = await Promise.all([
    getProfile(supabase),
    isAdmin(supabase, user),
    mediaUsage(supabase).catch(() => null),
  ]);
  const buddy = profile.avatar;
  // Inside the phone app there's nothing to hand over to.
  const inApp = ((await headers()).get("user-agent") ?? "").includes("hidl-app");

  const sections = [
    { id: "profile", label: "Profile" },
    { id: "security", label: "Security" },
    { id: "preferences", label: "Preferences" },
    ...(inApp ? [] : [{ id: "phone-app", label: "Phone app" }]),
    { id: "help", label: "Help" },
  ];

  return (
    <>
      <PageHeader eyebrow="account" title="Your account" />

      <div className="card flex items-center gap-4 p-4 sm:p-5">
        {buddy ? <Avatar config={buddy} size={56} /> : <Mascot mood="happy" size={56} float={false} />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold">{profile.displayName ?? "You"}</p>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
        <form action={signOut}>
          <button type="submit" className="btn btn-ghost min-h-10 px-4">
            Sign out
          </button>
        </form>
      </div>

      <nav aria-label="Account sections" className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="shrink-0 rounded-full border border-line bg-card px-4 py-2 text-sm font-bold text-ink-soft hover:bg-mint hover:text-ocean"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* Nothing below 90% of the photo space. */}
      {space && <PhotoSpaceNotice used={space.used} quota={space.quota} showLink className="mt-4" />}

      <Section id="profile" title="Profile">
        <Card title="How others see you" note="Your name and buddy on the leaderboard. Your email is never shown.">
          <ProfileEditor displayName={profile.displayName} avatar={buddy} showOnLeaderboard={profile.showOnLeaderboard} />
        </Card>
        <BuddyCard>
          <AvatarBuilder initial={buddy ?? DEFAULT_AVATAR} hasBuddy={buddy !== null} />
        </BuddyCard>
      </Section>

      <Section id="security" title="Security">
        <Card title="App lock" note="Asked when hidl opens on this device, and before a letter's seal is broken.">
          <AppLockSettings userId={user.id} email={user.email ?? ""} />
        </Card>
      </Section>

      <Section id="preferences" title="Preferences">
        <Card title="Calendar">
          <CalendarChoice current={calendar} />
        </Card>
      </Section>

      {!inApp && (
        <Section id="phone-app" title="Phone app">
          <Card
            title="Sign in on the phone app"
            note={
              <>
                Type this code on the app&apos;s sign-in screen.{" "}
                <Link href="/install" className="font-semibold text-accent hover:underline">
                  Get the app
                </Link>
              </>
            }
          >
            <AppCodeCard />
          </Card>
        </Section>
      )}

      <Section id="help" title="Help">
        <div className="card divide-y divide-line overflow-hidden">
          <RowLink href="/feedback?from=/account" title="Send feedback" note="A bug, an idea, or just hi" />
          {admin && <RowLink href="/admin" title="Admin panel" note="Usage, accounts, feedback" />}
        </div>
      </Section>

      <section aria-labelledby="danger-title" className="mt-10">
        <div className="card border-wax/30 p-5 sm:p-6">
          <h2 id="danger-title" className="font-display text-lg font-semibold">
            Delete your account
          </h2>
          <p className="mt-1 mb-4 text-sm text-ink-soft">Removes your letters, photos and countdowns for good.</p>
          <DeleteAccountButton />
        </div>
      </section>
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-8 scroll-mt-24">
      <h2 id={`${id}-title`} className="mb-3 px-1 text-sm font-extrabold tracking-wider text-muted uppercase">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Card({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="card p-5 sm:p-6">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {note && <p className="mt-0.5 text-sm text-ink-soft">{note}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function RowLink({ href, title, note }: { href: string; title: string; note: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-mint/60">
      <span>
        <span className="block font-semibold text-ink">{title}</span>
        <span className="block text-sm text-muted">{note}</span>
      </span>
      <span aria-hidden className="text-xl text-muted">
        ›
      </span>
    </Link>
  );
}
