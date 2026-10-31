import { describe, expect, it } from "vitest";
import { COUNTDOWN_KINDS, detailLine, KIND_INFO } from "@/lib/countdown-kinds";
import { parseCountdown } from "@/lib/validation/countdown";

const base = { title: "Something", target_local: "2026-12-20T09:00" };

describe("parseCountdown", () => {
  it("collects a kind's details and drops blank optional ones", () => {
    const r = parseCountdown({ ...base, kind: "birthday", detail_person: " Me ", detail_birth_year: "2008", detail_note: "" });
    expect(r.success && r.data).toEqual({ kind: "birthday", ...base, details: { person: "Me", birth_year: 2008 } });
  });

  it("requires whose birthday it is", () => {
    const r = parseCountdown({ ...base, kind: "birthday", detail_person: "  " });
    expect(!r.success && r.fieldErrors.detail_person).toBeTruthy();
  });

  it("ignores fields that belong to another kind", () => {
    const r = parseCountdown({ ...base, kind: "work", detail_person: "Me", detail_role: "Intern", target_score: "5" });
    expect(r.success && r.data).toEqual({ kind: "work", ...base, details: { role: "Intern" } });
  });

  it("keeps exam scores and their rules", () => {
    expect(parseCountdown({ ...base, kind: "exam", target_score: "701", max_score: "700" }).success).toBe(false);
    const r = parseCountdown({ ...base, kind: "exam", target_score: "620", max_score: "700", detail_subject: "Math" });
    expect(r.success && r.data).toMatchObject({ target_score: 620, max_score: 700, details: { subject: "Math" } });
  });

  it("rejects an unknown kind and a bad birth year", () => {
    expect(parseCountdown({ ...base, kind: "party" }).success).toBe(false);
    expect(parseCountdown({ ...base, kind: "birthday", detail_person: "Me", detail_birth_year: "20x8" }).success).toBe(false);
  });

  it("accepts every kind with only a title and date (birthday aside)", () => {
    for (const kind of COUNTDOWN_KINDS) {
      const extra = KIND_INFO[kind].fields.some((f) => f.required) ? { detail_person: "Me" } : {};
      const scores = kind === "exam" ? { target_score: "1", max_score: "2" } : {};
      expect(parseCountdown({ ...base, kind, ...extra, ...scores }).success).toBe(true);
    }
  });
});

describe("detailLine", () => {
  it("says how old someone turns", () => {
    expect(detailLine("birthday", { person: "Me", birth_year: 2008 }, 2026)).toBe("You turn 18");
    expect(detailLine("birthday", { person: "Hana", birth_year: 2010 }, 2027)).toBe("Hana turns 17");
    expect(detailLine("birthday", { person: "Hana" }, 2027)).toBe("Hana's birthday");
  });

  it("joins the other kinds' details", () => {
    expect(detailLine("work", { role: "Intern", organization: "Ethio Telecom" }, 2026)).toBe("Intern at Ethio Telecom");
    expect(detailLine("trip", { destination: "Lalibela", companions: "Mom" }, 2026)).toBe("To Lalibela with Mom");
    expect(detailLine("wedding", { venue: "Sheraton" }, 2026)).toBe("at Sheraton");
    expect(detailLine("deadline", {}, 2026)).toBeNull();
  });
});
