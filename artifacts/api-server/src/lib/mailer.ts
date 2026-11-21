import { companyInfo } from "./company";

// Email to clients and subscribers through Resend (RESEND_API_KEY). The sender is MAIL_FROM, for example
// "Dighaz Engineering <info@dighazengineering.com>" once that domain is verified in Resend.
// Sending never throws: a failed email must not break a quote, contract or payment.
export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const mailReady = () => !!process.env.RESEND_API_KEY;
const from = () => process.env.MAIL_FROM || "Dighaz Engineering <onboarding@resend.dev>";
export const siteUrl = () => {
  const v = (process.env.SITE_URL || companyInfo().website || "https://www.dighazengineering.com").trim();
  return (/^https?:\/\//.test(v) ? v : `https://${v}`).replace(/[\/.\s]+$/, "");
};

export interface Mail { to: string; subject: string; html: string; text: string; unsubscribe?: string }

const body = (m: Mail) => ({
  from: from(), to: [m.to], subject: m.subject, html: m.html, text: m.text,
  ...(m.unsubscribe ? { headers: { "List-Unsubscribe": `<${m.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
});

export async function sendMail(m: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.to)) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body(m)) });
    return r.ok;
  } catch { return false; }
}

/** Many emails at once (Resend takes up to 100 per request). Returns how many were accepted. */
export async function sendMany(list: Mail[]): Promise<number> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return 0;
  let ok = 0;
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    try {
      const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(chunk.map(body)) });
      if (r.ok) ok += chunk.length;
    } catch { /* ignore */ }
    if (i + 100 < list.length) await new Promise((res) => setTimeout(res, 600));
  }
  return ok;
}

/** Plain text with blank lines between paragraphs becomes simple HTML (links are made clickable). */
export const paragraphs = (t: string) => esc(t).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0a4fb3">$1</a>')}</p>`).join("");

/** The branded email shell: navy header, white card, optional button, small footer (with an unsubscribe link for marketing emails). */
export function shell(opts: { title: string; html: string; button?: { text: string; url: string }; unsubscribe?: string }): string {
  const co = companyInfo();
  return `<!doctype html><html><body style="margin:0;background:#eef2f7;padding:18px 10px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dbe3ee" cellpadding="0" cellspacing="0">
<tr><td style="background:#0b1d3a;border-bottom:4px solid #f59e0b;padding:16px 22px;color:#fff"><div style="font:700 18px Georgia,serif">${esc(co.legalName)}</div><div style="font-size:11px;letter-spacing:.18em;color:#f59e0b;font-weight:700;margin-top:2px">${esc(opts.title.toUpperCase())}</div></td></tr>
<tr><td style="padding:22px;font-size:15px;line-height:1.55">${opts.html}${opts.button ? `<p style="margin:20px 0 4px"><a href="${esc(opts.button.url)}" style="display:inline-block;background:#0a4fb3;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">${esc(opts.button.text)}</a></p>` : ""}</td></tr>
<tr><td style="padding:14px 22px;background:#f4f7fb;font-size:12px;color:#64748b;line-height:1.5">${esc(co.name)}${co.phone ? ` &middot; ${esc(co.phone)}` : ""}<br><a href="${esc(siteUrl())}" style="color:#64748b">${esc(siteUrl().replace(/^https?:\/\//, ""))}</a>${opts.unsubscribe ? `<br>You get this because you asked for our updates. <a href="${esc(opts.unsubscribe)}" style="color:#64748b">Unsubscribe</a>` : ""}</td></tr>
</table></td></tr></table></body></html>`;
}

/** One-off email to a client about their own quote, contract or message (not marketing, so no unsubscribe link). */
export function emailClient(to: string, subject: string, text: string, button?: { text: string; url: string }) {
  if (!to) return;
  void sendMail({ to, subject, text: `${text}${button ? `\n\n${button.text}: ${button.url}` : ""}`, html: shell({ title: subject, html: paragraphs(text), button }) });
}
