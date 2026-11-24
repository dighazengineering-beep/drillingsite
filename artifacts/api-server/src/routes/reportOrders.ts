import express, { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import crypto from "crypto";
import { viewKey, keyOk, sms } from "./payments";
import { siteUrl } from "../lib/mailer";
import { claudeReady } from "../lib/claude";
import { ensureDocs } from "./clientDocs";
import { memberFrom } from "./members";
import { isAdminKey, adminEmails } from "../lib/adminAuth";
import { companyInfo } from "../lib/company";
import { elevationAt } from "../lib/elevation";
import { normaliseShot, readCoordinates } from "../lib/hydroAi";
import { pastDetails, ensureReportTables, queued, runningReports, getReportData, setReportData, reportFile, liveOf, stopReport } from "./reports";

/** The paid survey-report service for clients. Money arrives through the normal M-Pesa payment; credits are worked out here from CONFIRMED payments of the exact price, never from what the browser says. */
const router = Router();

export const PLANS = {
  one: { item: "Hydrogeological survey report (one-time)", price: 900, qty: 1, days: 0, label: "Per report", blurb: "Pay once for one report." },
  sub: { item: "Hydrogeological survey report (monthly plan)", price: 4000, qty: 7, days: 30, label: "Per month", blurb: "Up to 7 reports in a month, one payment." },
  year: { item: "Hydrogeological survey report (yearly plan)", price: 10000, qty: 30, days: 365, label: "Per year", blurb: "Up to 30 reports in a year, one payment." },
  boost: { item: "Hydrogeological survey report (booster pack)", price: 1900, qty: 7, days: 0, label: "Booster pack", blurb: "More reports for the rest of your month." },
} as const;
type PlanKey = keyof typeof PLANS;

/** Writing a report costs AI credits, so only approved emails can make one. The admin adds them in the admin panel; the admin emails always can. */
let accessReady: Promise<unknown> | null = null;
const ensureAccess = () => (accessReady ??= pool.query("CREATE TABLE IF NOT EXISTS report_access (email TEXT PRIMARY KEY, note TEXT NOT NULL DEFAULT '', added_at TIMESTAMPTZ NOT NULL DEFAULT now())"));
async function mayWrite(email: unknown) {
  const e = String(email ?? "").trim().toLowerCase(); if (!e) return false;
  if (adminEmails().includes(e)) return true;
  await ensureAccess(); return !!(await pool.query("SELECT 1 FROM report_access WHERE email=$1", [e])).rows[0];
}
const waLink = (email: string) => { const c = companyInfo(); const n = c.whatsapp; return { whatsapp: n ? `+${n}` : c.phone, url: n ? `https://wa.me/${n}?text=${encodeURIComponent(`Hello, I would like to generate a hydrogeological survey report on your website. My email is ${email}.`)}` : "" }; };
const adminOnly = (req: Request, res: Response, next: () => void) => (isAdminKey(req.header("x-admin-key")) ? next() : void res.status(401).json({ error: "Admin only" }));
router.get("/report-access", adminOnly, async (_q, res) => { await ensureAccess(); res.json({ list: (await pool.query("SELECT email, note, added_at FROM report_access ORDER BY added_at DESC")).rows }); });
router.post("/report-access", adminOnly, async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase(); if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email)) return void res.status(400).json({ error: "Type a proper email address." });
  await ensureAccess(); await pool.query("INSERT INTO report_access (email, note) VALUES ($1,$2) ON CONFLICT (email) DO UPDATE SET note=EXCLUDED.note", [email, String(req.body?.note ?? "").slice(0, 120)]); res.json({ ok: true });
});
router.delete("/report-access/:email", adminOnly, async (req, res) => { await ensureAccess(); await pool.query("DELETE FROM report_access WHERE email=$1", [String(req.params.email).toLowerCase()]); res.json({ ok: true }); });
router.get("/my-reports/access", async (req, res) => {
  const m = await memberFrom(req); if (!m) return void res.status(401).json({ error: "signin" });
  res.json({ allowed: await mayWrite(m.email), ...waLink(String(m.email ?? "")) });
});

const num = (v: unknown) => Number(v);
export const phoneOf = (v: unknown) => { const d = String(v ?? "").replace(/\D/g, ""); return /^254[17]\d{8}$/.test(d) ? d : /^0[17]\d{8}$/.test(d) ? `254${d.slice(1)}` : /^[17]\d{8}$/.test(d) ? `254${d}` : ""; };
/** Who is asking: the phone plus the key that only a payer from that phone was given. */
function who(req: Request, res: Response): string | null {
  const phone = phoneOf(req.query.phone ?? req.body?.phone);
  if (!phone || !keyOk(phone, String(req.query.key ?? req.body?.key ?? ""))) { res.status(401).json({ error: "Please pay first, or open the link we sent you." }); return null; }
  return phone;
}
async function wallet(phone: string) {
  const c = (await pool.query("SELECT kind, qty, used, expires_at FROM report_credits WHERE phone=$1 AND (expires_at IS NULL OR expires_at > now()) AND used < qty", [phone])).rows;
  const left = c.reduce((t, x) => t + (x.qty - x.used), 0);
  const sub = (await pool.query("SELECT MAX(expires_at) AS e FROM report_credits WHERE phone=$1 AND kind='sub' AND expires_at > now()", [phone])).rows[0]?.e ?? null;
  return { left, subUntil: sub as string | null, canBoost: !!sub && left === 0 };
}
/** What a client may see: never how many reports a plan holds. */
const pub = (w: { left: number; subUntil: string | null; canBoost: boolean }) => ({ can: w.left > 0, subUntil: w.subUntil, canBoost: w.canBoost });
router.get("/report-plans", (_q, res) => res.json({ free: !PAYMENTS_ON, plans: Object.entries(PLANS).map(([k, v]) => ({ key: k, item: v.item, price: v.price, label: v.label, blurb: v.blurb })), ai: claudeReady() }));

// "Add from Google": Google confirms who the person is, then we hand back their name and email, and what they typed in earlier reports. Optional for the client.
router.post("/my-reports/prefill", async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID, credential = String(req.body?.credential ?? "").slice(0, 4000);
  if (!clientId || !credential) { res.status(400).json({ error: "Google sign-in is not switched on." }); return; }
  try {
    const g = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    const info: any = await g.json();
    if (!g.ok || info.aud !== clientId || !(info.email_verified === true || info.email_verified === "true") || !info.email) { res.status(401).json({ error: "Google could not be verified." }); return; }
    const email = String(info.email).toLowerCase();
    const past = await pastDetails(email);
    res.json({ email, name: String(info.name ?? past.clientName ?? ""), data: past });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// after a payment is confirmed, turn it into credits (once)
router.post("/my-reports/claim", async (req, res) => {
  try {
    await ensureReportTables();
    const pid = Math.floor(num(req.body?.paymentId)); const phone = phoneOf(req.body?.phone);
    if (!pid || !phone || !keyOk(phone, String(req.body?.key ?? ""))) return void res.status(401).json({ error: "Payment not found" });
    const p = (await pool.query("SELECT id, phone, item, amount, status FROM payments WHERE id=$1", [pid])).rows[0];
    if (!p || p.phone !== phone) return void res.status(404).json({ error: "Payment not found" });
    if (p.status !== "paid") return void res.status(402).json({ error: "The payment is not confirmed yet." });
    const plan = (Object.keys(PLANS) as PlanKey[]).find((k) => PLANS[k].item === p.item && Number(p.amount) === PLANS[k].price);
    if (!plan) return void res.status(400).json({ error: "This payment is not for a report plan." });
    const W = PLANS[plan];
    let expires: Date | null = W.days ? new Date(Date.now() + W.days * 86400_000) : null;
    if (plan === "boost") {
      const sub = (await pool.query("SELECT MAX(expires_at) AS e FROM report_credits WHERE phone=$1 AND kind='sub' AND expires_at > now()", [phone])).rows[0]?.e;
      if (!sub) return void res.status(409).json({ error: "The booster pack is for an active monthly plan. Your plan has ended." });
      expires = new Date(sub);
    }
    const mem = await memberFrom(req);
    await pool.query("INSERT INTO report_credits (phone, kind, qty, expires_at, payment_id, member_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (payment_id) DO NOTHING", [phone, plan === "boost" ? "boost" : plan, W.qty, expires, pid, mem?.id ?? null]);
    void sms(phone, `${process.env.COMPANY_NAME || "Dighaz Engineering Limited"}: payment received. Open your survey reports any time: ${siteUrl()}/report?p=${phone}&k=${req.body.key}`);
    res.json({ ok: true, ...pub(await wallet(phone)) });
  } catch { res.status(500).json({ error: "Something went wrong. Please try again." }); }
});

/** Loyalty: for members who are not on the monthly plan, every 5th single report is free (after 4 paid ones). */
async function loyalty(memberId: number) {
  const paid = Number((await pool.query("SELECT count(*) AS n FROM report_credits WHERE member_id=$1 AND kind='one' AND payment_id IS NOT NULL", [memberId])).rows[0].n);
  const given = Number((await pool.query("SELECT count(*) AS n FROM report_credits WHERE member_id=$1 AND kind='bonus'", [memberId])).rows[0].n);
  const sub = !!(await pool.query("SELECT 1 FROM report_credits WHERE member_id=$1 AND kind='sub' AND expires_at > now() LIMIT 1", [memberId])).rows[0];
  const free = !sub && Math.floor(paid / 4) > given;
  return { paid, sub, free, toGo: free ? 0 : 4 - (paid - given * 4) % 4 };
}
router.get("/my-reports/loyalty", async (req, res) => {
  try { await ensureReportTables(); const m = await memberFrom(req); if (!m) return void res.status(401).json({ error: "Sign in first." }); res.json(await loyalty(m.id)); }
  catch { res.status(500).json({ error: "Could not load." }); }
});
router.post("/my-reports/bonus", async (req, res) => {
  try {
    await ensureReportTables();
    const m = await memberFrom(req); if (!m) return void res.status(401).json({ error: "Sign in first." });
    const l = await loyalty(m.id); if (!l.free) return void res.status(409).json({ error: "No free report yet." });
    const last = (await pool.query("SELECT phone FROM report_credits WHERE member_id=$1 AND payment_id IS NOT NULL ORDER BY id DESC LIMIT 1", [m.id])).rows[0];
    if (!last) return void res.status(409).json({ error: "No free report yet." });
    await pool.query("INSERT INTO report_credits (phone, kind, qty, expires_at, member_id) VALUES ($1,'bonus',1, now() + interval '60 days', $2)", [last.phone, m.id]);
    res.json({ ok: true, phone: last.phone, key: viewKey(last.phone) });
  } catch { res.status(500).json({ error: "Something went wrong." }); }
});

/** Start a report without paying: a signed-in member gets the key for their phone number (a number other people have used is refused). */
router.post("/my-reports/start", async (req, res) => {
  try {
    await ensureReportTables();
    const m = await memberFrom(req); if (!m) return void res.status(401).json({ error: "signin" });
    const phone = phoneOf(req.body?.phone); if (!phone) return void res.status(400).json({ error: "Enter your phone number first." });
    const other = (await pool.query("SELECT (SELECT count(*) FROM hydro_reports WHERE owner_phone=$1 AND COALESCE(member_id,0)<>$2) + (SELECT count(*) FROM report_credits WHERE phone=$1 AND COALESCE(member_id,0)<>$2) AS n", [phone, m.id])).rows[0]?.n;
    if (Number(other) > 0 && !keyOk(phone, String(req.body?.key ?? ""))) return void res.status(409).json({ error: "This number has been used with another account. Open the link we sent you, or use your own number." });
    res.json({ ok: true, phone, key: viewKey(phone) });
  } catch { res.status(500).json({ error: "Something went wrong." }); }
});

/** Test access without paying. OFF until REPORT_TEST_CODE is set on the server; a client must also open /report?test=1 to see the box. Gives one report, valid for 2 days. */
/** TEMPORARY free-test switch while the site is not public: with no REPORT_TEST_CODE set, /report?test=1 gives a free report for any phone. Set to false (or ask Claude to "disable the free test") before the site goes public. */
/** Payment for reports is ON. Set REPORT_PAYMENT=off on the server to make "Make my report" free again (one report each time). */
const PAYMENTS_ON = process.env.REPORT_FREE !== "on";   // the old REPORT_PAYMENT=off is ignored on purpose
const testTries = new Map<string, number>();
router.post("/my-reports/test-access", async (req, res) => {
  try {
    await ensureReportTables();
    const want = process.env.REPORT_TEST_CODE || "";
    const ip = String(req.ip ?? ""); const n = (testTries.get(ip) ?? 0) + 1; testTries.set(ip, n); setTimeout(() => testTries.delete(ip), 3600_000).unref?.();
    if ((!want && PAYMENTS_ON) || n > 10) return void res.status(404).json({ error: "Not available" });
    const given = String(req.body?.code ?? ""); const phone = phoneOf(req.body?.phone);
    if (!phone) return void res.status(400).json({ error: "Enter your phone number first." });
    const mine = keyOk(phone, String(req.body?.key ?? ""));
    if (!want && !mine) { // a new identity only for a number nobody has used yet, so nobody can open someone else's reports or saved documents
      await ensureDocs();
      const used = (await pool.query("SELECT (SELECT count(*) FROM hydro_reports WHERE owner_phone=$1) + (SELECT count(*) FROM report_credits WHERE phone=$1) + (SELECT count(*) FROM client_docs WHERE phone=$1) AS n", [phone])).rows[0]?.n;
      if (Number(used) > 0) return void res.status(409).json({ error: "This number has used the service before. Open the link we sent you to continue." });
    }
    if (want) { const a = Buffer.from(given), b = Buffer.from(want); if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return void res.status(401).json({ error: "That code is not right." }); }
    await pool.query("INSERT INTO report_credits (phone, kind, qty, expires_at) VALUES ($1,'one',1, now() + interval '2 days')", [phone]);
    res.json({ ok: true, phone, key: viewKey(phone) });
  } catch { res.status(500).json({ error: "Something went wrong." }); }
});

// the report as it is being written: title page first, then each section once the code has confirmed it
router.post("/my-reports/:id/stop", async (req, res) => {
  try {
    const phone = who(req, res); if (!phone) return;
    const rid = Math.floor(Number(req.params.id));
    const o = (await pool.query("SELECT owner_phone, status FROM hydro_reports WHERE id=$1", [rid])).rows[0];
    if (!o || o.owner_phone !== phone) return void res.status(404).json({ error: "Not found" });
    await stopReport(rid); res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not stop." }); }
});

router.get("/my-reports/:id/live", async (req, res) => {
  try {
    const phone = who(req, res); if (!phone) return;
    const rid = Math.floor(Number(req.params.id));
    const o = (await pool.query("SELECT owner_phone FROM hydro_reports WHERE id=$1", [rid])).rows[0];
    if (!o || o.owner_phone !== phone) return void res.status(404).json({ error: "Not found" });
    const l = liveOf(rid);
    res.set("Cache-Control", "no-store").json(l ?? { sections: [], done: false, none: true });
  } catch { res.status(500).json({ error: "Could not load." }); }
});

// the details exactly as they are now saved, including anything our team corrected in the admin panel
router.get("/my-reports/:id/details", async (req, res) => {
  try {
    const phone = who(req, res); if (!phone) return;
    const o = (await pool.query("SELECT owner_phone, data FROM hydro_reports WHERE id=$1", [Math.floor(Number(req.params.id))])).rows[0];
    if (!o || o.owner_phone !== phone) return void res.status(404).json({ error: "Not found" });
    const d = (o.data ?? {}) as Record<string, unknown>; const out: Record<string, unknown> = {};
    for (const k of ALLOWED) if (d[k] !== undefined && String(d[k]).trim() !== "") out[k] = d[k];
    const picks = (Array.isArray(d.picks) ? d.picks : []).map((p: any) => ({ station: p.station, recommended: !!p.recommended, reason: p.reason, yieldText: p.yieldText, zoneFrom: p.zoneFrom, zoneTo: p.zoneTo, prefDepth: p.prefDepth, minDepth: p.minDepth, maxDepth: p.maxDepth }));
    res.set("Cache-Control", "no-store").json({ data: out, picks });
  } catch { res.status(500).json({ error: "Could not load." }); }
});

router.get("/my-reports", async (req, res) => {
  try {
    await ensureReportTables();
    const phone = who(req, res); if (!phone) return;
    const r = await pool.query("SELECT id, title, status, progress, error, released, unlocked, created_at, (docx IS NOT NULL) AS has_doc, (preview IS NOT NULL) AS has_prev, (clean_pdf IS NOT NULL) AS has_clean FROM hydro_reports WHERE owner_phone=$1 ORDER BY id DESC LIMIT 100", [phone]);
    res.json({ ...pub(await wallet(phone)), reports: r.rows.map((x) => ({ id: x.id, title: x.title, status: x.status === "review" ? "review" : x.status, progress: x.progress, released: x.released, ready: x.released && x.has_doc, unlocked: !!x.unlocked, preview: x.released && (x.unlocked ? x.has_clean : x.has_prev), createdAt: x.created_at, error: x.status === "failed" ? "We hit a problem and are fixing it. You will not be charged twice." : "" })) });
  } catch { res.status(500).json({ error: "Could not load." }); }
});

// only these details may come from a client
const ALLOWED = ["clientName", "clientPhone", "clientEmail", "siteRef", "village", "locationName", "subcounty", "county", "landmark", "elevation", "elevationAuto", "lat", "lng", "purpose", "instrument", "surveyDate", "collectedBy", "stationCount", "minDepth", "maxDepth", "preferredDepth", "preferredReason", "casing", "company", "geologistName", "geologistTitle", "landUse", "nearbySource", "demand", "notes", "attachDocs"];
function clean(b: any) {
  const d: Record<string, unknown> = {};
  for (const k of ALLOWED) if (b?.[k] !== undefined) d[k] = String(b[k]).slice(0, 300);
  const picks = (Array.isArray(b?.picks) ? b.picks : []).slice(0, 8).map((p: any) => ({ fileId: Math.floor(num(p.fileId)), station: String(p.station ?? "").slice(0, 10), recommended: !!p.recommended, reason: String(p.reason ?? "").slice(0, 200), yieldText: String(p.yieldText ?? "").slice(0, 60), zoneFrom: Math.max(0, num(p.zoneFrom) || 0), zoneTo: Math.max(0, num(p.zoneTo) || 0) }));
  d.picks = picks;
  return d;
}

const hits = new Map<string, number[]>();
const slow = (k: string, n: number) => { const t = Date.now(), a = (hits.get(k) ?? []).filter((x) => t - x < 3600_000); a.push(t); hits.set(k, a); return a.length > n; };

// the form is filled in BEFORE paying, so a draft is made first; a secret token proves it is yours
router.post("/my-reports/draft", async (req, res) => {
  try {
    await ensureReportTables();
    if (slow(`d:${req.ip ?? "x"}`, 12)) return void res.status(429).json({ error: "Please try again a little later." });
    await pool.query("UPDATE hydro_reports SET docx=NULL, preview=NULL, clean_pdf=NULL WHERE unlocked=false AND created_at < now() - interval '14 days' AND (docx IS NOT NULL OR preview IS NOT NULL)");   // previews never paid for are removed after 14 days
    await pool.query("DELETE FROM hydro_files WHERE report_id IN (SELECT id FROM hydro_reports WHERE owner_phone='' AND status='draft' AND created_at < now() - interval '14 days')");
    await pool.query("DELETE FROM hydro_reports WHERE owner_phone='' AND status='draft' AND created_at < now() - interval '14 days'");
    if ((await pool.query("SELECT COUNT(*)::int AS n FROM hydro_reports WHERE owner_phone='' AND status='draft'")).rows[0].n > 400) return void res.status(503).json({ error: "Busy right now. Please try again later." });
    const token = (await import("node:crypto")).randomBytes(16).toString("hex");
    const r = await pool.query("INSERT INTO hydro_reports (title, data, draft_token) VALUES ('Survey report', '{}', $1) RETURNING id", [token]);
    res.json({ id: r.rows[0].id, token });
  } catch (e) { console.error("draft failed", e); res.status(500).json({ error: "Could not start." }); }
});
const draftOf = async (rid: number, token: unknown) => (await pool.query("SELECT id FROM hydro_reports WHERE id=$1 AND draft_token=$2 AND status='draft' AND owner_phone=''", [rid, String(token ?? "")])).rows[0] as { id: number } | undefined;

// the form is saved as the client types, so the admin can see unfinished reports
router.put("/my-reports/:id/data", async (req, res) => {
  try {
    await ensureReportTables(); const rid = Number(req.params.id);
    if (!(await draftOf(rid, req.body?.token))) return void res.status(404).json({ error: "Report not found" });
    await pool.query("UPDATE hydro_reports SET data=$2, updated_at=now() WHERE id=$1 AND status='draft'", [rid, JSON.stringify(clean(req.body?.data))]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not save." }); }
});

router.post("/my-reports/:id/files", express.raw({ type: ["image/*", "application/octet-stream"], limit: "25mb" }), async (req, res) => {
  try {
    await ensureReportTables();
    const rid = Number(req.params.id);
    if (!(await draftOf(rid, req.query.token))) return void res.status(404).json({ error: "Report not found" });
    const kind = ["section", "location", "map", "photo"].includes(String(req.query.kind)) ? String(req.query.kind) : "";
    if (!kind || !Buffer.isBuffer(req.body) || !req.body.length) return void res.status(400).json({ error: "Send a PNG, JPG or WEBP picture." });
    const n = (await pool.query("SELECT COUNT(*)::int AS n FROM hydro_files WHERE report_id=$1", [rid])).rows[0].n;
    if (n >= 12) return void res.status(400).json({ error: "Too many pictures on this report." });
    const { png, w, h } = await normaliseShot(req.body, kind === "section" ? 1400 : 1600);
    const f = await pool.query("INSERT INTO hydro_files (report_id, kind, name, mime, w, h, data) VALUES ($1,$2,$3,'image/png',$4,$5,$6) RETURNING id", [rid, kind, String(req.query.name ?? "").slice(0, 80), w, h, png]);
    res.json({ id: f.rows[0].id });
  } catch { res.status(400).json({ error: "That picture could not be read." }); }
});

// the client removes a picture they uploaded by mistake
router.delete("/my-reports/:id/files/:fid", async (req, res) => {
  try {
    const rid = Number(req.params.id);
    if (!(await draftOf(rid, req.query.token))) return void res.status(404).json({ error: "Report not found" });
    await pool.query("DELETE FROM hydro_files WHERE id=$1 AND report_id=$2", [Number(req.params.fid), rid]);
    res.json({ ok: true });
  } catch { res.status(400).json({ error: "Could not remove that picture." }); }
});

// elevation for typed or pasted coordinates
router.get("/my-reports/elevation", async (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return void res.status(400).json({ error: "Bad coordinates" });
  if (slow(`e:${req.ip ?? "x"}`, 60)) return void res.status(429).json({ error: "Please try again a little later." });
  res.json({ elevation: await elevationAt(lat, lng) });
});

// read coordinates from a screenshot (the picture is not kept)
router.post("/my-reports/:id/coords", express.raw({ type: ["image/*", "application/octet-stream"], limit: "25mb" }), async (req, res) => {
  try {
    await ensureReportTables();
    if (!claudeReady()) return void res.status(503).json({ error: "Reading pictures is not available right now. Please type the coordinates." });
    if (!(await draftOf(Number(req.params.id), req.query.token))) return void res.status(404).json({ error: "Report not found" });
    if (slow(`c:${req.ip ?? "x"}`, 15)) return void res.status(429).json({ error: "Please try again a little later." });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return void res.status(400).json({ error: "Send a picture." });
    const { png } = await normaliseShot(req.body, 1200);
    const c = await readCoordinates(png);
    if (!c) return void res.status(422).json({ error: "We could not find coordinates in that picture. Please type or paste them." });
    const elevation = c.elevation ?? (await elevationAt(c.lat, c.lng));
    res.json({ lat: c.lat, lng: c.lng, elevation, auto: c.elevation == null && elevation != null });
  } catch { res.status(502).json({ error: "We could not read that picture. Please type or paste the coordinates." }); }
});

// submit: needs a draft token AND a paid credit (phone + key from the payment)
router.post("/my-reports/:id/submit", async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureReportTables(); const phone = who(req, res); if (!phone) return;
    const rid = Number(req.params.id);
    if (!(await draftOf(rid, req.body?.token))) return void res.status(404).json({ error: "Report not found" });
    const d = clean(req.body?.data) as any;
    const mineIds = new Set((await pool.query("SELECT id FROM hydro_files WHERE report_id=$1 AND kind='section'", [rid])).rows.map((x) => x.id));
    d.picks = (d.picks as any[]).filter((p) => mineIds.has(p.fileId) && p.station);
    if (!d.picks.length) return void res.status(400).json({ error: "Add at least one section picture with its point number." });
    if (!d.picks.some((p: any) => p.recommended)) return void res.status(400).json({ error: "Tick the recommended point." });
    for (const k of ["clientName", "county", "subcounty", "lat", "lng", "instrument"]) if (!String(d[k] ?? "").trim()) return void res.status(400).json({ error: "Please fill in the missing details (name, county, sub-county, coordinates, instrument)." });
    if (PAYMENTS_ON) {
      const m0 = await memberFrom(req); if (!m0) return void res.status(401).json({ error: "signin" });
      if (!(await mayWrite(m0.email))) return void res.status(403).json({ error: "access", ...waLink(String(m0.email ?? "")) });
    }
    await client.query("BEGIN");
    let unlocked = true; let memberId: number | null = null;
    if (PAYMENTS_ON) {
      // pay AFTER the report: the client gets a watermarked PDF first and pays to unlock the Word file
      const m = await memberFrom(req); if (!m) { await client.query("ROLLBACK"); return void res.status(401).json({ error: "signin" }); }
      memberId = m.id; unlocked = false;
      const open = Number((await client.query("SELECT count(*) AS n FROM hydro_reports WHERE member_id=$1 AND unlocked=false AND status<>'draft' AND created_at > now() - interval '14 days'", [m.id])).rows[0].n);
      if (open >= 3) { await client.query("ROLLBACK"); return void res.status(429).json({ error: "You already have 3 reports waiting to be unlocked. Unlock one first, or wait for them to expire." }); }
    } else {
      const c = (await client.query("SELECT id FROM report_credits WHERE phone=$1 AND (expires_at IS NULL OR expires_at > now()) AND used < qty ORDER BY expires_at NULLS LAST, id LIMIT 1 FOR UPDATE", [phone])).rows[0];
      if (!c) { await client.query("ROLLBACK"); const w = await wallet(phone); return void res.status(402).json({ error: w.canBoost ? "boost" : "pay" }); }
      await client.query("UPDATE report_credits SET used = used + 1 WHERE id=$1", [c.id]);
    }
    await client.query("UPDATE hydro_reports SET data=$2, title=$3, owner_phone=$4, draft_token='', status='working', progress='Starting…', updated_at=now(), unlocked=$5, member_id=$6 WHERE id=$1", [rid, JSON.stringify(d), String(d.siteRef || d.clientName || "Survey report").slice(0, 120), phone, unlocked, memberId]);
    await client.query("COMMIT");
    void queued(rid, false);
    res.json({ ok: true, ...pub(await wallet(phone)) });
  } catch { try { await client.query("ROLLBACK"); } catch { /* ignore */ } res.status(500).json({ error: "Could not submit. You were not charged." }); }
  finally { client.release(); }
});

// the watermarked PDF: free for the client to read, useless as a finished report
router.get("/my-reports/:id/preview", async (req, res) => {
  const phone = who(req, res); if (!phone) return;
  const r = (await pool.query("SELECT preview, clean_pdf, unlocked, title, released FROM hydro_reports WHERE id=$1 AND owner_phone=$2", [Number(req.params.id), phone])).rows[0];
  const pdf = r?.unlocked ? r.clean_pdf : r?.preview;   // paid: the clean PDF; unpaid: only the watermarked one
  if (!pdf || !r.released) return void res.status(404).json({ error: "The preview is not ready yet." });
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${r.unlocked ? "Report" : "Preview"} - ${String(r.title).replace(/[^\w .-]+/g, "")}.pdf"` }).send(pdf);
});

// after paying: use one credit (a paid single report, a plan report, or the free 5th) to unlock this report's Word file
router.post("/my-reports/:id/unlock", async (req, res) => {
  const client = await pool.connect();
  try {
    const phone = who(req, res); if (!phone) return;
    const rid = Math.floor(Number(req.params.id));
    await client.query("BEGIN");
    const r = (await client.query("SELECT unlocked FROM hydro_reports WHERE id=$1 AND owner_phone=$2 FOR UPDATE", [rid, phone])).rows[0];
    if (!r) { await client.query("ROLLBACK"); return void res.status(404).json({ error: "Report not found" }); }
    if (r.unlocked) { await client.query("ROLLBACK"); return void res.json({ ok: true, ...pub(await wallet(phone)) }); }
    const c = (await client.query("SELECT id FROM report_credits WHERE phone=$1 AND (expires_at IS NULL OR expires_at > now()) AND used < qty ORDER BY expires_at NULLS LAST, id LIMIT 1 FOR UPDATE", [phone])).rows[0];
    if (!c) { await client.query("ROLLBACK"); const w = await wallet(phone); return void res.status(402).json({ error: w.canBoost ? "boost" : "pay" }); }
    await client.query("UPDATE report_credits SET used = used + 1 WHERE id=$1", [c.id]);
    await client.query("UPDATE hydro_reports SET unlocked=true WHERE id=$1", [rid]);
    await client.query("COMMIT");
    res.json({ ok: true, ...pub(await wallet(phone)) });
  } catch { try { await client.query("ROLLBACK"); } catch { /* ignore */ } res.status(500).json({ error: "Could not unlock. You were not charged." }); }
  finally { client.release(); }
});

router.get("/my-reports/:id/download", async (req, res) => {
  const phone = who(req, res); if (!phone) return;
  const r = (await pool.query("SELECT docx, title, released, unlocked FROM hydro_reports WHERE id=$1 AND owner_phone=$2", [Number(req.params.id), phone])).rows[0];
  if (!r?.docx || !r.released) return void res.status(404).json({ error: "Your report is still being checked." });
  if (!r.unlocked) return void res.status(402).json({ error: "Pay to unlock the Word file." });
  const name = `Hydrogeological Survey Report - ${String(r.title).replace(/[^\w .-]+/g, "")}.docx`;
  res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${name}"` }).send(r.docx);
});

void getReportData; void setReportData; void reportFile; void runningReports; void viewKey;
export default router;
