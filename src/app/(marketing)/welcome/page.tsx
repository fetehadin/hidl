import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Envelope } from "@/components/envelope";
import {
  ArrowRightIcon,
  CakeIcon,
  CameraIcon,
  EnvelopeIcon,
  ExamIcon,
  HourglassIcon,
  MemoriesIcon,
  PlaneIcon,
} from "@/components/icons";
import { Mascot, MascotSays } from "@/components/mascot";
import { QrCode } from "@/components/marketing/qr-code";
import type { AvatarConfig } from "@/lib/avatar";
import { publicEnv } from "@/lib/env";

/**
 * The landing page. Signed-out visitors on a computer see it at "/" (src/lib/supabase/proxy.ts
 * rewrites to here); phones go straight to sign-in. Everything pictured is a real app component
 * with sample content, not a screenshot.
 */
export const metadata: Metadata = {
  title: { absolute: "Hidl · letters to future you, countdowns, and a year in pictures" },
  description:
    "A private journal: time-locked letters to your future self, countdowns to the days that matter, and a calendar of photos and short videos. Encrypted letters. Installs on your phone.",
  robots: { index: true, follow: true },
};

const BUDDIES: AvatarConfig[] = [
  { theme: "sunset", eyes: "happy", mouth: "grin", top: "bunny", extra: "none", bg: "dots" },
  { theme: "ocean", eyes: "round", mouth: "smile", top: "none", extra: "headphones", bg: "waves" },
  { theme: "berry", eyes: "big", mouth: "cat", top: "cat", extra: "bow", bg: "hearts" },
  { theme: "lemon", eyes: "star", mouth: "o", top: "antenna", extra: "glasses", bg: "stars" },
  { theme: "lavender", eyes: "wink", mouth: "tongue", top: "horns", extra: "flower", bg: "plain" },
  { theme: "cocoa", eyes: "round", mouth: "smile", top: "sprout", extra: "cap", bg: "dots" },
];

export default function WelcomePage() {
  const installUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/install`;

  return (
    <>
      {/* Hero */}
      <section className="grid items-center gap-10 pt-12 pb-24 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-32">
        <div>
          <p className="eyebrow mb-3">your journal, for later</p>
          <h1 className="font-title text-5xl leading-[1.05] font-medium tracking-tight text-heading lg:text-6xl">
            Write to future you.
            <br />
            Count down to what matters.
            <br />
            Keep every day.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-soft">
            Hidl is a small, private journal: letters that stay sealed until the day you choose, countdowns to exams,
            birthdays and trips, and a calendar you fill with a photo or a short video a day.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="btn btn-primary min-h-13 px-7 text-lg">
              Start your journal
            </Link>
            <Link href="/install" className="btn btn-ghost min-h-13 px-6 text-lg">
              Get the phone app
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">Sign in with a link sent to your email. No password to remember.</p>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <Envelope state="sealed" initial="F" className="rotate-[-2deg]">
            <div className="text-center">
              <p className="font-hand text-xl text-accent">for Future me</p>
              <p className="mt-1 font-display text-2xl font-semibold text-heading">Read this when you&apos;ve made it</p>
              <p className="mt-4 font-display text-xl">Opens in 224 days</p>
              <p className="text-sm text-muted">Tuesday, June 15, 2027 at 9:00 AM</p>
            </div>
          </Envelope>
          {/* Hangs off the envelope's bottom-left corner, clear of its text. */}
          <div className="card absolute top-full -left-10 hidden -translate-y-3 rotate-[3deg] p-4 sm:block">
            <p className="eyebrow mb-2">the big day</p>
            <CountdownTiles parts={[["224", "days"], ["10", "hours"]]} />
          </div>
          <Mascot mood="wave" size={110} className="absolute -top-14 -right-4 hidden sm:block" label="Hidi, the Hidl mascot" />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-8 py-10">
        <p className="eyebrow mb-2 text-center">what&apos;s inside</p>
        <h2 className="text-center font-display text-4xl font-semibold tracking-tight">Four small things, kept well</h2>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <Feature
            icon={<EnvelopeIcon width={22} height={22} />}
            title="Letters to your future self"
            text="Write it now, pick the day it opens. Until then it's sealed: not even you can read it early. You can only push the date later."
          >
            <div className="flex items-end justify-center gap-3">
              <MiniLetter label="for Me, after the big day" when="Opens Jun 2027" />
              <MiniLetter label="for Me in five years" when="Opens Nov 2031" tilt />
            </div>
          </Feature>

          <Feature
            icon={<HourglassIcon width={22} height={22} />}
            title="Countdowns to anything"
            text="Exams with a target score, birthdays, weddings, trips, deadlines. Show the time left in years, months, days or hours: whatever feels right."
          >
            <div className="space-y-2.5">
              <CountdownRow icon={<ExamIcon width={18} height={18} />} title="National Exam" sub="Target 560 / 700" value="224" unit="days" />
              <CountdownRow icon={<CakeIcon width={18} height={18} />} title="My 18th birthday" sub="Nov 7" value="4" unit="days" />
              <CountdownRow icon={<PlaneIcon width={18} height={18} />} title="Trip to Lalibela" sub="Jan 12" value="2" unit="months" />
            </div>
          </Feature>

          <Feature
            icon={<CameraIcon width={22} height={22} />}
            title="A calendar in pictures"
            text="Add a photo, or a short video, to each day. Pin one as the day's wallpaper. The month fills up as you go."
          >
            <MiniMonth />
          </Feature>

          <Feature
            icon={<MemoriesIcon width={22} height={22} />}
            title="Memories you can wander"
            text="Every day you kept becomes an island on a board you can pan and zoom, newest in the middle. A whole year, at a glance."
          >
            <MiniMemories />
          </Feature>
        </div>

        <div className="card tint-aqua mt-5 grid items-center gap-6 p-6 md:grid-cols-[1fr_auto] md:p-8">
          <div>
            <p className="eyebrow mb-1">and a buddy that&apos;s yours</p>
            <h3 className="font-display text-2xl font-semibold text-heading">Make your own character</h3>
            <p className="mt-2 max-w-lg text-ink-soft">
              Pick a color, eyes, a smile, ears or horns, a little accessory and a background. It lives in your menu and
              keeps you company.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {BUDDIES.map((b, i) => (
              <Avatar key={i} config={b} size={68} className={`rounded-full ring-2 ring-white ${i % 2 ? "translate-y-2" : ""}`} />
            ))}
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="scroll-mt-8 py-14">
        <div className="grid items-center gap-10 lg:grid-cols-[auto_1fr]">
          <MascotSays mood="curious" size={120} className="justify-center lg:justify-start">
            Psst. What you write
            <br />
            stays between us. Well, just you.
          </MascotSays>
          <div>
            <p className="eyebrow mb-2">private by design</p>
            <h2 className="font-display text-4xl font-semibold tracking-tight">Yours, and only yours</h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              <Point title="Letters are end-to-end encrypted">
                They&apos;re locked on your device before they&apos;re saved, and open with your fingerprint or the key
                in your email. Nobody else can read them, including us.
              </Point>
              <Point title="Sealed means sealed">
                The unlock date is checked by the database&apos;s own clock, so changing your phone&apos;s time
                won&apos;t open a letter early.
              </Point>
              <Point title="Your pictures stay private">
                Photos and videos sit in your own private folder, behind links that expire. Nothing is public.
              </Point>
              <Point title="Leave anytime">
                Delete your account and everything in it, for good, from one button. No email to send, no waiting.
              </Point>
            </ul>
            <p className="mt-6">
              <Link href="/privacy" className="font-semibold text-accent hover:underline">
                Read the full privacy policy
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* Get the app */}
      <section id="app" className="scroll-mt-8 py-6">
        <div className="card grid items-center gap-8 overflow-hidden p-6 md:grid-cols-[1fr_auto] md:p-10">
          <div>
            <p className="eyebrow mb-2">on your phone</p>
            <h2 className="font-display text-4xl font-semibold tracking-tight">Get Hidl on your phone</h2>
            <p className="mt-3 max-w-xl text-lg text-ink-soft">
              Hidl installs straight from your browser, no app store needed. It gets its own icon on your home screen,
              opens full screen, and works on iPhone and Android.
            </p>
            <ol className="mt-5 space-y-2 text-ink-soft">
              <Step n={1}>Scan the code with your phone&apos;s camera (or open this site on your phone).</Step>
              <Step n={2}>Follow the steps for your phone: it takes about ten seconds.</Step>
              <Step n={3}>Open Hidl from your home screen, like any other app.</Step>
            </ol>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/install" className="btn btn-primary min-h-12 px-6">
                How to install the app
                <ArrowRightIcon width={18} height={18} />
              </Link>
              <Link href="/install#iphone" className="btn btn-ghost min-h-12 px-5">
                iPhone
              </Link>
              <Link href="/install#android" className="btn btn-ghost min-h-12 px-5">
                Android
              </Link>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-aqua bg-white p-5">
            <QrCode text={installUrl} size={184} label="QR code that opens the install instructions on your phone" />
            <p className="text-sm font-bold text-ocean">Scan to install</p>
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="py-16 text-center">
        <Mascot mood="cheer" size={120} className="mx-auto" />
        <h2 className="mt-4 font-display text-4xl font-semibold tracking-tight">Start with one letter</h2>
        <p className="mx-auto mt-3 max-w-lg text-lg text-ink-soft">
          Write something to the person you&apos;ll be next year. Seal it. Then go live the year.
        </p>
        <Link href="/login" className="btn btn-primary mt-7 min-h-13 px-8 text-lg">
          Start your journal
        </Link>
      </section>
    </>
  );
}

function Feature({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children: React.ReactNode }) {
  return (
    <article className="card flex flex-col p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-mint text-teal">{icon}</span>
        <h3 className="font-display text-xl font-semibold">{title}</h3>
      </div>
      <p className="mt-3 text-ink-soft">{text}</p>
      <div className="mt-5 flex flex-1 items-end rounded-2xl bg-mint/50 p-4" aria-hidden>
        <div className="w-full">{children}</div>
      </div>
    </article>
  );
}

function CountdownTiles({ parts }: { parts: [string, string][] }) {
  return (
    <div className="flex gap-2">
      {parts.map(([value, unit], i) => (
        <div
          key={unit}
          className={`relative flex w-24 flex-col items-center overflow-hidden rounded-2xl border-2 px-2 py-3 ${
            i === 0 ? "border-teal/60 bg-mint" : "border-aqua bg-mint/60"
          }`}
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/55 to-transparent" />
          <span className={`relative font-display text-4xl leading-none font-semibold tabular-nums text-ocean`}>
            {value}
          </span>
          <span className="relative mt-1.5 text-[11px] font-extrabold tracking-wider text-muted uppercase">{unit}</span>
        </div>
      ))}
    </div>
  );
}

function CountdownRow({ icon, title, sub, value, unit }: { icon: React.ReactNode; title: string; sub: string; value: string; unit: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5">
      <span className="grid size-9 place-items-center rounded-full bg-mint text-teal">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-ink">{title}</span>
        <span className="block text-xs font-semibold text-muted">{sub}</span>
      </span>
      <span className="text-right">
        <span className="block font-display text-xl leading-none font-semibold text-heading tabular-nums">{value}</span>
        <span className="block text-[10px] font-extrabold tracking-wide text-muted uppercase">{unit}</span>
      </span>
    </div>
  );
}

function MiniLetter({ label, when, tilt }: { label: string; when: string; tilt?: boolean }) {
  return (
    <div className={`w-44 ${tilt ? "rotate-[4deg]" : "-rotate-[3deg]"}`}>
      <Envelope state="sealed" initial="M">
        <div className="text-center">
          <p className="font-hand text-base text-accent">{label}</p>
          <p className="mt-1 text-xs font-bold text-muted">{when}</p>
        </div>
      </Envelope>
    </div>
  );
}

// Soft swatches standing in for photos: a month that's mostly kept.
const SWATCHES = ["#9ed5d1", "#ffc49b", "#f6b0c6", "#a6cbf2", "#fbe18c", "#cdb8f2", "#b9e2dd", "#d7b394"];

function MiniMonth() {
  const filled = new Set([1, 2, 3, 5, 6, 8, 9, 10, 11, 13, 14, 15, 17, 18, 19, 20, 22, 23, 24]);
  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[10px] font-extrabold tracking-wide text-muted uppercase">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            className="relative aspect-square rounded-lg"
            style={{
              background: filled.has(i)
                ? `linear-gradient(135deg, ${SWATCHES[i % SWATCHES.length]}, ${SWATCHES[(i + 3) % SWATCHES.length]})`
                : "white",
            }}
          >
            {i === 9 && (
              <span className="absolute bottom-0.5 left-0.5 grid size-3.5 place-items-center rounded-full bg-ocean/85">
                <svg viewBox="0 0 24 24" width={7} height={7} fill="#fff">
                  <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                </svg>
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniMemories() {
  const cards = [
    { x: 6, y: 6, r: -8, c: 0 }, { x: 29, y: 0, r: 5, c: 1 }, { x: 53, y: 8, r: -3, c: 2 },
    { x: 75, y: 0, r: 7, c: 3 }, { x: 16, y: 44, r: 6, c: 4 }, { x: 41, y: 42, r: -6, c: 5 }, { x: 66, y: 40, r: 3, c: 6 },
  ];
  return (
    <div className="relative h-52">
      {cards.map((p, i) => (
        <span
          key={i}
          className="absolute w-[20%] rounded-xl bg-white p-1.5 pb-4 shadow-[0_8px_18px_-10px_rgb(var(--shadow)/0.5)]"
          style={{ left: `${p.x}%`, top: `${p.y}%`, transform: `rotate(${p.r}deg)` }}
        >
          <span
            className="block aspect-square rounded-lg"
            style={{ background: `linear-gradient(135deg, ${SWATCHES[p.c]}, ${SWATCHES[(p.c + 2) % SWATCHES.length]})` }}
          />
        </span>
      ))}
    </div>
  );
}

function Point({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="card p-5">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-ink-soft">{children}</p>
    </li>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-teal font-display font-bold text-accent-ink">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
