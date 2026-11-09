import { describe, expect, it } from "vitest";
import { emailCodeSchema } from "@/lib/validation/auth";
import { appEmailVerifySchema } from "@/lib/validation/app-auth";

describe("emailCodeSchema (website and phone app sign-in codes)", () => {
  it("accepts a 6-digit code, trimmed, and lowercases the email", () => {
    expect(emailCodeSchema.parse({ email: "Me@Example.com", code: " 123456 " })).toEqual({ email: "me@example.com", code: "123456" });
  });

  it.each(["12345", "1234567", "12a456", "", "12 456"])("rejects %j", (code) => {
    expect(emailCodeSchema.safeParse({ email: "me@example.com", code }).success).toBe(false);
  });

  it("is the same rule the phone app uses", () => {
    expect(appEmailVerifySchema).toBe(emailCodeSchema);
  });
});
