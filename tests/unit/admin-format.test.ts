import { describe, expect, it } from "vitest";
import { formatBytes, formatDayString, formatWhen, isSuspended, timeAgo } from "@/lib/admin-format";
import { csvField, toCsv } from "@/lib/csv";

describe("admin formatting", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");

  it("timeAgo picks the largest whole unit", () => {
    expect(timeAgo("2026-11-05T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-11-05T11:55:00Z", now)).toBe("5 minutes ago");
    expect(timeAgo("2026-11-05T11:00:00Z", now)).toBe("1 hour ago");
    expect(timeAgo("2026-11-02T12:00:00Z", now)).toBe("3 days ago");
    expect(timeAgo("2026-10-20T12:00:00Z", now)).toBe("2 weeks ago");
    expect(timeAgo("2026-08-01T12:00:00Z", now)).toBe("3 months ago");
    expect(timeAgo("2024-11-01T12:00:00Z", now)).toBe("2 years ago");
    expect(timeAgo("2026-11-06T12:00:00Z", now)).toBe("just now");
  });

  it("formatBytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(300 * 1024 * 1024)).toBe("300 MB");
    expect(formatBytes(1.25 * 1024 ** 3)).toBe("1.3 GB");
  });

  it("isSuspended only for a ban that hasn't ended", () => {
    expect(isSuspended(null, now)).toBe(false);
    expect(isSuspended("2026-11-04T00:00:00Z", now)).toBe(false);
    expect(isSuspended("2026-11-06T00:00:00Z", now)).toBe(true);
  });

  it("formats in the admin's zone and calendar", () => {
    expect(formatWhen("2026-11-05T05:24:00Z", "gregorian", "Africa/Addis_Ababa")).toBe("November 5, 2026 · 08:24");
    expect(formatWhen("2026-11-05T05:24:00Z", "ethiopian", "Africa/Addis_Ababa")).toMatch(/2019 · 08:24$/);
    expect(formatDayString("2026-11-05", "gregorian")).toBe("November 5, 2026");
  });
});

describe("csv", () => {
  it("quotes only when needed", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField(null)).toBe("");
    expect(csvField(3)).toBe("3");
    expect(csvField(false)).toBe("false");
  });

  it("defuses spreadsheet formulas in text", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("@sum")).toBe("'@sum");
    expect(csvField("-1+1")).toBe("'-1+1");
    expect(csvField(-1)).toBe("-1");
  });

  it("builds a document", () => {
    expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\r\n1,"x,y"\r\n');
  });
});
