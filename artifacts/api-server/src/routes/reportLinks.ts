import express, { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { isAdminKey } from "../lib/adminAuth";
import { claude, claudeReady, parseJson } from "../lib/claude";
import { siteUrl } from "../lib/mailer";
import { receiptHtml, orderServices } from "../lib/receiptPage";

const router = Router();
const admin = (req: Request, res: Response, next: NextFunction) => (isAdminKey(req.header("x-admin-key")) ? next() : void res.status(401).json({ error: "Admin only" }));

let ready: Promise<void> | null = null;
const ensure = () => (ready ??= (async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS hydro_links (
    token TEXT PRIMARY KEY, report_id INT NOT NULL, receipt_seq INT NOT NULL, amount NUMERIC NOT NULL, method TEXT NOT NULL DEFAULT 'cash',
    reference TEXT NOT NULL DEFAULT '', payer_name TEXT NOT NULL DEFAULT '', payer_phone TEXT NOT NULL DEFAULT '', paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    note TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT true, opened INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
})().catch((e) => { ready = null; throw e; }));

const receiptNo = (seq: number, at: Date) => `HR-${at.getFullYear()}-${String(seq).padStart(4, "0")}`;
const linkOf = (token: string) => `${siteUrl()}/api/report-links/${token}`;

/** Read the payment details out of a pasted M-Pesa / PayPal / bank message, or a screenshot of it. Nothing is saved: the admin checks the fields first. */
router.post("/report-links-read", admin, express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "10mb" }), async (req, res) => {
  try {
    if (!claudeReady()) return void res.status(503).json({ error: "No AI key is set on the server yet." });
    const isImg = Buffer.isBuffer(req.body) && req.body.length > 0;
    const text = !isImg ? String(req.body?.text ?? "").slice(0, 4000) : "";
    if (!isImg && !text.trim()) return void res.status(400).json({ error: "Paste the payment message or upload its screenshot." });
    const prompt = `This is a payment confirmation (M-Pesa, PayPal, bank or other). Read ONLY what is written in it. Never guess. Reply with JSON only: {"amount": number or null, "method": "mpesa"|"bank"|"cash"|"cheque"|"other", "reference": "transaction code or reference, or empty", "payerName": "name of who paid, or empty", "payerPhone": "phone of who paid, or empty", "paidAt": "ISO date-time if shown, or empty"}. For M-Pesa the code looks like UC12AB3CDE. Amount is the money sent, a plain number without currency.`;
    const content = isImg
      ? [{ type: "image", source: { type: "base64", media_type: String(req.headers["content-type"]).split(";")[0], data: (req.body as Buffer).toString("base64") } }, { type: "text", text: prompt }]
      : [{ type: "text", text: `${prompt}\n\nMESSAGE:\n${text}` }];
    const out = await claude({ system: "You read payment messages exactly and never invent details.", messages: [{ role: "user", content }], maxTokens: 500, json: true });
    const j = parseJson<Record<string, unknown>>(out.text);
    const amount = Number(j.amount);
    res.json({
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      method: ["mpesa", "bank", "cash", "cheque", "other"].includes(String(j.method)) ? j.method : "",
      reference: String(j.reference ?? "").slice(0, 80), payerName: String(j.payerName ?? "").slice(0, 120), payerPhone: String(j.payerPhone ?? "").slice(0, 30), paidAt: String(j.paidAt ?? ""),
    });
  } catch (e) { res.status(500).json({ error: `Could not read the message: ${String((e as Error).message).slice(0, 200)}` }); }
});

/** Making the link means the client has paid: it needs only the amount (and how it was paid). */
router.post("/report-links", admin, async (req, res) => {
  try {
    await ensure();
    const b = req.body ?? {}; const rid = Math.floor(Number(b.reportId));
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) return void res.status(400).json({ error: "Type how much the client paid." });
    const r = (await pool.query("SELECT id, data, ref_no, clean_pdf IS NOT NULL AS has_pdf FROM hydro_reports WHERE id=$1", [rid])).rows[0];
    if (!r) return void res.status(404).json({ error: "Report not found." });
    if (!r.has_pdf) return void res.status(400).json({ error: "Write the report first (there is no PDF yet)." });
    const d = (r.data ?? {}) as Record<string, unknown>;
    const method = ["cash", "mpesa", "bank", "cheque"].includes(String(b.method)) ? String(b.method) : "cash";
    const when = b.paidAt && !Number.isNaN(Date.parse(String(b.paidAt))) ? new Date(String(b.paidAt)) : new Date();
    const seq = Number((await pool.query("SELECT COALESCE(MAX(receipt_seq),0)+1 AS n FROM hydro_links")).rows[0].n);
    const token = randomBytes(18).toString("hex");
    await pool.query("INSERT INTO hydro_links (token, report_id, receipt_seq, amount, method, reference, payer_name, payer_phone, paid_at, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [token, rid, seq, amount, method, String(b.reference ?? "").slice(0, 80), String(b.payerName || d.clientName || "").slice(0, 120), String(b.payerPhone || d.clientPhone || "").slice(0, 30), when, String(b.note ?? "").slice(0, 200)]);
    res.json({ ok: true, token, url: linkOf(token), receiptNo: receiptNo(seq, when) });
  } catch (e) { console.error("report link failed", e); res.status(500).json({ error: "Could not make the link." }); }
});

router.get("/report-links/by-report/:rid", admin, async (req, res) => {
  try {
    await ensure();
    const r = await pool.query("SELECT token, receipt_seq, amount, method, reference, paid_at, active, opened FROM hydro_links WHERE report_id=$1 ORDER BY created_at DESC", [Math.floor(Number(req.params.rid))]);
    res.json({ links: r.rows.map((x) => ({ token: x.token, url: linkOf(x.token), receiptNo: receiptNo(x.receipt_seq, new Date(x.paid_at)), amount: Number(x.amount), method: x.method, reference: x.reference, paidAt: x.paid_at, active: x.active, opened: x.opened })) });
  } catch { res.status(500).json({ error: "Could not load." }); }
});

/** Switch a link off (or on again). Links never expire by themselves. */
router.post("/report-links/:token/active", admin, async (req, res) => {
  try { await ensure(); await pool.query("UPDATE hydro_links SET active=$2 WHERE token=$1", [String(req.params.token), req.body?.active !== false]); res.json({ ok: true }); }
  catch { res.status(500).json({ error: "Could not change it." }); }
});

const find = async (token: string) => {
  await ensure();
  return (await pool.query("SELECT l.*, h.title, h.data, h.ref_no, (h.clean_pdf IS NOT NULL) AS has_pdf FROM hydro_links l JOIN hydro_reports h ON h.id=l.report_id WHERE l.token=$1 AND l.active", [String(token).slice(0, 80)])).rows[0];
};
const safe = (s: string) => s.replace(/[^\w .-]+/g, "").trim().slice(0, 80) || "Report";

// public: what the client opens
router.get("/report-links/:token", async (req, res) => {
  try {
    const l = await find(req.params.token);
    if (!l || !l.has_pdf) return void res.status(404).type("html").send("<p style='font:16px sans-serif;padding:24px'>This link is not available. Please contact us.</p>");
    await pool.query("UPDATE hydro_links SET opened=opened+1 WHERE token=$1", [l.token]);
    const when = new Date(l.paid_at); const ref = String(l.ref_no || l.title || "");
    const svc = (await pool.query("SELECT name FROM services").catch(() => ({ rows: [] as { name: string }[] }))).rows.map((x: { name: string }) => x.name);
    const html = receiptHtml({
      no: receiptNo(l.receipt_seq, when), date: when, name: l.payer_name || String((l.data as any)?.clientName ?? ""), phone: l.payer_phone, item: `Hydrogeological survey report${ref ? ` (${ref})` : ""}`,
      method: l.method, reference: l.reference, note: l.note, amount: Number(l.amount), services: orderServices(svc, "survey"),
    }, false, linkOf(l.token), { url: `${linkOf(l.token)}/report`, name: `Hydrogeological Survey Report - ${safe(ref)}.pdf`, title: `Hydrogeological Survey Report${ref ? ` - ${ref}` : ""}` });
    res.set("Cache-Control", "no-store").type("html").send(html);
  } catch { res.status(500).send("Could not open this page. Please try again."); }
});
router.get("/report-links/:token/report", async (req, res) => {
  try {
    const l = await find(req.params.token);
    if (!l) return void res.status(404).json({ error: "Not available" });
    const f = (await pool.query("SELECT clean_pdf FROM hydro_reports WHERE id=$1", [l.report_id])).rows[0];
    if (!f?.clean_pdf) return void res.status(404).json({ error: "Not available" });
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Hydrogeological Survey Report - ${safe(String(l.ref_no || l.title || ""))}.pdf"`, "Cache-Control": "no-store" }).send(f.clean_pdf);
  } catch { res.status(500).json({ error: "Could not download." }); }
});

export default router;
