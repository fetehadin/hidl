import type { SupabaseClient } from "@supabase/supabase-js";

export type UnlockEmail = { to: string; subject: string; html: string; text: string };
export type SendEmail = (email: UnlockEmail) => Promise<void>;

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Finds letters that have unlocked but haven't been announced, emails their owner,
 * and stamps unlock_email_sent_at. Needs a service-role client. Never includes the body.
 */
export async function sendUnlockEmails(admin: SupabaseClient, send: SendEmail, siteUrl: string) {
  const { data: letters, error } = await admin
    .from("letters")
    .select("id, user_id, title, recipient")
    .lte("unlock_at", new Date().toISOString())
    .is("unlock_email_sent_at", null)
    .is("opened_at", null)
    .order("unlock_at")
    .limit(50);
  if (error) throw error;

  const emails = new Map<string, string | undefined>();
  let sent = 0;
  const failed: string[] = [];

  for (const letter of letters ?? []) {
    if (!emails.has(letter.user_id)) {
      const { data } = await admin.auth.admin.getUserById(letter.user_id);
      emails.set(letter.user_id, data.user?.email);
    }
    const to = emails.get(letter.user_id);
    if (!to) continue;

    const url = `${siteUrl}/letters/${letter.id}`;
    try {
      await send({
        to,
        subject: `A letter just unlocked: ${letter.title}`,
        text: `"${letter.title}" (for ${letter.recipient}) is ready to open.\n\n${url}`,
        html: `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#3b2f2a;background:#fbf6ee">
  <p style="color:#9a4a2f;margin:0 0 8px">for ${escape(letter.recipient)}</p>
  <h2 style="font-weight:normal;margin:0 0 16px">${escape(letter.title)}</h2>
  <p>It's time. This letter has been waiting for you.</p>
  <p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#9a4a2f;color:#fbf6ee;text-decoration:none;border-radius:6px">Open it</a></p>
</div>`,
      });
    } catch (e) {
      console.error("unlock email failed", letter.id, e);
      failed.push(letter.id);
      continue;
    }
    const { error: markError } = await admin
      .from("letters")
      .update({ unlock_email_sent_at: new Date().toISOString() })
      .eq("id", letter.id);
    if (markError) failed.push(letter.id);
    else sent++;
  }

  return { checked: letters?.length ?? 0, sent, failed };
}

/** Resend (https://resend.com) over plain fetch, no SDK needed. */
export function resendSender(apiKey: string, from: string): SendEmail {
  return async (email) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, ...email }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  };
}
