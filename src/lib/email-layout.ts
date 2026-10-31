/**
 * Branded, email-safe HTML shell (tables + inline styles only) for emails the app
 * sends itself. Mirrors supabase/templates/*.html, which Supabase sends for auth.
 * All dynamic strings passed in must already be HTML-escaped.
 */
const FONT = "'Nunito','Segoe UI',Helvetica,Arial,sans-serif";
const DISPLAY = "'Fredoka','Nunito','Segoe UI',Helvetica,Arial,sans-serif";

export function brandedEmail(o: {
  siteUrl: string;
  preheader: string;
  mascot: "hidi-wave" | "hidi-cheer";
  eyebrow: string;
  title: string;
  intro: string;
  cta: { label: string; url: string };
  note?: string;
}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>hidl</title>
</head>
<body style="margin:0;padding:0;background:#c8e6e2;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${o.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#c8e6e2" style="background:#c8e6e2;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
<tr><td align="center" style="padding:0 0 16px;font-family:${DISPLAY};font-size:26px;font-weight:700;color:#105f68;letter-spacing:-0.5px;">hidl</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #9ed5d1;border-radius:24px;padding:32px 28px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:0 0 12px;"><img src="${o.siteUrl}/email/${o.mascot}.png" width="96" height="110" alt="Hidi, the hidl mascot" style="display:block;border:0;outline:none;width:96px;height:auto;"></td></tr>
<tr><td align="center" style="font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#105f68;padding:0 0 6px;">${o.eyebrow}</td></tr>
<tr><td align="center" style="font-family:${DISPLAY};font-size:26px;line-height:32px;font-weight:700;color:#105f68;padding:0 0 12px;">${o.title}</td></tr>
<tr><td align="center" style="font-family:${FONT};font-size:16px;line-height:24px;color:#1f3b3f;padding:0 0 24px;">${o.intro}</td></tr>
<tr><td align="center" style="padding:0 0 ${o.note ? 24 : 0}px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="#3a9295" style="background:#3a9295;border-radius:14px;border-bottom:4px solid #105f68;">
<a href="${o.cta.url}" style="display:inline-block;padding:14px 32px;font-family:${DISPLAY};font-size:19px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;">${o.cta.label}</a>
</td></tr></table>
</td></tr>
${o.note ? `<tr><td align="center" bgcolor="#c8e6e2" style="background:#c8e6e2;border-radius:14px;padding:12px 16px;font-family:${FONT};font-size:14px;line-height:20px;color:#1f3b3f;">${o.note}</td></tr>` : ""}
</table>
</td></tr>
<tr><td align="center" style="padding:20px 8px 0;font-family:${FONT};font-size:13px;line-height:19px;color:#34595c;">hidl &middot; letters, countdowns &amp; a year in pictures</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
