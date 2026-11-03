import { z } from "zod";
import { AVATAR_PARTS } from "@/lib/avatar";

export const avatarSchema = z.strictObject({
  theme: z.enum(AVATAR_PARTS.theme),
  eyes: z.enum(AVATAR_PARTS.eyes),
  mouth: z.enum(AVATAR_PARTS.mouth),
  top: z.enum(AVATAR_PARTS.top),
  extra: z.enum(AVATAR_PARTS.extra),
  bg: z.enum(AVATAR_PARTS.bg),
});
