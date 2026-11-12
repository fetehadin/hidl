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
import { ChatIcon, ShieldIcon, TrashIcon, UserIcon } from "@/components/icons";
import { DEFAULT_AVATAR } from "@/lib/avatar";
import { getProfile } from "@/lib/data/profile";
import { mediaUsage } from "@/lib/storage";
import { isAdmin, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account" };

type SectionId = "profile" | "security" | "preferences" | "phone-app" | "help" | "delete";

/**
 * Account as a settings menu: Profile, Security, Preferences, the phone app (on the website
 * only), Help and Delete account. On phones the menu is a list and each item opens on its own
 * (`?s=security`), with a way back; wider screens show the menu beside the open section. Only the
 * open section is rendered. The theme lives in the menu's half-circle button, and letters need no
 * setup here (they're sealed on the server).
 */
export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const { s: raw, error } = await searchParams;
  const { supabase, user, calendar } = await requireUser();
  // Inside the phone app there's nothing to hand over to.
  const inApp = ((await headers()).get("user-agent") ?? "").includes("hidl-app");

  const sections: { id: SectionId; label: string; note: string; icon: ReactNode }[] = [
    { id: "profile", label: "Profile", note: "Your name and buddy", icon: <UserIcon /> },
    { id: "security", label: "Security", note: "App lock, fingerprint", icon: <ShieldIcon /> },
    { id: "preferences", label: "Preferences", note: "Calendar", icon: <SlidersIcon /> },
    ...(inApp ? [] : [{ id: "phone-app" as const, label: "Phone app", note: "Sign in on your phone", icon: <PhoneIcon /> }]),
    { id: "help", label: "Help", note: "Feedback and support", icon: <ChatIcon /> },
    { id: "delete", label: "Delete account", note: "Remove everything for good", icon: <TrashIcon /> },
  ];
  const picked = sections.find((x) => x.id === raw);
  // Phones show the menu until something is picked; wider screens always have a section open.
  const open = picked ?? sections[0];

  const [profile, admin, space] = await Promise.all([
    getProfile(supabase),
    open.id === "help" ? isAdmin(supabase, user) : Promise.resolve(false),
    mediaUsage(supabase).catch(() => null),
  ]);
  const buddy = profile.avatar;

  return (
    <>
      {/* Phones, inside a section: just a way back and its name. */}
      {picked && (
        <div className="pt-4 sm:hidden">
          <Link href="/account" className="inline-flex items-center gap-1 text-sm font-bold text-accent">
            <span aria-hidden className="text-lg leading-none">‹</span> Account
          </Link>
          <h1 className="mt-1 mb-5 font-title text-3xl font-medium tracking-tight">{picked.label}</h1>
        </div>
      )}
      <div className={picked ? "hidden sm:block" : ""}>
        <PageHeader eyebrow="account" title="Your account" />
        <div className="card flex items-center gap-4 p-4 sm:p-5">
          {buddy ? <Avatar config={buddy} size={56} /> : <Mascot mood="happy" size={56} float={false} />}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold text-heading">{profile.displayName ?? "You"}</p>
            <p className="truncate text-sm text-muted">{user.email}</p>
          </div>
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost min-h-10 px-4">
              Sign out
            </button>
          </form>
        </div>
        {/* Nothing below 90% of the photo space. */}
        {space && <PhotoSpaceNotice used={space.used} quota={space.quota} showLink className="mt-4" />}
      </div>

      <div className="sm:mt-6 sm:grid sm:grid-cols-[15rem_1fr] sm:items-start sm:gap-6">
        <nav aria-label="Account sections" className={picked ? "hidden sm:block" : "mt-4 sm:mt-0"}>
          <ul className="card divide-y divide-line overflow-hidden sm:sticky sm:top-6">
            {sections.map((x) => {
              const current = x.id === open.id;
              return (
                <li key={x.id}>
                  <Link
                    href={`/account?s=${x.id}`}
                    aria-current={current ? "page" : undefined}
                    className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-mint/60 ${
                      current ? "sm:bg-mint" : ""
                    } ${x.id === "delete" ? "text-wax" : "text-ink"}`}
                  >
                    <span
                      aria-hidden
                      className={`grid size-9 shrink-0 place-items-center rounded-xl [&>svg]:size-5 ${
                        x.id === "delete" ? "bg-wax/10" : "bg-mint text-ocean"
                      }`}
                    >
                      {x.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block font-semibold ${current ? "sm:text-ocean" : ""}`}>{x.label}</span>
                      <span className="block truncate text-sm text-muted sm:hidden">{x.note}</span>
                    </span>
                    <span aria-hidden className="text-xl text-muted sm:hidden">›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={picked ? "" : "hidden sm:block"}>
          <h2 className="mb-3 hidden px-1 text-sm font-extrabold tracking-wider text-muted uppercase sm:block">{open.label}</h2>
          <div className="space-y-4">
            {open.id === "profile" && (
              <>
                <Card title="How others see you" note="Your name and buddy on the leaderboard. Your email is never shown.">
                  <ProfileEditor displayName={profile.displayName} avatar={buddy} showOnLeaderboard={profile.showOnLeaderboard} />
                </Card>
                <BuddyCard>
                  <AvatarBuilder initial={buddy ?? DEFAULT_AVATAR} hasBuddy={buddy !== null} />
                </BuddyCard>
              </>
            )}

            {open.id === "security" && (
              <Card title="App lock" note="Asked when Hidl opens on this device, and before a letter's seal is broken.">
                <AppLockSettings userId={user.id} email={user.email ?? ""} />
              </Card>
            )}

            {open.id === "preferences" && (
              <Card title="Calendar">
                <CalendarChoice current={calendar} />
              </Card>
            )}

            {open.id === "phone-app" && (
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
            )}

            {open.id === "help" && (
              <div className="card divide-y divide-line overflow-hidden">
                <RowLink href="/feedback?from=/account" title="Send feedback" note="A bug, an idea, or just hi" />
                {admin && <RowLink href="/admin" title="Admin panel" note="Usage, accounts, feedback" />}
              </div>
            )}

            {open.id === "delete" && (
              <div className="card border-wax/30 p-5 sm:p-6">
                <h3 className="font-display text-lg font-semibold">Delete your account</h3>
                <p className="mt-1 mb-4 text-sm text-ink-soft">Removes your letters, photos and countdowns for good.</p>
                {error === "delete-failed" && (
                  <p role="alert" className="mb-4 text-sm font-semibold text-wax">
                    Your account couldn&apos;t be deleted just now. Try again in a moment.
                  </p>
                )}
                <DeleteAccountButton />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 17.5h2" />
    </svg>
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
