/**
 * The kinds of countdown and the details each one carries. Shared by the form, the
 * validation schema, and the cards. Postgres checks the same keys and limits
 * (`countdown_details_ok` in supabase/migrations/20261031000001_countdown_kinds.sql),
 * so keep the two in sync.
 *
 * Exam scores aren't details: they're real columns (target_score / max_score), because
 * the score rules (actual score only after the deadline, never above the max) are
 * enforced on them in the database.
 */

export const COUNTDOWN_KINDS = ["exam", "graduation", "birthday", "wedding", "work", "trip", "life", "deadline"] as const;
export type CountdownKind = (typeof COUNTDOWN_KINDS)[number];

export type DetailField = {
  name: string;
  label: string;
  placeholder: string;
  type: "text" | "year" | "note";
  required?: boolean;
};

export type KindInfo = {
  label: string;
  /** One line under the label in the picker. */
  blurb: string;
  /** Small caps label above the title on a card. */
  eyebrow: string;
  /** Shown once the date has passed. */
  doneText: string;
  titlePlaceholder: string;
  fields: DetailField[];
};

const note = (placeholder: string): DetailField => ({ name: "note", label: "Note", placeholder, type: "note" });

export const KIND_INFO: Record<CountdownKind, KindInfo> = {
  exam: {
    label: "Exam",
    blurb: "With a target score",
    eyebrow: "the big day",
    doneText: "Done!",
    titlePlaceholder: "Driving license test",
    fields: [
      { name: "subject", label: "Subject", placeholder: "Theory and road test", type: "text" },
      note("Bring two pencils and my ID"),
    ],
  },
  graduation: {
    label: "Graduation",
    blurb: "School and program",
    eyebrow: "graduation day",
    doneText: "You graduated!",
    titlePlaceholder: "My graduation",
    fields: [
      { name: "school", label: "School", placeholder: "Addis Ababa University", type: "text" },
      { name: "program", label: "Program", placeholder: "Master's in public health", type: "text" },
      note("Family is coming at 9"),
    ],
  },
  birthday: {
    label: "Birthday",
    blurb: "Whose, and how old",
    eyebrow: "birthday",
    doneText: "Happy birthday!",
    titlePlaceholder: "My 30th birthday",
    fields: [
      { name: "person", label: "Whose birthday", placeholder: "Me", type: "text", required: true },
      { name: "birth_year", label: "Year they were born", placeholder: "1996", type: "year" },
      note("Cake from the bakery on Bole"),
    ],
  },
  wedding: {
    label: "Wedding",
    blurb: "The couple and the venue",
    eyebrow: "wedding day",
    doneText: "Congratulations!",
    titlePlaceholder: "Selam and Dawit's wedding",
    fields: [
      { name: "couple", label: "The couple", placeholder: "Selam & Dawit", type: "text" },
      { name: "venue", label: "Venue", placeholder: "Sheraton Addis", type: "text" },
      note("Wear the green dress"),
    ],
  },
  work: {
    label: "Work",
    blurb: "Role and company",
    eyebrow: "work",
    doneText: "It's here!",
    titlePlaceholder: "First day at the new job",
    fields: [
      { name: "role", label: "Role", placeholder: "Project manager", type: "text" },
      { name: "organization", label: "Company or organization", placeholder: "Ethio Telecom", type: "text" },
      note("Bring my documents to HR"),
    ],
  },
  trip: {
    label: "Trip",
    blurb: "Where, and who with",
    eyebrow: "trip",
    doneText: "Bon voyage!",
    titlePlaceholder: "Trip to Lalibela",
    fields: [
      { name: "destination", label: "Destination", placeholder: "Lalibela", type: "text" },
      { name: "companions", label: "Going with", placeholder: "Mom and Hana", type: "text" },
      note("Pack a warm jacket"),
    ],
  },
  life: {
    label: "Life",
    blurb: "A milestone that matters",
    eyebrow: "milestone",
    doneText: "It happened!",
    titlePlaceholder: "Moving into my own place",
    fields: [
      { name: "place", label: "Where", placeholder: "Bahir Dar", type: "text" },
      note("Why this one matters to me"),
    ],
  },
  deadline: {
    label: "Other",
    blurb: "Any other date",
    eyebrow: "deadline",
    doneText: "Done!",
    titlePlaceholder: "Scholarship application deadline",
    fields: [note("What you need to have ready")],
  },
};

export function isCountdownKind(v: unknown): v is CountdownKind {
  return typeof v === "string" && (COUNTDOWN_KINDS as readonly string[]).includes(v);
}

export type CountdownDetails = Record<string, string | number>;

/** The age someone turns on a birthday countdown's date (year in the app's time zone). */
export function birthdayAge(birthYear: unknown, targetYear: number) {
  if (typeof birthYear !== "number") return null;
  const age = targetYear - birthYear;
  return age > 0 && age < 150 ? age : null;
}

/** One-line summary of a countdown's details for its card, or null. */
export function detailLine(kind: CountdownKind, d: CountdownDetails, targetYear: number): string | null {
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : undefined);
  switch (kind) {
    case "exam":
      return s("subject") ?? null;
    case "graduation":
      return [s("program"), s("school")].filter(Boolean).join(" · ") || null;
    case "birthday": {
      const person = s("person");
      if (!person) return null;
      const age = birthdayAge(d.birth_year, targetYear);
      const isMe = person.trim().toLowerCase() === "me";
      if (age) return isMe ? `You turn ${age}` : `${person} turns ${age}`;
      return isMe ? "Your birthday" : `${person}'s birthday`;
    }
    case "wedding":
      return [s("couple"), s("venue") && `at ${s("venue")}`].filter(Boolean).join(" ") || null;
    case "work": {
      const role = s("role");
      const org = s("organization");
      return role && org ? `${role} at ${org}` : (role ?? org ?? null);
    }
    case "trip": {
      const dest = s("destination");
      const who = s("companions");
      return [dest && `To ${dest}`, who && `with ${who}`].filter(Boolean).join(" ") || null;
    }
    case "life":
      return s("place") ?? null;
    case "deadline":
      return null;
  }
}
