// lib/email.ts
// Minimal Resend email helper with safe fallbacks.

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

function hasEmailEnv() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail({ to, subject, html, text }: SendArgs) {
  if (!hasEmailEnv()) {
    // Dev fallback: log instead of sending
    console.log("[email:DEV-FALLBACK]", { to, subject, html, text });
    return { ok: true, dev: true };
  }

  const apiKey = process.env.RESEND_API_KEY!;
  const from = process.env.EMAIL_FROM!;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend failed (${res.status}): ${body || res.statusText}`);
  }

  return { ok: true };
}

export function makeResetEmail(resetUrl: string) {
  const subject = "Reset your MOS Maintenance password";
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5">
      <h2>Reset your password</h2>
      <p>Click the button below to reset your password. This link expires in ~30 minutes.</p>
      <p><a href="${resetUrl}" style="background:#111;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none;display:inline-block">Reset Password</a></p>
      <p>or copy/paste this URL:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
    </div>`;
  const text = `Reset your password: ${resetUrl}`;
  return { subject, html, text };
}

export function makeInviteEmail(inviteUrl: string, shopId: number, role: string) {
  const subject = `You've been invited to MOS Maintenance (Shop #${shopId})`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5">
      <h2>You're invited</h2>
      <p>You've been invited to join Shop <b>#${shopId}</b> as <b>${role}</b>.</p>
      <p>Click below to complete your account setup.</p>
      <p><a href="${inviteUrl}" style="background:#111;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none;display:inline-block">Accept Invite</a></p>
      <p>or copy/paste this URL:</p>
      <p><a href="${inviteUrl}">${inviteUrl}</a></p>
    </div>`;
  const text = `Accept your invite: ${inviteUrl}`;
  return { subject, html, text };
}
