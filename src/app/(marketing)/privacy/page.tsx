import type { Metadata } from "next";
import Link from "next/link";

/**
 * The privacy policy: what hidl stores, where, who can see it and how to delete it. Public (it's
 * in PUBLIC_PATHS in src/lib/supabase/proxy.ts) because Google's sign-in screen links to it.
 * Keep it true: when a feature starts storing something new, or a new service is added, update
 * this page and its date in the same change.
 */
export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Hidl stores, where it's kept, who can see it, and how to delete it.",
  robots: { index: true, follow: true },
};

const UPDATED = "10 November 2026";
const CONTACT = "hidlsupport@gmail.com";

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl pt-10">
      <p className="eyebrow mb-2">privacy policy</p>
      <h1 className="font-title text-4xl font-medium tracking-tight sm:text-5xl">Your journal is yours</h1>
      <p className="mt-3 text-muted">Last updated {UPDATED}</p>

      <p className="mt-6 text-lg text-ink-soft">
        Hidl is a personal journal: letters to your future self, countdowns, and a photo calendar. This page explains,
        in plain words, what Hidl keeps about you, where it&apos;s kept, who can see it, and how to remove it. The short
        version: we keep only what the app needs to work, we never sell it or show you ads, and you can delete
        everything yourself at any time.
      </p>

      <Section title="Who runs Hidl">
        <p>
          Hidl is built and run by Fetehadin Negash, an independent developer. For anything about your data, email{" "}
          <Mail />.
        </p>
      </Section>

      <Section title="What Hidl keeps">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Your account:</strong> your email address. If you sign in with Google, also the name and profile
            details Google shares for sign-in (see &quot;Signing in with Google&quot; below).
          </li>
          <li>
            <strong>Letters:</strong> each letter&apos;s title, recipient, occasion and opening date, and its text.
            Letter text is <strong>end-to-end encrypted</strong>: it&apos;s locked on your device before it&apos;s saved,
            so nobody else can read it, including us. You open your letters with your fingerprint or Face ID (a passkey
            in your Apple or Google account), an optional passphrase, or the letter key we email you once. We don&apos;t
            keep that emailed half of the key: it passes through our email service once to reach you, and it only works
            together with your Hidl account. (Letters written before 3 November 2026, when encryption was added, are
            stored as plain text.)
          </li>
          <li>
            <strong>Countdowns:</strong> what you&apos;re counting down to, its date, and any scores or details you add.
          </li>
          <li>
            <strong>Photos and videos</strong> you add to the calendar, their captions and dates.
          </li>
          <li>
            <strong>Your profile:</strong> your buddy (the little character you build), your display name, and whether
            you appear on the leaderboard.
          </li>
          <li>
            <strong>Settings:</strong> your time zone (taken from your device) and Gregorian or Ethiopian dates.
          </li>
          <li>
            <strong>Feedback</strong> you send us, with the page you sent it from and your browser&apos;s name and
            version, so we can find the problem.
          </li>
          <li>
            <strong>How Hidl is used:</strong> the number of days you open Hidl, and which pages are opened (through
            PostHog, an analytics service, linked to your account&apos;s id, not your email, with the approximate
            country worked out from your internet address). No screen recordings, no keystrokes, nothing you write.
          </li>
        </ul>
        <p className="mt-3">
          The app lock (PIN or pattern) and the photos already shown to you stay <strong>on your device only</strong>.
          They&apos;re never sent to us.
        </p>
      </Section>

      <Section title="What Hidl does with it">
        <p>
          Only what you see in the app: showing you your own letters, countdowns and photos, opening letters on their
          date, emailing you a sign-in code and a note on the day a letter opens, the leaderboard, and
          answering your feedback. We use the usage numbers to see whether Hidl is working and being used.
        </p>
        <p className="mt-3">
          We don&apos;t sell your data, share it for advertising, show ads, or use your journal to train AI models.
        </p>
      </Section>

      <Section title="Who can see it">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>You.</strong> Everything you add is visible only to your own account. This is enforced by the
            database itself, not just by the app.
          </li>
          <li>
            <strong>Other people</strong> see only your display name, your buddy and your photo streak on the
            leaderboard, and only if you leave &quot;Show me on the leaderboard&quot; on. Never your email, letters or
            photos.
          </li>
          <li>
            <strong>Hidl&apos;s administrators</strong> see your email address, when you joined and signed in, how many
            letters, photos and countdowns you have, how much photo space you use, and feedback you send. They can&apos;t
            see letter text, photos, videos or captions.
          </li>
        </ul>
      </Section>

      <Section title="Where it's kept">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Supabase</strong> (database and sign-in), in Frankfurt, Germany.
          </li>
          <li>
            <strong>Our own server at Contabo</strong> in the European Union: the app itself, and your photos and
            videos, in private storage that can only be opened with short-lived links made for you.
          </li>
          <li>
            <strong>Encrypted backups in Google Drive</strong>, so a broken disk doesn&apos;t lose your journal. They are
            encrypted before they leave our server, kept for 28 days, and can&apos;t be read by Google.
          </li>
          <li>
            <strong>Resend</strong> sends Hidl&apos;s emails; <strong>PostHog</strong> counts page views;{" "}
            <strong>Cloudflare</strong> answers for Hidl&apos;s web address.
          </li>
        </ul>
        <p className="mt-3">These services only process your data to provide their part of Hidl.</p>
      </Section>

      <Section title="Signing in with Google">
        <p>
          If you choose &quot;Continue with Google&quot;, Hidl receives your email address, name and basic profile
          details from Google, and uses them only to create your account and sign you in. Hidl asks for nothing else
          from your Google account: no Gmail, Drive, contacts or calendar.
        </p>
        <p className="mt-3">
          Hidl&apos;s use and transfer of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="font-semibold text-accent hover:underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </Section>

      <Section title="Keeping and deleting">
        <p>
          Your data stays until you delete it. You can delete single letters, countdowns and photos at any time, and
          your whole account from <strong>Account → Delete account</strong>: that removes everything in it at once, for
          good, with no email to send and no waiting. Copies in the encrypted backups disappear within 28 days.
        </p>
        <p className="mt-3">
          You can also email <Mail /> to ask what we hold about you, to correct it, or to have it deleted.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          Hidl uses cookies to keep you signed in and to remember your choices on this device (like the theme). The
          analytics service sets its own cookie to count visits. There are no advertising cookies.
        </p>
      </Section>

      <Section title="Children">
        <p>Hidl isn&apos;t meant for children under 13, and we don&apos;t knowingly keep their data.</p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes, this page will say what changed, with a new date at the top.
        </p>
      </Section>

      <p className="mt-12 text-ink-soft">
        <Link href="/" className="font-semibold text-accent hover:underline">
          Back to Hidl
        </Link>
      </p>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

function Mail() {
  return (
    <a href={`mailto:${CONTACT}`} className="font-semibold text-accent hover:underline">
      {CONTACT}
    </a>
  );
}
