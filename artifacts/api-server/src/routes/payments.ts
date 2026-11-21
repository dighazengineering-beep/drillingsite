import { ensureContractTables, contractItem, contractNo as contractNo_ } from "../lib/contractDb";
import { receiptHtml, orderServices, receiptLabel, type ReceiptData } from "../lib/receiptPage";
import { emailClient, siteUrl } from "../lib/mailer";
import { buildXlsx } from "../lib/xlsx";
import { isAdminKey } from "../lib/adminAuth";
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { pool, db, servicesTable } from "@workspace/db";
import { JOB_TYPES, JOB_TYPE_IDS, PHRASES, typeDef, resolveJob, jobStatus } from "../lib/jobSteps";

/**
 * Payments: M-Pesa STK push (automatic) and bank transfer (the admin confirms).
 * A "job" is one phone number + one item (a service or product). Its balance = agreed total - confirmed payments.
 * Secrets live only in environment variables on the server.
 */
const router = Router();

let ready: Promise<unknown> | null = null;
function ensureTables() {
  ready ??= pool
    .query(
      `CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'service',
        item TEXT NOT NULL,
        pay_type TEXT NOT NULL DEFAULT 'full',
        amount NUMERIC NOT NULL,
        agreed_total NUMERIC NOT NULL,
        method TEXT NOT NULL DEFAULT 'mpesa',
        status TEXT NOT NULL DEFAULT 'pending',
        checkout_id TEXT,
        receipt TEXT NOT NULL DEFAULT '',
        bank_ref TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_img TEXT;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        link TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS notifications_phone_idx ON notifications (phone, id DESC);
      CREATE TABLE IF NOT EXISTS job_status (
        phone TEXT NOT NULL,
        item TEXT NOT NULL,
        stage INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (phone, item)
      );
      ALTER TABLE job_status ADD COLUMN IF NOT EXISTS job_type TEXT;
      ALTER TABLE job_status ADD COLUMN IF NOT EXISTS live_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE job_status ADD COLUMN IF NOT EXISTS live_now BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE job_status ADD COLUMN IF NOT EXISTS recording_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE job_status ADD COLUMN IF NOT EXISTS step TEXT;
      ALTER TABLE job_status ADD COLUMN IF NOT EXISTS eta TEXT NOT NULL DEFAULT '';
      ALTER TABLE job_status ADD COLUMN IF NOT EXISTS team_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE job_status ADD COLUMN IF NOT EXISTS team_phone TEXT NOT NULL DEFAULT '';
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS important BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE TABLE IF NOT EXISTS job_events (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        item TEXT NOT NULL,
        step TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        media_url TEXT NOT NULL DEFAULT '',
        media_type TEXT NOT NULL DEFAULT '',
        eta TEXT NOT NULL DEFAULT '',
        team_name TEXT NOT NULL DEFAULT '',
        team_phone TEXT NOT NULL DEFAULT '',
        important BOOLEAN NOT NULL DEFAULT FALSE,
        set_by TEXT NOT NULL DEFAULT 'Admin',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS job_events_job_idx ON job_events (phone, item, id DESC);
      CREATE INDEX IF NOT EXISTS payments_job_idx ON payments (phone, item);
      CREATE INDEX IF NOT EXISTS payments_checkout_idx ON payments (checkout_id);`,
    )
    .then(() => ensureContractTables())
    .catch((e) => { ready = null; throw e; });
  return ready;
}

/* ------------------------------------------------------------- safety */
// One server-only secret signs the M-Pesa reply address and the per-payer keys. MEMBER_SECRET is preferred; if it is missing another
// server-only value is used, and with none at all payments stay switched off (a made-up default would be guessable).
const baseSecret = () => process.env.MEMBER_SECRET || process.env.ADMIN_KEY || "";
const hmac = (data: string) => crypto.createHmac("sha256", baseSecret()).update(data).digest("hex");
/** Handed to the payer when they pay. Only someone who paid from this phone can read its notifications, balances and receipts. */
export const viewKey = (phone: string) => hmac(`view:${phone}`).slice(0, 32);
export const keyOk = (phone: string | null, key: unknown) => {
  if (!phone || !baseSecret() || typeof key !== "string" || key.length !== 32) return false;
  const good = Buffer.from(viewKey(phone));
  const got = Buffer.from(key);
  return got.length === good.length && crypto.timingSafeEqual(got, good);
};

// Light limits so nobody can use the site to flood phones with M-Pesa prompts (kept in memory, per server).
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs = 600_000) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return true; }
  list.push(now);
  hits.set(key, list);
  return false;
}
const SLOW_DOWN = "Too many payment attempts. Please wait a few minutes and try again.";

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? Math.round(n) : NaN; };
/** 07xx / 01xx / +254 / 254 -> 2547xxxxxxxx. A number from another country comes as full international digits (for example 447911123456) and is kept as it is. */
function normPhone(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  const n = d.startsWith("254") ? d : d.startsWith("0") ? "254" + d.slice(1) : d.length === 9 ? "254" + d : d;
  if (/^254[17]\d{8}$/.test(n)) return n;
  return !d.startsWith("0") && !d.startsWith("254") && /^[1-9]\d{7,14}$/.test(d) ? d : null;
}
const isKenyan = (p: string) => /^254[17]\d{8}$/.test(p);
const isAdmin = (req: Request) => isAdminKey(req.header("x-admin-key"));

interface Parsed { phone: string; name: string; email: string; kind: string; item: string; payType: string; amount: number; agreedTotal: number }
function parseBody(b: Record<string, unknown>): Parsed | string {
  const phone = normPhone(b.phone);
  const name = str(b.name, 80);
  const item = str(b.item, 140);
  const payType = ["deposit", "balance", "full"].includes(String(b.payType)) ? String(b.payType) : "full";
  const kind = b.kind === "product" ? "product" : "service";
  const amount = num(b.amount);
  const agreedTotal = num(b.agreedTotal);
  if (name.length < 2) return "Enter your name.";
  if (!phone) return "Enter a valid phone number.";
  if (!item) return "Choose what you are paying for.";
  if (!Number.isFinite(agreedTotal) || agreedTotal < 1 || agreedTotal > 50_000_000) return "Enter the agreed price.";
  if (!Number.isFinite(amount) || amount < 1) return "Enter the amount to pay.";
  if (amount > agreedTotal) return "The amount cannot be more than the agreed price.";
  return { phone, name, email: str(b.email, 120), kind, item, payType, amount, agreedTotal };
}

/** A payment made against a contract step: the amount, the item and the agreed total all come from the contract on the server, never from the browser.
 *  Returns null when the payment is not for a contract, a message when it is refused, or the body to use. */
async function applyContract(b: Record<string, unknown>): Promise<{ body: Record<string, unknown>; token: string; stage: string } | string | null> {
  const token = str(b.contractToken, 40);
  if (!token) return null;
  await ensureContractTables();
  const c = (await pool.query("SELECT id, name, phone, item, agreed_total, stages, signed_at FROM contracts WHERE token=$1", [token])).rows[0];
  if (!c) return "Contract not found.";
  const stages = c.stages as { id: string; amount: number }[];
  const rows = (await pool.query("SELECT stage, status FROM payments WHERE contract_token=$1 AND status IN ('pending','paid')", [token])).rows;
  const has = (id: string, st: string) => rows.some((x) => x.stage === id && x.status === st);
  // a payment of the whole balance ("all") covers every step that is still unpaid; once one exists, no step can be paid separately
  if (rows.some((x) => x.stage === "all")) return has("all", "paid") ? "This contract is already fully paid." : "A payment for the full balance is still being confirmed. Please wait a moment.";
  let sid = String(b.stage ?? ""), amount = 0, payType = "";
  if (sid === "all") {
    if (rows.some((x) => x.status === "pending")) return "A payment is still being confirmed. Please wait a moment.";
    const unpaid = stages.filter((x) => !has(x.id, "paid"));
    if (unpaid.length === 0) return "Nothing is left to pay on this contract.";
    if (unpaid.length === 1) sid = unpaid[0].id;   // only one step is left, so pay it the usual way
    else { amount = unpaid.reduce((t, x) => t + x.amount, 0); payType = unpaid.length === stages.length ? "full" : "balance"; }
  }
  if (sid !== "all") {
    const idx = stages.findIndex((x) => x.id === sid);
    if (idx < 0) return "Choose which payment step you are paying.";
    if (has(stages[idx].id, "paid")) return "This step is already paid.";
    if (has(stages[idx].id, "pending")) return "A payment for this step is still being confirmed. Please wait a moment.";
    for (let i = 0; i < idx; i++) if (!has(stages[i].id, "paid")) return "Please pay the earlier step first.";
    amount = stages[idx].amount;
    payType = stages.length === 1 ? "full" : idx === stages.length - 1 ? "balance" : "deposit";
  }
  const phone = str(b.phone, 20) || c.phone;
  return {
    token, stage: sid,
    body: { ...b, phone, name: str(b.name, 80) || c.name, kind: "service", item: contractItem({ id: c.id, item: c.item }), payType, amount, agreedTotal: Number(c.agreed_total) },
  };
}
const isDupStage = (e: unknown) => (e as { code?: string })?.code === "23505";

/** What the client has paid so far on this job and what is left. */
async function jobBalance(phone: string, item: string) {
  const r = await pool.query(
    `SELECT agreed_total, status, amount FROM payments WHERE phone=$1 AND item=$2 ORDER BY created_at DESC, id DESC`,
    [phone, item],
  );
  if (!r.rows.length) return { found: false, agreedTotal: 0, paid: 0, pending: 0, balance: 0 };
  const agreedTotal = Number(r.rows[0].agreed_total);
  const paid = r.rows.filter((x) => x.status === "paid").reduce((a, x) => a + Number(x.amount), 0);
  const pending = r.rows.filter((x) => x.status === "pending").reduce((a, x) => a + Number(x.amount), 0);
  return { found: true, agreedTotal, paid, pending, balance: Math.max(0, agreedTotal - paid) };
}

const kes = (n: number) => `KSh ${Math.round(n).toLocaleString("en-KE")}`;
async function notify(phone: string, title: string, body: string, link = "", important = false) {
  await pool.query("INSERT INTO notifications (phone,title,body,link,important) VALUES ($1,$2,$3,$4,$5)", [phone, title, body, link, important]).catch(() => {});
}
/** Text message through Africa's Talking. Needs AT_USERNAME and AT_API_KEY (AT_SENDER is optional). Quietly does nothing until they are set. */
export async function sms(phone: string, text: string) {
  if (!/^254\d{9}$/.test(phone)) return;
  const ibKey = process.env.INFOBIP_API_KEY, ibBase = (process.env.INFOBIP_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (ibKey && ibBase) {
    // Infobip: INFOBIP_API_KEY, INFOBIP_BASE_URL (like abc123.api.infobip.com), INFOBIP_SENDER optional
    try {
      await fetch(`${/^https?:\/\//.test(ibBase) ? ibBase : `https://${ibBase}`}/sms/3/messages`, {
        method: "POST",
        headers: { Authorization: `App ${ibKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ messages: [{ destinations: [{ to: phone }], ...(process.env.INFOBIP_SENDER ? { sender: process.env.INFOBIP_SENDER } : {}), content: { text: text.slice(0, 450) } }] }),
      });
    } catch { /* an SMS failing must never break a payment */ }
    return;
  }
  const user = process.env.AT_USERNAME, key = process.env.AT_API_KEY;
  if (!user || !key) return;
  try {
    const host = process.env.AT_ENV === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
    const body = new URLSearchParams({ username: user, to: `+${phone}`, message: text.slice(0, 450) });
    if (process.env.AT_SENDER) body.set("from", process.env.AT_SENDER);
    await fetch(process.env.AT_URL || `https://${host}/version1/messaging`, {
      method: "POST", headers: { apiKey: key, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
  } catch { /* an SMS failing must never break a payment */ }
}
/** Text the owner (OWNER_PHONE, e.g. 0712345678) when money or a bank proof arrives. */
export function smsOwner(text: string) {
  const raw = (process.env.OWNER_PHONE ?? "").replace(/\D/g, "");
  const ph = raw.startsWith("254") ? raw : raw.startsWith("0") ? `254${raw.slice(1)}` : raw.length === 9 ? `254${raw}` : "";
  if (ph) void sms(ph, text);
  void emailOwner(text);
  void whatsappOwner(raw.startsWith("0") ? `254${raw.slice(1)}` : raw.length === 9 ? `254${raw}` : raw, text);
}
/** The same alert by email through Resend (set RESEND_API_KEY and OWNER_EMAIL; MAIL_FROM is optional). A failure here never breaks the job. */
async function emailOwner(text: string) {
  const key = process.env.RESEND_API_KEY, to = (process.env.OWNER_EMAIL ?? "").trim();
  if (!key || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM || "Dighaz Engineering <onboarding@resend.dev>", to: [to], subject: text.slice(0, 70), text }),
    });
  } catch { /* ignore */ }
}
/** The same alert on WhatsApp through CallMeBot (set WHATSAPP_APIKEY; the number is OWNER_PHONE). */
async function whatsappOwner(phone: string, text: string) {
  const key = (process.env.WHATSAPP_APIKEY ?? "").trim();
  if (!key || !/^\d{11,13}$/.test(phone)) return;
  try { await fetch(`https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(key)}`); } catch { /* ignore */ }
}
/** Tell the client a payment was received and what is left on the job. */
async function notifyPaid(id: number) {
  const r = await pool.query("SELECT id, phone, item, amount, contract_token, stage, email, name FROM payments WHERE id=$1", [id]);
  if (!r.rows[0]) return;
  const { phone, item, amount } = r.rows[0];
  const rcp = receiptLink(r.rows[0]);
  let b = await jobBalance(phone, item);
  if (r.rows[0].contract_token) {   // a contract payment: the balance is the contract's agreed price minus its confirmed payments, whoever paid
    const k = (await pool.query("SELECT agreed_total, (SELECT COALESCE(SUM(amount),0) FROM payments WHERE contract_token=$1 AND status='paid') AS paid FROM contracts WHERE token=$1", [r.rows[0].contract_token])).rows[0];
    if (k) b = { found: true, agreedTotal: Number(k.agreed_total), paid: Number(k.paid), pending: 0, balance: Math.max(0, Number(k.agreed_total) - Number(k.paid)) };
  }
  const co = process.env.COMPANY_NAME || "Dighaz Engineering Limited";
  void sms(phone, b.balance > 0
    ? `${co}: we received ${kes(Number(amount))} for ${item}. Balance remaining: ${kes(b.balance)}. Receipt: ${rcp}`
    : `${co}: we received ${kes(Number(amount))} for ${item}. Fully paid. Thank you! Receipt: ${rcp}`);
  let mail = String(r.rows[0].email ?? "");
  if (!mail && r.rows[0].contract_token) mail = String((await pool.query("SELECT client_email FROM contracts WHERE token=$1", [r.rows[0].contract_token])).rows[0]?.client_email ?? "");
  if (mail && r.rows[0].contract_token) {
    const tk = String(r.rows[0].contract_token);
    const total = Number((b as { agreedTotal?: number }).agreedTotal ?? 0), paidNow = Number((b as { paid?: number }).paid ?? 0);
    const pct = total > 0 ? Math.min(100, Math.round((paidNow * 100) / total)) : 0;
    const live = `${siteUrl()}/contract/${tk}`, pdf = `${apiBase()}/api/contracts/${tk}/pdf`;
    const full = b.balance <= 0;
    emailClient(mail, full ? `Fully paid: thank you, ${r.rows[0].name}` : `Payment received: ${pct}% of your contract is paid`,
      `Hello ${r.rows[0].name},\n\nWe received ${kes(Number(amount))} for ${item}.\n\nPaid so far: ${kes(paidNow)} (${pct}% of ${kes(total)})\n${full ? "Your contract is now 100% PAID. Thank you for choosing " + co + "." : "Still to pay: " + kes(b.balance)}\n\nReceipt: ${rcp}\nYour live contract page: ${live}\nYour contract as a PDF (Save as PDF): ${pdf}\n\nKeep this email. The links bring your contract back any time.`,
      { text: "Open my contract", url: live });
  } else if (mail) emailClient(mail, `Receipt ${await receiptNoOf(r.rows[0].id)}: ${kes(Number(amount))} received`, `Hello ${r.rows[0].name},\n\nWe received ${kes(Number(amount))} for ${item}. ${b.balance > 0 ? `Balance remaining: ${kes(b.balance)}.` : "It is now fully paid."}\n\nYour receipt is ready. Open it to read, print or save it as a PDF.\n\nThank you for choosing ${co}.`, { text: "Open my receipt", url: rcp });
  smsOwner(`Payment received: ${kes(Number(amount))} for ${item} from ${phone}. Balance ${kes(b.balance)}.`);
  await notify(
    phone,
    b.balance > 0 ? "Payment received" : "Payment complete",
    b.balance > 0
      ? `We received ${kes(Number(amount))} for ${item}. Balance remaining: ${kes(b.balance)}.`
      : `We received ${kes(Number(amount))} for ${item}. It is fully paid. Thank you for choosing Dighaz Engineering Limited.`,
    "/feed",
  );
}

/* ------------------------------------------------------------- public */
/** Bank accounts to show. BANK_ACCOUNTS = "Bank|Account name|Account number;Bank|Account name|Account number" (or the single BANK_* variables). */
export function bankAccounts() {
  const multi = (process.env.BANK_ACCOUNTS ?? "").split(";").map((x) => x.split("|").map((y) => y.trim())).filter((x) => x.length >= 3 && x[2])
    .map(([bankName, accountName, accountNumber, paybill]) => ({ bankName, accountName, accountNumber, paybill: paybill ?? "" }));
  if (multi.length) return multi;
  return process.env.BANK_ACCOUNT_NUMBER
    ? [{ bankName: process.env.BANK_NAME ?? "", accountName: process.env.BANK_ACCOUNT_NAME ?? "", accountNumber: process.env.BANK_ACCOUNT_NUMBER, paybill: "" }]
    : [];
}
router.get("/payments/config", (_req, res) => {
  res.json({ mpesa: mpesaReady(), banks: bankAccounts() });
});

router.get("/payments/balance", async (req, res) => {
  try {
    await ensureTables();
    const phone = normPhone(req.query.phone);
    const item = str(req.query.item, 140);
    if (!phone || !item || !keyOk(phone, req.query.key)) { res.json({ found: false, agreedTotal: 0, paid: 0, pending: 0, balance: 0 }); return; }
    res.json(await jobBalance(phone, item));
  } catch { res.json({ found: false, agreedTotal: 0, paid: 0, pending: 0, balance: 0 }); }
});

router.get("/payments/notifications", async (req, res) => {
  try {
    await ensureTables();
    const phone = normPhone(req.query.phone);
    if (!phone || !keyOk(phone, req.query.key)) { res.json([]); return; }
    const r = await pool.query('SELECT id, title, body, link, important, created_at AS "createdAt" FROM notifications WHERE phone=$1 ORDER BY id DESC LIMIT 20', [phone]);
    res.json(r.rows);
  } catch { res.json([]); }
});

router.get("/payments/:id/status", async (req, res) => {
  try {
    await ensureTables();
    const id = Number(req.params.id) || 0;
    await reconcile(id).catch(() => {}); // ask Safaricom if the reply never reached us
    const r = await pool.query("SELECT status, receipt, amount, note, phone FROM payments WHERE id=$1", [id]);
    if (!r.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
    // Without the payer's key only the status word is given, never the receipt number, amount or note
    if (!keyOk(r.rows[0].phone, req.query.key)) { res.json({ status: r.rows[0].status }); return; }
    res.json({ status: r.rows[0].status, receipt: r.rows[0].receipt, amount: Number(r.rows[0].amount), note: r.rows[0].note });
  } catch { res.status(500).json({ error: "Could not check the payment." }); }
});

/* ------------------------------------------------------------- printable receipt */
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const NAMES: Record<string, string> = { deposit: "Deposit", balance: "Balance payment", full: "Full payment" };

// A receipt page for one confirmed payment. The payer opens it with their own key, the admin with the admin key.
/** The address a client opens to see (and print) the receipt of one payment. Contract payments are opened with the contract's own address; other payments with the payer's key. */
const apiBase = () => (process.env.PUBLIC_API_URL ?? process.env.RENDER_EXTERNAL_URL ?? "").replace(/\/$/, "");
/** Every paid payment gets the next receipt-book number, once, in the order they were paid (older paid payments are numbered first, by id). Returns the number to print, like 120 or 120A. */
async function receiptNoOf(id: number): Promise<string> {
  await ensureContractTables();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(7120)");
    await c.query(`WITH base AS (SELECT COALESCE(MAX(receipt_no),0) AS m FROM payments), n AS (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM payments WHERE status='paid' AND receipt_no IS NULL)
      UPDATE payments p SET receipt_no=base.m+n.rn FROM n, base WHERE p.id=n.id`);
    const r = await c.query("SELECT receipt_no FROM payments WHERE id=$1", [id]);
    await c.query("COMMIT");
    return r.rows[0]?.receipt_no ? receiptLabel(Number(r.rows[0].receipt_no)) : String(id);
  } catch { await c.query("ROLLBACK").catch(() => {}); return String(id); } finally { c.release(); }
}
function receiptLink(p: { id: number; phone: string; contract_token?: string | null }) {
  const q = p.contract_token ? `ct=${encodeURIComponent(p.contract_token)}` : `key=${viewKey(p.phone)}`;
  return `${apiBase()}/api/payments/${p.id}/receipt?${q}`;
}
async function receiptDataOf(p: any): Promise<ReceiptData> {
    let contractNo: string | undefined, stepLabel: string | undefined;
    if (p.contract_token) {
      const k = (await pool.query("SELECT id, stages FROM contracts WHERE token=$1", [p.contract_token])).rows[0];
      if (k) { contractNo = contractNo_(k.id); stepLabel = p.stage === "all" ? (p.pay_type === "full" ? "Full payment" : "Full balance") : ((k.stages as { id: string; label: string }[]).find((x) => x.id === p.stage) ?? { label: "" }).label || undefined; }
    }
    const svc = await db.select({ name: servicesTable.name }).from(servicesTable).catch(() => [] as { name: string }[]);
    const ref = p.method === "mpesa" ? String(p.receipt || p.bank_ref || "") : String(p.bank_ref || "").slice(0, 80);
    return ({
      no: await receiptNoOf(p.id), date: new Date(p.paid_at ?? p.created_at), name: p.name, phone: p.phone, item: String(p.item).replace(/\s*\(Contract [^)]*\)\s*$/, ""), stepLabel, contractNo,
      method: p.method, reference: ref, note: p.method === "cash" || p.method === "cheque" ? String(p.note ?? "") : "", amount: Number(p.amount),
      services: orderServices(svc.map((x) => x.name), String(p.item)),
    });
}
/** Every confirmed payment of a contract as a full receipt (for attaching to the contract printout). */
export async function contractReceiptHtmls(token: string): Promise<string[]> {
  try {
    await ensureTables(); await ensureContractTables();
    const r = await pool.query(
      `SELECT id, phone, name, email, item, pay_type, amount, agreed_total, method, status, receipt, bank_ref, note, contract_token, stage, paid_at, created_at FROM payments WHERE contract_token=$1 AND status='paid' ORDER BY id`, [token]);
    const out: string[] = [];
    for (const p of r.rows) out.push(receiptHtml(await receiptDataOf(p), true));
    return out;
  } catch { return []; }
}
/** The public link of a receipt: on our own domain, opens without a login for whoever holds it (the key belongs to the payer's phone, or the contract link is used). */
function receiptShareLink(p: { id: number; phone: string; contract_token: string | null }, key: unknown, ct: string): string {
  const q = typeof key === "string" && keyOk(p.phone, key) ? `key=${encodeURIComponent(key)}`
    : ct && p.contract_token === ct ? `ct=${encodeURIComponent(ct)}`
    : baseSecret() ? `key=${viewKey(p.phone)}` : "";
  return q ? `${siteUrl()}/api/payments/${p.id}/receipt?${q}` : "";
}
router.get("/payments/:id/receipt", async (req, res) => {
  try {
    await ensureTables(); await ensureContractTables();
    const id = Number(req.params.id) || 0;
    const r = await pool.query(
      `SELECT id, phone, name, email, item, pay_type, amount, agreed_total, method, status, receipt, bank_ref, note, contract_token, stage, paid_at, created_at FROM payments WHERE id=$1`, [id]);
    const p = r.rows[0];
    const ct = typeof req.query.ct === "string" ? req.query.ct : "";
    const allowed = !!p && (isAdmin(req) || keyOk(p.phone, req.query.key) || (!!ct && ct.length >= 8 && p.contract_token === ct));
    if (!p || p.status !== "paid" || !allowed) { res.status(404).type("text/plain").send("Receipt not found."); return; }
    res.type("html").send(receiptHtml(await receiptDataOf(p), false, receiptShareLink(p, req.query.key, ct)));
  } catch { res.status(500).type("text/plain").send("Could not load the receipt."); }
});

/* ------------------------------------------------------------- M-Pesa */
const mpesaReady = () => !!baseSecret() && !!(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_SHORTCODE && process.env.MPESA_PASSKEY);
const mpesaBase = () => process.env.MPESA_BASE_URL || (process.env.MPESA_ENV === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");
const callbackSecret = () => crypto.createHmac("sha256", baseSecret()).update("mpesa-callback").digest("hex").slice(0, 24);

let tokenCache: { t: string; exp: number } | null = null;
async function mpesaToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now()) return tokenCache.t;
  const basic = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString("base64");
  const r = await fetch(`${mpesaBase()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${basic}` } });
  const d: any = await r.json().catch(() => ({}));
  if (!d.access_token) throw new Error("M-Pesa sign-in failed");
  tokenCache = { t: d.access_token, exp: Date.now() + 50 * 60_000 };
  return d.access_token;
}
const stamp = () => new Date(Date.now() + 3 * 3600_000).toISOString().replace(/\D/g, "").slice(0, 14);

/**
 * Ask Safaricom what happened to a prompt that is still "pending" (their reply to us can get lost).
 * Success -> paid, cancelled/failed -> closed, still being processed -> left alone (closed after 15 minutes with no answer).
 */
const lastAsked = new Map<number, number>();
async function reconcile(id: number) {
  if (!id || !mpesaReady()) return;
  const now = Date.now();
  if ((lastAsked.get(id) ?? 0) > now - 15_000) return;
  lastAsked.set(id, now);
  if (lastAsked.size > 2000) lastAsked.clear();
  const r = await pool.query("SELECT checkout_id, status, method, note, EXTRACT(EPOCH FROM (NOW() - created_at))::int AS age FROM payments WHERE id=$1", [id]);
  const p = r.rows[0];
  if (!p || p.status !== "pending" || p.method !== "mpesa" || !p.checkout_id || p.age < 40) return;
  if (String(p.note).startsWith("Amount received differs")) return; // money arrived but not the amount asked: a person must check it
  const ts = stamp();
  const shortcode = process.env.MPESA_SHORTCODE!;
  let d: any = {};
  try {
    const token = await mpesaToken();
    const q = await fetch(`${mpesaBase()}/mpesa/stkpushquery/v1/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ BusinessShortCode: shortcode, Password: Buffer.from(shortcode + process.env.MPESA_PASSKEY + ts).toString("base64"), Timestamp: ts, CheckoutRequestID: p.checkout_id }),
    });
    d = await q.json().catch(() => ({}));
  } catch { return; }
  if (d.ResultCode === undefined || d.ResultCode === null || d.ResultCode === "") {
    // "still being processed" (or no answer): close it only after a long silence
    if (p.age > 900) await pool.query("UPDATE payments SET status='failed', note='No reply from M-Pesa' WHERE id=$1 AND status='pending'", [id]);
    return;
  }
  const code = Number(d.ResultCode);
  if (code === 0) {
    const up = await pool.query("UPDATE payments SET status='paid', note='Confirmed by a check with Safaricom' WHERE id=$1 AND status='pending' RETURNING id", [id]);
    if (up.rows[0]) await notifyPaid(id);
  } else {
    await pool.query("UPDATE payments SET status=$2, note=$3 WHERE id=$1 AND status='pending'", [id, code === 1032 ? "cancelled" : "failed", String(d.ResultDesc ?? "").slice(0, 200)]);
  }
}

router.post("/payments/mpesa", async (req: Request, res: Response) => {
  try {
    await ensureTables();
    if (!mpesaReady()) { res.status(503).json({ error: "M-Pesa is not switched on yet. Please use bank transfer or call us." }); return; }
    const ctr = await applyContract(req.body ?? {});
    if (typeof ctr === "string") { res.status(400).json({ error: ctr }); return; }
    const p = parseBody(ctr ? ctr.body : req.body ?? {});
    if (typeof p === "string") { res.status(400).json({ error: p }); return; }
    if (!isKenyan(p.phone)) { res.status(400).json({ error: "M-Pesa works with Kenyan Safaricom numbers only. Please choose bank, cash or cheque." }); return; }
    if (limited(`ip:${req.ip ?? "x"}`, 20) || limited(`phone:${p.phone}`, 4)) { res.status(429).json({ error: SLOW_DOWN }); return; }
    const ins = await pool.query(
      `INSERT INTO payments (phone,name,email,kind,item,pay_type,amount,agreed_total,method,status,contract_token,stage) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mpesa','pending',$9,$10) RETURNING id`,
      [p.phone, p.name, p.email, p.kind, p.item, p.payType, p.amount, p.agreedTotal, ctr?.token ?? null, ctr?.stage ?? null],
    ).catch((e) => { if (isDupStage(e)) return null; throw e; });
    if (!ins) { res.status(409).json({ error: "A payment for this step is already in progress or paid." }); return; }
    const id = ins.rows[0].id as number;
    const ts = stamp();
    const shortcode = process.env.MPESA_SHORTCODE!;
    const till = process.env.MPESA_TYPE === "till";
    const base = (process.env.PUBLIC_API_URL ?? process.env.RENDER_EXTERNAL_URL ?? "").replace(/\/$/, "");
    try {
      const token = await mpesaToken();
      const r = await fetch(`${mpesaBase()}/mpesa/stkpush/v1/processrequest`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: Buffer.from(shortcode + process.env.MPESA_PASSKEY + ts).toString("base64"),
          Timestamp: ts,
          TransactionType: till ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
          Amount: p.amount,
          PartyA: p.phone,
          PartyB: process.env.MPESA_TILL ?? shortcode,
          PhoneNumber: p.phone,
          CallBackURL: `${base}/api/payments/mpesa/callback/${callbackSecret()}`,
          AccountReference: `DIGHAZ-${id}`.slice(0, 12),
          TransactionDesc: p.item.slice(0, 20),
        }),
      });
      const d: any = await r.json().catch(() => ({}));
      if (d.ResponseCode !== "0") throw new Error(d.errorMessage || d.ResponseDescription || "M-Pesa refused the request");
      await pool.query("UPDATE payments SET checkout_id=$1 WHERE id=$2", [d.CheckoutRequestID, id]);
      res.json({ id, status: "pending", key: viewKey(p.phone) });
    } catch (e) {
      await pool.query("UPDATE payments SET status='failed', note=$1 WHERE id=$2", [String((e as Error).message).slice(0, 200), id]);
      res.status(502).json({ error: "Could not send the M-Pesa prompt. Check the number and try again." });
    }
  } catch { res.status(500).json({ error: "Something went wrong. Please try again." }); }
});

// Safaricom calls this when the client enters (or cancels) the PIN.
router.post("/payments/mpesa/callback/:secret", async (req: Request, res: Response) => {
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  try {
    if (req.params.secret !== callbackSecret()) return;
    await ensureTables();
    const cb = req.body?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) return;
    if (Number(cb.ResultCode) === 0) {
      const items: any[] = cb.CallbackMetadata?.Item ?? [];
      const get = (n: string) => items.find((i) => i.Name === n)?.Value;
      const receipt = String(get("MpesaReceiptNumber") ?? "");
      const paidAmt = Number(get("Amount"));
      // Only mark paid when the money received matches what was asked for
      const up = await pool.query(
        `UPDATE payments SET status = CASE WHEN $3::numeric = amount THEN 'paid' ELSE 'pending' END, receipt=$2,
           note = CASE WHEN $3::numeric = amount THEN '' ELSE 'Amount received differs: check M-Pesa' END
         WHERE checkout_id=$1 AND status='pending' RETURNING id, status`,
        [cb.CheckoutRequestID, receipt, Number.isFinite(paidAmt) ? paidAmt : -1],
      );
      // if our own check with Safaricom already marked it paid, this reply only adds the receipt number
      if (receipt) await pool.query("UPDATE payments SET receipt=$2 WHERE checkout_id=$1 AND status='paid' AND receipt=''", [cb.CheckoutRequestID, receipt]);
      const done = up.rows.find((x) => x.status === "paid");
      if (done) await notifyPaid(done.id);
    } else {
      const cancelled = Number(cb.ResultCode) === 1032;
      await pool.query("UPDATE payments SET status=$2, note=$3 WHERE checkout_id=$1 AND status='pending'", [
        cb.CheckoutRequestID, cancelled ? "cancelled" : "failed", String(cb.ResultDesc ?? "").slice(0, 200),
      ]);
    }
  } catch { /* nothing to send back */ }
});

/* ------------------------------------------------------------- bank transfer */
router.post("/payments/bank", async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const ctr = await applyContract(req.body ?? {});
    if (typeof ctr === "string") { res.status(400).json({ error: ctr }); return; }
    const p = parseBody(ctr ? ctr.body : req.body ?? {});
    if (typeof p === "string") { res.status(400).json({ error: p }); return; }
    if (limited(`bank-ip:${req.ip ?? "x"}`, 20) || limited(`bank-phone:${p.phone}`, 6)) { res.status(429).json({ error: SLOW_DOWN }); return; }
    const bankRef = str(req.body?.bankRef, 600);
    const img = typeof req.body?.receiptImg === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(req.body.receiptImg) && req.body.receiptImg.length < 1_000_000 ? req.body.receiptImg : null;
    if (bankRef.length < 3 && !img) { res.status(400).json({ error: "Upload your payment receipt, or paste the bank message." }); return; }
    const ins = await pool.query(
      `INSERT INTO payments (phone,name,email,kind,item,pay_type,amount,agreed_total,method,status,bank_ref,receipt_img,contract_token,stage) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'bank','pending',$9,$10,$11,$12) RETURNING id`,
      [p.phone, p.name, p.email, p.kind, p.item, p.payType, p.amount, p.agreedTotal, bankRef, img, ctr?.token ?? null, ctr?.stage ?? null],
    ).catch((e) => { if (isDupStage(e)) return null; throw e; });
    if (!ins) { res.status(409).json({ error: "A payment for this step is already in progress or paid." }); return; }
    smsOwner(`Bank payment proof: ${kes(p.amount)} for ${p.item} from ${p.phone}. Please confirm it in the admin.`);
    await notify(p.phone, "Receipt received", `We received your ${kes(p.amount)} bank payment proof for ${p.item}. We are confirming it now.`);
    res.json({ id: ins.rows[0].id, status: "pending", key: baseSecret() ? viewKey(p.phone) : undefined });
  } catch { res.status(500).json({ error: "Something went wrong. Please try again." }); }
});

// Cash or cheque: the client tells us how and when they paid; the payment waits for the owner to confirm it, then the receipt goes out.
router.post("/payments/offline", async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const how = req.body?.method === "cheque" ? "cheque" : req.body?.method === "cash" ? "cash" : "";
    if (!how) { res.status(400).json({ error: "Choose cash or cheque." }); return; }
    const ctr = await applyContract(req.body ?? {});
    if (typeof ctr === "string") { res.status(400).json({ error: ctr }); return; }
    const p = parseBody(ctr ? ctr.body : req.body ?? {});
    if (typeof p === "string") { res.status(400).json({ error: p }); return; }
    if (limited(`off-ip:${req.ip ?? "x"}`, 20) || limited(`off-phone:${p.phone}`, 6)) { res.status(429).json({ error: SLOW_DOWN }); return; }
    let details = str(req.body?.details, 300);
    if (how === "cheque" && details.length < 3) { res.status(400).json({ error: "Enter the cheque number and the bank." }); return; }
    // when it was paid (not in the future, not older than a year), the cheque's own date, and a photo of the cheque or the signed cash receipt
    const when = req.body?.paidAt ? new Date(String(req.body.paidAt)) : new Date();
    if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 10 * 60_000 || when.getTime() < Date.now() - 366 * 86_400_000) { res.status(400).json({ error: "Check the date and time you paid." }); return; }
    const chequeDate = how === "cheque" ? str(req.body?.chequeDate, 12).replace(/[^\d-]/g, "") : "";
    if (chequeDate) details = `${details} (cheque dated ${chequeDate})`.trim();
    const img = typeof req.body?.receiptImg === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(req.body.receiptImg) && req.body.receiptImg.length < 1_500_000 ? req.body.receiptImg : null;
    if (how === "cheque" && !img) { res.status(400).json({ error: "Scan the cheque first." }); return; }
    const ins = await pool.query(
      `INSERT INTO payments (phone,name,email,kind,item,pay_type,amount,agreed_total,method,status,bank_ref,note,contract_token,stage,paid_at,receipt_img) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$10,$11,$12,$13,$14) RETURNING id`,
      [p.phone, p.name, p.email, p.kind, p.item, p.payType, p.amount, p.agreedTotal, how, details, ctr?.token ?? null, ctr?.stage ?? null, when.toISOString(), img],
    ).catch((e) => { if (isDupStage(e)) return null; throw e; });
    if (!ins) { res.status(409).json({ error: "A payment for this step is already in progress or paid." }); return; }
    smsOwner(`${how === "cheque" ? "Cheque" : "Cash"} payment to confirm: ${kes(p.amount)} for ${p.item} from ${p.name} (${p.phone}). ${details}`);
    await notify(p.phone, "Payment noted", `We noted your ${kes(p.amount)} ${how} payment for ${p.item}. We will confirm it once we receive it, and then send your receipt.`);
    res.json({ id: ins.rows[0].id, status: "pending", key: baseSecret() ? viewKey(p.phone) : undefined });
  } catch { res.status(500).json({ error: "Something went wrong. Please try again." }); }
});

/* ------------------------------------------------------------- admin */
/* ------------------------------------------------------------- job progress */
// Job types and their steps live in ../lib/jobSteps.ts (one place to edit). A job is saved by step NAME.
// Jobs saved before step names existed still carry a stage number; resolveJob() maps it, so nothing stored is lost.

/** Only https links are accepted. Returns "" for empty, null for a bad link. */
const cleanUrl = (v: unknown): string | null => {
  const s = str(v, 500);
  if (!s) return "";
  try { const u = new URL(s); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
};
/** A photo or short video from the site: must be a file in our own Cloudinary account. Returns null when it is not. */
function cleanMedia(v: unknown): { url: string; type: "image" | "video" } | null {
  const s = str(v, 600);
  const cloud = (process.env.CLOUDINARY_CLOUD_NAME ?? "").trim();
  const m = /^https:\/\/res\.cloudinary\.com\/([A-Za-z0-9_-]+)\/(image|video)\/upload\/[A-Za-z0-9_\-./,%:]+$/.exec(s);
  if (!m || (cloud && m[1] !== cloud)) return null;
  return { url: s, type: m[2] as "image" | "video" };
}
const fill = (t: string, item: string) => t.replace(/\{item\}/g, item).replace(/\{company\}/g, process.env.COMPANY_NAME || "Dighaz Engineering Limited");
const phraseFor = (step: string, item: string) => fill(PHRASES[step] ?? `Your {item} is now at: ${step}.`, item);
const teamPhoneOf = (v: unknown): string | null => { const t = str(v, 30); return !t ? "" : normPhone(t); };

const JOB_COLS = `COALESCE(MAX(j.stage),0) AS stage, MAX(j.step) AS step, COALESCE(MAX(j.note),'') AS note, MAX(j.updated_at) AS "updatedAt",
              MAX(j.job_type) AS job_type, COUNT(j.phone) > 0 AS has_row, COALESCE(MAX(j.live_url),'') AS live_url,
              COALESCE(bool_or(j.live_now), FALSE) AS live_now, COALESCE(MAX(j.recording_url),'') AS recording_url,
              COALESCE(MAX(j.eta),'') AS eta, COALESCE(MAX(j.team_name),'') AS team_name, COALESCE(MAX(j.team_phone),'') AS team_phone, MAX(p.kind) AS kind`;

const typeInfo = (t: (typeof JOB_TYPES)[number]) => ({ id: t.id, label: t.label, steps: t.steps, important: t.important });
const resolveRow = (x: any) => resolveJob({ job_type: x.job_type, step: x.step, stage: x.stage, hasRow: !!x.has_row }, x.item, x.kind ?? "service");
const eventOut = (e: any) => ({
  id: e.id, step: e.step, note: e.note, mediaUrl: e.media_url, mediaType: e.media_type, eta: e.eta,
  teamName: e.team_name, teamPhone: e.team_phone, important: e.important, by: e.set_by, at: e.created_at,
});

// What the client sees: every job they have paid for, with its timeline. Needs the payer's view key.
// The live link is only sent here, and only while "Live now" is on.
router.get("/payments/jobs", async (req, res) => {
  try {
    await ensureTables();
    const ip = req.ip ?? "x";
    if (limited(`jobs-ip:${ip}`, 400)) { res.status(429).json([]); return; }
    const phone = normPhone(req.query.phone);
    if (!phone || !keyOk(phone, req.query.key)) {
      if (limited(`jobs-bad:${ip}`, 200)) { res.status(429).json([]); return; }
      res.json([]); return;
    }
    const r = await pool.query(
      `SELECT p.item, MAX(p.agreed_total) FILTER (WHERE p.id = (SELECT MAX(id) FROM payments WHERE phone=p.phone AND item=p.item)) AS agreed,
              SUM(p.amount) FILTER (WHERE p.status='paid') AS paid, ${JOB_COLS}
         FROM payments p LEFT JOIN job_status j ON j.phone=p.phone AND j.item=p.item
        WHERE p.phone=$1 GROUP BY p.item HAVING SUM(p.amount) FILTER (WHERE p.status='paid') > 0 ORDER BY MAX(p.id) DESC LIMIT 10`, [phone]);
    const ev = await pool.query("SELECT * FROM job_events WHERE phone=$1 ORDER BY id DESC LIMIT 400", [phone]);
    const byItem = new Map<string, any[]>();
    for (const e of ev.rows) { const l = byItem.get(e.item) ?? []; if (l.length < 60) l.push(eventOut(e)); byItem.set(e.item, l); }
    res.json(r.rows.map((x) => {
      const job = resolveRow(x), steps = job.def.steps;
      const live = x.live_now && x.live_url;
      const agreed = Number(x.agreed ?? 0), paid = Number(x.paid ?? 0);
      return {
        item: x.item, kind: x.kind ?? "service", type: job.type, typeLabel: job.def.label, steps, index: job.index, step: job.step,
        stages: steps, stage: job.index, // older field names, kept so any cached page keeps working
        status: jobStatus(job.index, steps.length), note: x.note, eta: x.eta, updatedAt: x.updatedAt,
        team: x.team_phone ? { name: x.team_name, phone: x.team_phone } : null,
        agreedTotal: agreed, paid, balance: Math.max(0, agreed - paid),
        liveUrl: live ? x.live_url : "", recordingUrl: !live && x.recording_url ? x.recording_url : "",
        events: byItem.get(x.item) ?? [],
      };
    }));
  } catch { res.json([]); }
});

router.get("/payments-admin/jobs", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTables();
    const r = await pool.query(
      `SELECT p.phone, p.item, MAX(p.name) AS name, MAX(p.agreed_total) FILTER (WHERE p.id = (SELECT MAX(id) FROM payments WHERE phone=p.phone AND item=p.item)) AS agreed,
              SUM(p.amount) FILTER (WHERE p.status='paid') AS paid, ${JOB_COLS}
         FROM payments p LEFT JOIN job_status j ON j.phone=p.phone AND j.item=p.item
        GROUP BY p.phone, p.item HAVING SUM(p.amount) FILTER (WHERE p.status='paid') > 0 ORDER BY MAX(p.id) DESC LIMIT 300`);
    const counts = await pool.query("SELECT phone, item, COUNT(*)::int AS n FROM job_events GROUP BY phone, item");
    const n = new Map(counts.rows.map((c) => [`${c.phone}|${c.item}`, c.n as number]));
    res.json({
      types: JOB_TYPES.map(typeInfo),
      jobs: r.rows.map((x) => {
        const job = resolveRow(x);
        return {
          phone: x.phone, item: x.item, name: x.name, type: job.type, steps: job.def.steps, index: job.index, step: job.step,
          status: jobStatus(job.index, job.def.steps.length), note: x.note, eta: x.eta, updatedAt: x.updatedAt,
          teamName: x.team_name, teamPhone: x.team_phone, agreedTotal: Number(x.agreed ?? 0), paid: Number(x.paid ?? 0),
          liveUrl: x.live_url, liveNow: !!x.live_now, recordingUrl: x.recording_url, updates: n.get(`${x.phone}|${x.item}`) ?? 0,
        };
      }),
    });
  } catch { res.json({ types: JOB_TYPES.map(typeInfo), jobs: [] }); }
});

// The history of one job, newest first.
router.get("/payments-admin/job-events", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTables();
    const phone = normPhone(req.query.phone), item = str(req.query.item, 160);
    if (!phone || !item) { res.json([]); return; }
    const r = await pool.query("SELECT * FROM job_events WHERE phone=$1 AND item=$2 ORDER BY id DESC LIMIT 100", [phone, item]);
    res.json(r.rows.map(eventOut));
  } catch { res.json([]); }
});

router.delete("/payments-admin/job-events/:id", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try { await ensureTables(); await pool.query("DELETE FROM job_events WHERE id=$1", [Number(req.params.id) || 0]); res.json({ ok: true }); }
  catch { res.status(500).json({ error: "Could not delete." }); }
});

// Signed upload for a photo or short video from the site (Cloudinary, straight from the admin's browser). Same keys as the other uploads.
router.post("/payments-admin/job-upload-sign", (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  const name = (process.env.CLOUDINARY_CLOUD_NAME ?? "").trim(), key = (process.env.CLOUDINARY_API_KEY ?? "").trim(), secret = (process.env.CLOUDINARY_API_SECRET ?? "").trim();
  if (!name || !key || !secret) { res.status(503).json({ error: "Photo storage is not set up yet (add the three Cloudinary keys on Render)." }); return; }
  const timestamp = Math.floor(Date.now() / 1000), folder = "job-updates";
  const signature = crypto.createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest("hex");
  res.json({ cloudName: name, apiKey: key, timestamp, signature, folder });
});

// Admin updates a job. Send only what changed: step (a name from the job's type), or next:true for the next step, plus any of
// note, eta, teamName, teamPhone, mediaUrl, jobType, liveUrl, liveNow, recordingUrl. Every update is saved in job_events.
router.post("/payments-admin/job", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTables();
    const b = req.body ?? {};
    const phone = normPhone(b.phone), item = str(b.item, 160);
    if (!phone || !item) { res.status(400).json({ error: "Missing job details." }); return; }
    const pay = await pool.query("SELECT kind FROM payments WHERE phone=$1 AND item=$2 ORDER BY id DESC LIMIT 1", [phone, item]);
    if (!pay.rows[0]) { res.status(404).json({ error: "Job not found." }); return; }
    const prevRow = (await pool.query("SELECT stage, step, note, job_type, live_url, live_now, recording_url, eta, team_name, team_phone FROM job_status WHERE phone=$1 AND item=$2", [phone, item])).rows[0];
    const prev = resolveJob({ job_type: prevRow?.job_type, step: prevRow?.step, stage: prevRow?.stage, hasRow: !!prevRow }, item, pay.rows[0].kind);

    const type = b.jobType === undefined ? prev.type : JOB_TYPE_IDS.includes(String(b.jobType)) ? String(b.jobType) : "";
    if (!type) { res.status(400).json({ error: "Unknown job type." }); return; }
    const def = typeDef(type);
    // where the job is now, seen from the (possibly new) type: same step name if it exists there, else the same position
    // Changing the type of a job that is part way: keep the same position, but never land on the final step by itself.
    const mapped = (): string => {
      if (prev.index >= prev.def.steps.length - 1) return def.steps[def.steps.length - 1]!;
      const i = Math.round((prev.index / (prev.def.steps.length - 1)) * (def.steps.length - 1));
      return def.steps[Math.min(i, def.steps.length - 2)]!;
    };
    const before = prevRow ? (def.steps.includes(prev.step) ? prev.step : mapped()) : def.steps[0]!;

    let step = before;
    if (typeof b.step === "string" && b.step) {
      if (!def.steps.includes(b.step)) { res.status(400).json({ error: "That step does not exist for this job type." }); return; }
      step = b.step;
    } else if (b.next === true) {
      const i = def.steps.indexOf(before) + 1;
      if (i >= def.steps.length) { res.status(400).json({ error: "This job is already at its last step." }); return; }
      step = def.steps[i]!;
    } else if (b.stage !== undefined) {
      const i = Math.round(Number(b.stage));
      if (!(i >= 0 && i < def.steps.length)) { res.status(400).json({ error: "That step does not exist for this job type." }); return; }
      step = def.steps[i]!;
    }
    const stepChanged = step !== before;

    const noteIn = b.note === undefined ? null : str(b.note, 300);
    const etaIn = b.eta === undefined ? null : str(b.eta, 80);
    const note = noteIn ?? (stepChanged ? "" : String(prevRow?.note ?? ""));
    const eta = etaIn ?? (stepChanged ? "" : String(prevRow?.eta ?? ""));
    const teamName = b.teamName === undefined ? String(prevRow?.team_name ?? "") : str(b.teamName, 60);
    const tp = b.teamPhone === undefined ? String(prevRow?.team_phone ?? "") : teamPhoneOf(b.teamPhone);
    if (tp === null) { res.status(400).json({ error: "The site team phone number looks wrong." }); return; }
    let media: { url: string; type: "image" | "video" } | null = null;
    if (b.mediaUrl) { media = cleanMedia(b.mediaUrl); if (!media) { res.status(400).json({ error: "That photo or video is not valid. Upload it again." }); return; } }

    const liveUrl = b.liveUrl === undefined ? String(prevRow?.live_url ?? "") : cleanUrl(b.liveUrl);
    const recordingUrl = b.recordingUrl === undefined ? String(prevRow?.recording_url ?? "") : cleanUrl(b.recordingUrl);
    if (liveUrl === null || recordingUrl === null) { res.status(400).json({ error: "Links must start with https://" }); return; }
    const liveNow = b.liveNow === undefined ? !!prevRow?.live_now : b.liveNow === true || b.liveNow === "true";
    if (liveNow && !liveUrl) { res.status(400).json({ error: "Add the live stream link first." }); return; }

    await pool.query(
      `INSERT INTO job_status (phone,item,stage,step,note,job_type,live_url,live_now,recording_url,eta,team_name,team_phone,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (phone,item) DO UPDATE SET stage=$3, step=$4, note=$5, job_type=$6, live_url=$7, live_now=$8, recording_url=$9, eta=$10, team_name=$11, team_phone=$12, updated_at=NOW()`,
      [phone, item, def.steps.indexOf(step), step, note, type, liveUrl, liveNow, recordingUrl, eta, teamName, tp]);

    const co = process.env.COMPANY_NAME || "Dighaz Engineering Limited";
    const important = def.important.includes(step);
    const liveFlipped = liveNow !== !!prevRow?.live_now;
    const hasContent = !!(noteIn || media || etaIn);
    const log = (evStep: string, evNote: string, m: typeof media, imp: boolean) =>
      pool.query(
        `INSERT INTO job_events (phone,item,step,note,media_url,media_type,eta,team_name,team_phone,important,set_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Admin')`,
        [phone, item, evStep, evNote, m?.url ?? "", m?.type ?? "", eta, teamName, tp, imp]);
    if (stepChanged || hasContent) await log(step, note, media, important && stepChanged);
    if (liveFlipped) await log(step, liveNow ? "Live stream started" : "Live stream ended", null, false);

    // The client is told in the bell, and by SMS (kept short). A failed SMS never stops the update.
    if (stepChanged) {
      const team = important && teamName && tp ? ` Site team: ${teamName} +${tp}.` : important && tp ? ` Site team: +${tp}.` : "";
      const msg = `${phraseFor(step, item)}${eta ? ` ${eta}.` : ""}${note ? ` ${note}` : ""}`;
      await notify(phone, `Job update: ${step}`, msg, "/my-jobs", important);
      void sms(phone, `${co}: ${msg}${team}`).catch(() => {});
    } else if (hasContent) {
      const body = [eta, note].filter(Boolean).join(". ") || (media?.type === "video" ? "We added a new video from your site." : "We added a new photo from your site.");
      await notify(phone, `Update: ${step}`, body, "/my-jobs");
    }
    if (liveNow && !prevRow?.live_now) {
      await notify(phone, "Your job is live now", `${item} is live now. Tap here and press Watch live.`, "/my-jobs", true);
      void sms(phone, `${co}: your job (${item}) is live now. Open our website, tap the bell, then Watch live.`).catch(() => {});
    }
    if (recordingUrl && recordingUrl !== (prevRow?.recording_url ?? "")) {
      await notify(phone, "Recording ready", `The recording for ${item} is ready. Tap here and press Watch recording.`, "/my-jobs");
    }
    res.json({ ok: true, type, step, index: def.steps.indexOf(step), liveNow });
  } catch { res.status(500).json({ error: "Could not save." }); }
});

// Excel file of confirmed payments for the books. Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD (East Africa time).
router.get("/payments-admin/export.xlsx", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTables();
    const ok = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const from = ok(req.query.from), to = ok(req.query.to);
    const r = await pool.query(
      `SELECT id, phone, name, item, pay_type, amount, agreed_total, method, receipt, bank_ref, created_at FROM payments
        WHERE status='paid' AND ($1::date IS NULL OR (created_at AT TIME ZONE 'Africa/Nairobi')::date >= $1::date)
          AND ($2::date IS NULL OR (created_at AT TIME ZONE 'Africa/Nairobi')::date <= $2::date) ORDER BY created_at ASC, id ASC`, [from, to]);
    const when = (d: Date) => new Date(d).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" });
    const rows = r.rows.map((x) => [
      `RCP-${String(x.id).padStart(5, "0")}`, when(x.created_at), x.name, x.phone, x.item, NAMES[x.pay_type] ?? x.pay_type,
      x.method === "mpesa" ? "M-Pesa" : "Bank transfer", x.method === "mpesa" ? x.receipt : String(x.bank_ref ?? "").slice(0, 80),
      Number(x.amount), Number(x.agreed_total),
    ]);
    const buf = buildXlsx("Payments", ["Receipt no", "Date", "Client", "Phone", "Service / product", "Payment type", "Method", "M-Pesa code / bank ref", "Amount (KSh)", "Agreed price (KSh)"], rows, [8], [12, 20, 22, 15, 30, 16, 14, 26, 14, 18]);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="payments${from ? `-from-${from}` : ""}${to ? `-to-${to}` : ""}.xlsx"`);
    res.send(buf);
  } catch { res.status(500).json({ error: "Could not build the file." }); }
});

router.get("/payments-admin/list", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTables();
    const stale = await pool.query("SELECT id FROM payments WHERE method='mpesa' AND status='pending' AND checkout_id IS NOT NULL AND created_at < NOW() - INTERVAL '1 minute' ORDER BY id DESC LIMIT 8");
    await Promise.allSettled(stale.rows.map((x) => reconcile(x.id)));
    const r = await pool.query(
      `SELECT id, phone, name, email, kind, item, pay_type AS "payType", amount, agreed_total AS "agreedTotal", method, status, receipt, bank_ref AS "bankRef", paid_at AS "paidAt", (receipt_img IS NOT NULL) AS "hasImg", note, created_at AS "createdAt" FROM payments ORDER BY created_at DESC LIMIT 300`,
    );
    const rows = r.rows.map((x) => ({ ...x, amount: Number(x.amount), agreedTotal: Number(x.agreedTotal) }));
    // running balance per job (phone + item)
    const paid = new Map<string, number>();
    for (const x of rows) if (x.status === "paid") paid.set(`${x.phone}|${x.item}`, (paid.get(`${x.phone}|${x.item}`) ?? 0) + x.amount);
    res.json(rows.map((x) => ({ ...x, paidSoFar: paid.get(`${x.phone}|${x.item}`) ?? 0 })));
  } catch { res.status(500).json({ error: "Could not load payments." }); }
});

router.get("/payments-admin/:id/receipt", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTables();
    const r = await pool.query("SELECT receipt_img FROM payments WHERE id=$1", [Number(req.params.id) || 0]);
    res.json({ img: r.rows[0]?.receipt_img ?? null });
  } catch { res.status(500).json({ error: "Could not load." }); }
});

/** The shareable public link of a paid receipt, for the admin to copy and send to the client. */
router.get("/payments-admin/:id/link", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTables();
    const p = (await pool.query("SELECT id, phone, contract_token, status FROM payments WHERE id=$1", [Number(req.params.id) || 0])).rows[0];
    if (!p || p.status !== "paid") { res.status(404).json({ error: "Receipt not found." }); return; }
    const url = receiptShareLink(p, "", "");
    if (!url) { res.status(503).json({ error: "Receipt links are not switched on yet." }); return; }
    res.json({ url });
  } catch { res.status(500).json({ error: "Could not make the link." }); }
});

/** Admin records a payment that did not come through the website (cash, a cheque, a bank or M-Pesa payment made another way) and the client gets a receipt.
 *  On a contract the amount is always the step's amount (set by the server), so the contract stays exact. */
router.post("/payments-admin/record", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTables(); await ensureContractTables();
    const b = (req.body ?? {}) as Record<string, unknown>;
    const method = ["cash", "cheque", "bank", "mpesa"].includes(String(b.method)) ? String(b.method) : "cash";
    const reference = str(b.reference, 80), note = str(b.note, 200);
    const token = str(b.contractToken, 40);
    let row: { phone: string; name: string; email: string; item: string; payType: string; amount: number; agreedTotal: number; token: string | null; stage: string | null };
    if (token) {
      const c = (await pool.query("SELECT id, name, phone, item, agreed_total, stages, client_email FROM contracts WHERE token=$1", [token])).rows[0];
      if (!c) { res.status(404).json({ error: "Contract not found." }); return; }
      const stages = c.stages as { id: string; amount: number }[];
      const rows = (await pool.query("SELECT stage, status FROM payments WHERE contract_token=$1 AND status IN ('pending','paid')", [token])).rows;
      const has = (id: string, st: string) => rows.some((x) => x.stage === id && x.status === st);
      if (rows.some((x) => x.stage === "all")) { res.status(409).json({ error: "This contract already has a payment of the full balance." }); return; }
      let sid = String(b.stage ?? ""), amount = 0, payType = "";
      if (sid === "all") {   // the whole balance in one payment: it covers every step that is still unpaid
        if (rows.some((x) => x.status === "pending")) { res.status(409).json({ error: "A payment is waiting to be confirmed. Confirm it in the payments list first." }); return; }
        const unpaid = stages.filter((x) => !has(x.id, "paid"));
        if (unpaid.length === 0) { res.status(409).json({ error: "Nothing is left to pay on this contract." }); return; }
        if (unpaid.length === 1) sid = unpaid[0].id;
        else { amount = unpaid.reduce((t, x) => t + x.amount, 0); payType = unpaid.length === stages.length ? "full" : "balance"; }
      }
      if (sid !== "all") {
        const idx = stages.findIndex((x) => x.id === sid);
        if (idx < 0) { res.status(400).json({ error: "Choose which payment step was paid." }); return; }
        if (has(stages[idx].id, "paid")) { res.status(409).json({ error: "This step is already paid." }); return; }
        if (has(stages[idx].id, "pending")) { res.status(409).json({ error: "A payment for this step is waiting to be confirmed. Confirm it in the payments list instead." }); return; }
        for (let i = 0; i < idx; i++) if (!has(stages[i].id, "paid")) { res.status(409).json({ error: "The earlier step is not paid yet. Record that one first." }); return; }
        amount = stages[idx].amount;
        payType = stages.length === 1 ? "full" : idx === stages.length - 1 ? "balance" : "deposit";
      }
      row = { phone: c.phone, name: c.name, email: c.client_email ?? "", item: contractItem({ id: c.id, item: c.item }), payType, amount, agreedTotal: Number(c.agreed_total), token, stage: sid };
    } else {
      const p = parseBody({ ...b, kind: "service", agreedTotal: b.agreedTotal || b.amount });
      if (typeof p === "string") { res.status(400).json({ error: p.replace("Enter your name.", "Enter the client's name.").replace("Enter a valid Safaricom phone number, like 0712 345 678.", "Enter the client's phone number, like 0712 345 678.") }); return; }
      row = { phone: p.phone, name: p.name, email: p.email, item: p.item, payType: p.payType, amount: p.amount, agreedTotal: p.agreedTotal, token: null, stage: null };
    }
    const ins = await pool.query(
      `INSERT INTO payments (phone,name,email,kind,item,pay_type,amount,agreed_total,method,status,receipt,bank_ref,note,contract_token,stage) VALUES ($1,$2,$3,'service',$4,$5,$6,$7,$8,'paid',$9,$10,$11,$12,$13) RETURNING id`,
      [row.phone, row.name, row.email, row.item, row.payType, row.amount, row.agreedTotal, method, method === "mpesa" ? reference : "", method === "mpesa" ? "" : reference, note || `Recorded by admin (${method})`, row.token, row.stage],
    ).catch((e) => { if (isDupStage(e)) return null; throw e; });
    if (!ins) { res.status(409).json({ error: "This step was just paid or is being paid." }); return; }
    const id = ins.rows[0].id as number;
    await notifyPaid(id);
    res.json({ ok: true, id, receiptUrl: receiptLink({ id, phone: row.phone, contract_token: row.token }) });
  } catch { res.status(500).json({ error: "Could not record the payment." }); }
});

router.post("/payments-admin/:id/:action", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  const action = req.params.action;
  if (action !== "confirm" && action !== "reject") { res.status(400).json({ error: "Bad action" }); return; }
  try {
    await ensureTables();
    const r = await pool.query(
      "UPDATE payments SET status=$2 WHERE id=$1 AND method IN ('bank','cash','cheque') AND status IN ('pending','rejected','paid') RETURNING id",
      [Number(req.params.id) || 0, action === "confirm" ? "paid" : "rejected"],
    );
    if (!r.rows[0]) { res.status(404).json({ error: "Only bank, cash and cheque payments can be confirmed here." }); return; }
    if (action === "confirm") await notifyPaid(r.rows[0].id);
    else {
      const q = await pool.query("SELECT phone, item FROM payments WHERE id=$1", [r.rows[0].id]);
      void sms(q.rows[0].phone, `${process.env.COMPANY_NAME || "Dighaz Engineering Limited"}: we could not confirm your payment for ${q.rows[0].item}. Please call us on ${process.env.COMPANY_CONTACT || "+254 719 117 660"}.`);
      await notify(q.rows[0].phone, "Payment not confirmed", `We could not confirm your payment for ${q.rows[0].item}. Please call us on +254 719 117 660.`);
    }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not update." }); }
});

export default router;
