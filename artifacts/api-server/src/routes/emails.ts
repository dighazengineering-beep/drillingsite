import { Router, type Request } from "express";
import crypto from "node:crypto";
import { pool } from "@workspace/db";
import { isAdminKey } from "../lib/adminAuth";
import { companyInfo } from "../lib/company";
import { smsOwner } from "./payments";
import { sendMail, sendMany, shell, paragraphs, esc, siteUrl, mailReady, type Mail } from "../lib/mailer";

// Email list: people who asked for our updates (footer box). Welcome email on sign-up, one-click unsubscribe on every email,
// and the owner sends offers from the admin pane ("Emails").
const router = Router();
const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const okEmail = (e: string) => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;
const apiBase = (req: Request) => {
  const host = req.get("x-forwarded-host") || req.get("host") || "";
  const proto = /^localhost|^127\./.test(host) ? "http" : "https";
  return `${proto}://${host}`;
};
const unsubUrl = (base: string, token: string) => `${base}/api/unsubscribe/${token}`;
// where this server can be reached from outside (needed for unsubscribe links in emails sent by the timer, when there is no request)
const selfBase = () => (process.env.RENDER_EXTERNAL_URL || process.env.API_PUBLIC_URL || "").replace(/\/+$/, "");

let ready: Promise<unknown> | null = null;
const ensure = () => (ready ??= pool.query(`CREATE TABLE IF NOT EXISTS subscribers (
  id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', token TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'website', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), unsubscribed_at TIMESTAMPTZ)`).catch((e) => { ready = null; throw e; }));

const hits = new Map<string, number[]>();
const limited = (k: string, max: number, win = 600_000) => { const now = Date.now(), a = (hits.get(k) ?? []).filter((t) => now - t < win); a.push(now); hits.set(k, a); return a.length > max; };

const mailFor = (base: string, s: { email: string; token: string }, subject: string, text: string, button?: { text: string; url: string }): Mail => {
  const un = unsubUrl(base, s.token);
  return { to: s.email, subject, text: `${text}\n\nUnsubscribe: ${un}`, html: shell({ title: subject, html: paragraphs(text), button, unsubscribe: un }), unsubscribe: un };
};

router.post("/subscribe", async (req, res) => {
  try {
    await ensure();
    const email = str(req.body?.email, 120).toLowerCase(), name = str(req.body?.name, 80);
    if (!okEmail(email)) { res.status(400).json({ error: "Enter a valid email address." }); return; }
    if (limited(`sub:${req.ip ?? "x"}`, 8)) { res.status(429).json({ error: "Too many tries. Please wait a few minutes." }); return; }
    const token = crypto.randomBytes(16).toString("hex");
    const r = await pool.query(
      `INSERT INTO subscribers (email, name, token, source) VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO UPDATE SET unsubscribed_at=NULL, name=CASE WHEN EXCLUDED.name<>'' THEN EXCLUDED.name ELSE subscribers.name END
       RETURNING token, (xmax = 0) AS fresh, email`, [email, name, token, str(req.body?.source, 30) || "website"]);
    const co = companyInfo();
    void sendMail(mailFor(apiBase(req), r.rows[0], `Welcome to ${co.name}`,
      `Hello${name ? ` ${name}` : ""},\n\nThank you for joining us. You will get our offers and tips on boreholes, hydrogeological surveys, pumps, solar and water purification.\n\nYou can get an instant price any time on our website, and call or WhatsApp us on ${co.phone}.`,
      { text: "Get an instant quote", url: `${siteUrl()}/quote` }));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not sign you up. Please try again." }); }
});

const page = (msg: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head><body style="font-family:Segoe UI,Arial,sans-serif;background:#eef2f7;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="background:#fff;border-radius:14px;padding:28px;max-width:420px;margin:16px;text-align:center;border-top:4px solid #f59e0b"><h2 style="margin:0 0 8px;color:#0b1d3a">${esc(companyInfo().name)}</h2><p style="color:#334155">${msg}</p><a href="${esc(siteUrl())}" style="color:#0a4fb3;font-weight:700">Back to the website</a></div></body></html>`;
const unsub = async (token: string) => { await ensure(); return (await pool.query("UPDATE subscribers SET unsubscribed_at=COALESCE(unsubscribed_at, now()) WHERE token=$1 RETURNING id", [str(token, 64)])).rows.length > 0; };
router.get("/unsubscribe/:token", async (req, res) => { try { res.type("html").send(page((await unsub(req.params.token)) ? "You are unsubscribed. You will not get our update emails any more." : "This link is not valid.")); } catch { res.status(500).type("html").send(page("Something went wrong. Please try again.")); } });
router.post("/unsubscribe/:token", async (req, res) => { try { res.json({ ok: await unsub(req.params.token) }); } catch { res.status(500).json({ ok: false }); } });   // the one-click button in Gmail

const admin = (req: Request, res: import("express").Response) => { if (!isAdminKey(req.header("x-admin-key"))) { res.status(403).json({ error: "Admin only" }); return false; } return true; };

router.get("/admin/subscribers", async (req, res) => {
  if (!admin(req, res)) return;
  try {
    await ensure();
    const r = await pool.query("SELECT id, email, name, source, created_at, unsubscribed_at FROM subscribers ORDER BY id DESC LIMIT 1000");
    res.json({ mailReady: mailReady(), from: process.env.MAIL_FROM || "", active: r.rows.filter((x) => !x.unsubscribed_at).length, rows: r.rows });
  } catch { res.status(500).json({ error: "Could not load." }); }
});
router.delete("/admin/subscribers/:id", async (req, res) => {
  if (!admin(req, res)) return;
  try { await ensure(); await pool.query("DELETE FROM subscribers WHERE id=$1", [Math.round(Number(req.params.id)) || 0]); res.json({ ok: true }); } catch { res.status(500).json({ error: "Could not delete." }); }
});

// Send an offer to everyone subscribed ("test" sends only to the owner so the email can be checked first).
router.post("/admin/broadcast", async (req, res) => {
  if (!admin(req, res)) return;
  try {
    await ensure();
    const subject = str(req.body?.subject, 120), message = str(req.body?.message, 5000);
    if (subject.length < 3 || message.length < 10) { res.status(400).json({ error: "Write a subject and a message." }); return; }
    if (!mailReady()) { res.status(400).json({ error: "Email is not set up yet (RESEND_API_KEY on Render)." }); return; }
    const btnUrl = str(req.body?.buttonUrl, 300), btnText = str(req.body?.buttonText, 40) || "See the details";
    const button = /^https?:\/\/\S+$/.test(btnUrl) ? { text: btnText, url: btnUrl } : undefined;
    if (req.body?.test) {
      const to = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
      if (!okEmail(to)) { res.status(400).json({ error: "OWNER_EMAIL is not set on Render." }); return; }
      const sent = await sendMail(mailFor(apiBase(req), { email: to, token: "test" }, subject, message, button));
      res.json({ ok: sent, sent: sent ? 1 : 0, test: true }); return;
    }
    const subs = (await pool.query("SELECT email, token FROM subscribers WHERE unsubscribed_at IS NULL")).rows as { email: string; token: string }[];
    const sent = await sendMany(subs.map((s) => mailFor(apiBase(req), s, subject, message, button)));
    res.json({ ok: true, sent, total: subs.length });
  } catch { res.status(500).json({ error: "Could not send." }); }
});

// ---------------------------------------------------------------- automatic weekly offer
// The owner writes a few offers once (Admin > Emails). Every week, on the chosen day and hour (Nairobi time), the offer that was
// sent longest ago goes to every active subscriber, so the offers rotate by themselves. A timer checks every 15 minutes.
let autoReady: Promise<unknown> | null = null;
const ensureAuto = () => (autoReady ??= pool.query(`
  CREATE TABLE IF NOT EXISTS email_offers (id SERIAL PRIMARY KEY, subject TEXT NOT NULL, message TEXT NOT NULL, button_text TEXT NOT NULL DEFAULT '', button_url TEXT NOT NULL DEFAULT '', sent_count INT NOT NULL DEFAULT 0, last_sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS email_auto (id INT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT false, weekday INT NOT NULL DEFAULT 1, hour INT NOT NULL DEFAULT 9, last_sent_at TIMESTAMPTZ);
  INSERT INTO email_auto (id) VALUES (1) ON CONFLICT DO NOTHING;`).catch((e) => { autoReady = null; throw e; }));
const EAT = 3 * 3_600_000;   // Nairobi is UTC+3 all year
/** The most recent moment (on or before now) that falls on the chosen weekday and hour in Nairobi. */
function lastSlot(weekday: number, hour: number, now = Date.now()): Date {
  const n = new Date(now + EAT);   // read the UTC fields of this as Nairobi time
  const back = (n.getUTCDay() - weekday + 7) % 7;
  let slot = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() - back, hour, 0, 0);
  if (slot > n.getTime()) slot -= 7 * 86_400_000;
  return new Date(slot - EAT);
}
const nextSlot = (weekday: number, hour: number) => new Date(lastSlot(weekday, hour).getTime() + 7 * 86_400_000);

export async function weeklyOfferTick(): Promise<void> {
  try {
    await ensureAuto(); await ensure();
    const st = (await pool.query("SELECT enabled, weekday, hour FROM email_auto WHERE id=1")).rows[0];
    if (!st?.enabled || !mailReady()) return;
    const slot = lastSlot(st.weekday, st.hour);
    const offer = (await pool.query("SELECT * FROM email_offers ORDER BY last_sent_at NULLS FIRST, id LIMIT 1")).rows[0];
    const subs = (await pool.query("SELECT email, token FROM subscribers WHERE unsubscribed_at IS NULL")).rows as { email: string; token: string }[];
    if (!offer || !subs.length) return;
    // claim this week's slot first, so two servers (or two checks) can never send the same week twice
    const claim = await pool.query("UPDATE email_auto SET last_sent_at=now() WHERE id=1 AND (last_sent_at IS NULL OR last_sent_at < $1) RETURNING id", [slot]);
    if (!claim.rows.length) return;
    const url = /^https?:\/\/\S+$/.test(offer.button_url) ? offer.button_url : "";
    const button = url ? { text: offer.button_text || "See the details", url } : undefined;
    const sent = await sendMany(subs.map((s) => mailFor(selfBase(), s, offer.subject, offer.message, button)));
    await pool.query("UPDATE email_offers SET sent_count=sent_count+1, last_sent_at=now() WHERE id=$1", [offer.id]);
    smsOwner(`Weekly offer "${String(offer.subject).slice(0, 60)}" sent to ${sent} of ${subs.length} subscribers.`);
  } catch { /* try again at the next check */ }
}
if (process.env.DATABASE_URL && process.env.NODE_ENV !== "test") {
  setTimeout(() => void weeklyOfferTick(), 150_000).unref();
  setInterval(() => void weeklyOfferTick(), 15 * 60_000).unref();
}
// On Vercel there is no always-on process: a scheduled call (vercel.json "crons") runs the same check. Needs CRON_SECRET.
router.get("/cron/email-weekly", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.header("authorization") !== `Bearer ${secret}`) { res.status(403).json({ error: "Not allowed" }); return; }
  await weeklyOfferTick(); res.json({ ok: true });
});

const offerOf = (b: Record<string, unknown>) => ({ subject: str(b?.subject, 120), message: str(b?.message, 5000), buttonText: str(b?.buttonText, 40), buttonUrl: /^https?:\/\/\S+$/.test(str(b?.buttonUrl, 300)) ? str(b?.buttonUrl, 300) : "" });
router.get("/admin/email-auto", async (req, res) => {
  if (!admin(req, res)) return;
  try {
    await ensureAuto();
    const st = (await pool.query("SELECT enabled, weekday, hour, last_sent_at FROM email_auto WHERE id=1")).rows[0];
    const offers = (await pool.query("SELECT id, subject, message, button_text, button_url, sent_count, last_sent_at FROM email_offers ORDER BY id")).rows;
    res.json({ enabled: st.enabled, weekday: st.weekday, hour: st.hour, lastSentAt: st.last_sent_at, nextSend: nextSlot(st.weekday, st.hour), offers });
  } catch { res.status(500).json({ error: "Could not load." }); }
});
router.put("/admin/email-auto", async (req, res) => {
  if (!admin(req, res)) return;
  try {
    await ensureAuto();
    const wd = Math.round(Number(req.body?.weekday)), hr = Math.round(Number(req.body?.hour));
    if (!(wd >= 0 && wd <= 6) || !(hr >= 0 && hr <= 23)) { res.status(400).json({ error: "Choose a day and an hour." }); return; }
    const on = req.body?.enabled === true;
    // switching it on starts from now: the first email goes at the next chosen day and hour, not straight away
    await pool.query("UPDATE email_auto SET enabled=$1, weekday=$2, hour=$3, last_sent_at=CASE WHEN $1 AND last_sent_at IS NULL THEN now() ELSE last_sent_at END WHERE id=1", [on, wd, hr]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not save." }); }
});
router.post("/admin/email-offers", async (req, res) => {
  if (!admin(req, res)) return;
  try {
    await ensureAuto(); const o = offerOf(req.body ?? {});
    if (o.subject.length < 3 || o.message.length < 10) { res.status(400).json({ error: "Write a subject and a message." }); return; }
    const n = (await pool.query("SELECT COUNT(*)::int AS n FROM email_offers")).rows[0].n;
    if (n >= 50) { res.status(400).json({ error: "You can keep up to 50 offers." }); return; }
    await pool.query("INSERT INTO email_offers (subject, message, button_text, button_url) VALUES ($1,$2,$3,$4)", [o.subject, o.message, o.buttonText, o.buttonUrl]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not save." }); }
});
router.put("/admin/email-offers/:id", async (req, res) => {
  if (!admin(req, res)) return;
  try {
    await ensureAuto(); const o = offerOf(req.body ?? {});
    if (o.subject.length < 3 || o.message.length < 10) { res.status(400).json({ error: "Write a subject and a message." }); return; }
    await pool.query("UPDATE email_offers SET subject=$2, message=$3, button_text=$4, button_url=$5 WHERE id=$1", [Math.round(Number(req.params.id)) || 0, o.subject, o.message, o.buttonText, o.buttonUrl]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not save." }); }
});
router.delete("/admin/email-offers/:id", async (req, res) => {
  if (!admin(req, res)) return;
  try { await ensureAuto(); await pool.query("DELETE FROM email_offers WHERE id=$1", [Math.round(Number(req.params.id)) || 0]); res.json({ ok: true }); } catch { res.status(500).json({ error: "Could not delete." }); }
});

export default router;
