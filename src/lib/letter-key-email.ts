import { brandedEmail } from "./email-layout";

/**
 * The "Your hidl letter key" email: the email half of the email key (src/lib/e2ee.ts), as a
 * button and as text to type in. The key rides in the link's #fragment, which browsers never
 * send to a server, so opening the link doesn't hand it back to hidl.
 */
export function letterKeyEmail(siteUrl: string, key: string, keyText: string) {
  const url = `${siteUrl}/letters/key#k=${key}`;
  return {
    subject: "Your hidl letter key: keep this email",
    text: [
      "This opens your private hidl letters on any device, even years from now. Keep this email.",
      "",
      "Sign in to hidl, then open this link:",
      url,
      "",
      `Or type this key in when hidl asks: ${keyText}`,
      "",
      "hidl doesn't keep this half of the key, so this email is the only copy. It only works together with your hidl account.",
    ].join("\n"),
    html: brandedEmail({
      siteUrl,
      preheader: "Opens your private letters on any device. Keep this email.",
      mascot: "hidi-wave",
      eyebrow: "your letter key",
      title: "Keep this email",
      intro:
        "This opens your private letters on any device, even years from now. Sign in to hidl, then tap the button.",
      cta: { label: "Unlock my letters", url },
      note: `Or type this key in when hidl asks:<br><strong style="font-family:Menlo,Consolas,monospace;letter-spacing:0.5px;">${keyText}</strong><br><br>hidl doesn&rsquo;t keep this half of the key, so this email is the only copy. It only works together with your hidl account.`,
    }),
  };
}
