import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { pool } from "@workspace/db";

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
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS quote TEXT NOT NULL DEFAULT '';
      -- The price agreed with a client for one job (phone + item). Only the admin sets or changes it.
      CREATE TABLE IF NOT EXISTS deals (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        client_name TEXT NOT NULL DEFAULT '',
        item TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'service',
        rate NUMERIC,
        metres NUMERIC,
        total NUMERIC NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS deals_job_idx ON deals (phone, item);
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        link TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS notifications_phone_idx ON notifications (phone, id DESC);
      CREATE INDEX IF NOT EXISTS payments_job_idx ON payments (phone, item);
      CREATE INDEX IF NOT EXISTS payments_checkout_idx ON payments (checkout_id);`,
    )
    .catch((e) => { ready = null; throw e; });
  return ready;
}

/* ------------------------------------------------------------- safety */
// One server-only secret signs the M-Pesa reply address and the per-payer keys. MEMBER_SECRET is preferred; if it is missing another
// server-only value is used, and with none at all payments stay switched off (a made-up default would be guessable).
const baseSecret = () => process.env.MEMBER_SECRET || process.env.ADMIN_KEY || process.env.MPESA_CONSUMER_SECRET || "";
const hmac = (data: string) => crypto.createHmac("sha256", baseSecret()).update(data).digest("hex");
/** Handed to the payer when they pay. Only someone who paid from this phone can read its notifications, balances and receipts. */
const viewKey = (phone: string) => hmac(`view:${phone}`).slice(0, 32);
const keyOk = (phone: string | null, key: unknown) => {
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
/** 07xx / 01xx / +254 / 254 -> 2547xxxxxxxx */
function normPhone(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  const n = d.startsWith("254") ? d : d.startsWith("0") ? "254" + d.slice(1) : d.length === 9 ? "254" + d : d;
  return /^254[17]\d{8}$/.test(n) ? n : null;
}
const isAdmin = (req: Request) => {
  const k = process.env.ADMIN_KEY;
  const h = req.header("x-admin-key");
  return !!k && typeof h === "string" && h === k;
};

interface Parsed { phone: string; name: string; email: string; kind: string; item: string; payType: string; amount: number; quote: string }
function parseBody(b: Record<string, unknown>): Parsed | string {
  const phone = normPhone(b.phone);
  const name = str(b.name, 80);
  const item = str(b.item, 140);
  const payType = ["deposit", "balance", "full"].includes(String(b.payType)) ? String(b.payType) : "full";
  const kind = b.kind === "product" ? "product" : "service";
  const amount = num(b.amount);
  if (name.length < 2) return "Enter your name.";
  if (!phone) return "Enter a valid Safaricom phone number, like 0712 345 678.";
  if (!item) return "Choose what you are paying for.";
  if (!Number.isFinite(amount) || amount < 1 || amount > 50_000_000) return "Enter the amount to pay.";
  // "quote" is only the client's own estimate (casing, depth...), kept so the admin can see it when setting the real price
  return { phone, name, email: str(b.email, 120), kind, item, payType, amount, quote: str(b.quote, 240) };
}

const kes = (n: number) => `KSh ${Math.round(n).toLocaleString("en-KE")}`;

/** What the client has paid on a job and what is left. The agreed price is the one the admin set (a "deal"); without one the job is unpriced. */
async function jobBalance(phone: string, item: string) {
  const d = (await pool.query("SELECT total, rate, metres FROM deals WHERE phone=$1 AND item=$2", [phone, item])).rows[0];
  const r = await pool.query("SELECT status, amount FROM payments WHERE phone=$1 AND item=$2", [phone, item]);
  const paid = r.rows.filter((x) => x.status === "paid").reduce((a, x) => a + Number(x.amount), 0);
  const pending = r.rows.filter((x) => x.status === "pending").reduce((a, x) => a + Number(x.amount), 0);
  if (!d) return { found: r.rows.length > 0, priced: false, agreedTotal: 0, rate: null as number | null, metres: null as number | null, paid, pending, balance: 0, overpaid: 0 };
  const total = Number(d.total);
  return {
    found: true, priced: true, agreedTotal: total, rate: d.rate == null ? null : Number(d.rate), metres: d.metres == null ? null : Number(d.metres),
    paid, pending, balance: Math.max(0, total - paid), overpaid: Math.max(0, paid - total),
  };
}

/** Checks the amount against the admin's price. Without an agreed price only a deposit can be taken. */
async function priceCheck(p: Parsed): Promise<string | { agreedTotal: number; payType: string }> {
  const b = await jobBalance(p.phone, p.item);
  if (!b.priced) return { agreedTotal: 0, payType: "deposit" };
  if (b.balance <= 0) return "This job is already fully paid. Thank you.";
  if (p.amount > b.balance) return `The most you can pay now is ${kes(b.balance)}.`;
  return { agreedTotal: b.agreedTotal, payType: p.payType };
}

async function notify(phone: string, title: string, body: string, link = "") {
  await pool.query("INSERT INTO notifications (phone,title,body,link) VALUES ($1,$2,$3,$4)", [phone, title, body, link]).catch(() => {});
}
/** Tell the client a payment was received and what is left on the job. */
async function notifyPaid(id: number) {
  const r = await pool.query("SELECT phone, item, amount FROM payments WHERE id=$1", [id]);
  if (!r.rows[0]) return;
  const { phone, item, amount } = r.rows[0];
  const b = await jobBalance(phone, item);
  if (!b.priced) {
    await notify(phone, "Deposit received", `We received ${kes(Number(amount))} for ${item}. We will confirm your price and balance with you.`, "/feed");
    return;
  }
  await notify(
    phone,
    b.balance > 0 ? "Payment received" : "Payment complete",
    b.balance > 0
      ? `We received ${kes(Number(amount))} for ${item}. Balance remaining: ${kes(b.balance)}.`
      : `We received ${kes(Number(amount))} for ${item}. It is fully paid. Thank you for choosing Dighaz Engineering.`,
    "/feed",
  );
}

/* ------------------------------------------------------------- public */
/** Bank accounts to show. BANK_ACCOUNTS = "Bank|Account name|Account number;Bank|Account name|Account number" (or the single BANK_* variables). */
const DEFAULT_BANKS = [
  { bankName: "KCB Bank", accountName: "Dighaz Engineering Limited", accountNumber: "1315850613", paybill: "522522" },
  { bankName: "Absa Bank", accountName: "Dighaz Engineering Limited", accountNumber: "2057613672", paybill: "303030" },
];
function bankAccounts() {
  const multi = (process.env.BANK_ACCOUNTS ?? "").split(";").map((x) => x.split("|").map((y) => y.trim())).filter((x) => x.length >= 3 && x[2])
    .map(([bankName, accountName, accountNumber, paybill]) => ({ bankName, accountName, accountNumber, paybill: paybill ?? "" }));
  return multi.length ? multi : DEFAULT_BANKS;
}
router.get("/payments/config", (_req, res) => {
  res.json({ mpesa: mpesaReady(), banks: bankAccounts() });
});

const NO_JOB = { found: false, priced: false, agreedTotal: 0, rate: null, metres: null, paid: null, pending: 0, balance: 0, overpaid: 0 };
router.get("/payments/balance", async (req, res) => {
  try {
    await ensureTables();
    const phone = normPhone(req.query.phone);
    const item = str(req.query.item, 140);
    if (!phone || !item || limited(`bal:${req.ip ?? "x"}`, 80)) { res.json(NO_JOB); return; }
    const b = await jobBalance(phone, item);
    const mine = keyOk(phone, req.query.key); // only the payer's own device sees the payment history
    if (!b.priced && !mine) { res.json(NO_JOB); return; }
    res.json({ ...b, paid: mine ? b.paid : null, pending: mine ? b.pending : 0, overpaid: mine ? b.overpaid : 0 });
  } catch { res.json(NO_JOB); }
});

router.get("/payments/notifications", async (req, res) => {
  try {
    await ensureTables();
    const phone = normPhone(req.query.phone);
    if (!phone || !keyOk(phone, req.query.key)) { res.json([]); return; }
    const r = await pool.query('SELECT id, title, body, link, created_at AS "createdAt" FROM notifications WHERE phone=$1 ORDER BY id DESC LIMIT 20', [phone]);
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
    const p = parseBody(req.body ?? {});
    if (typeof p === "string") { res.status(400).json({ error: p }); return; }
    const price = await priceCheck(p);
    if (typeof price === "string") { res.status(400).json({ error: price }); return; }
    // only prompts that would really be sent count toward the limit, so a typing mistake never locks a client out
    if (limited(`ip:${req.ip ?? "x"}`, 20) || limited(`phone:${p.phone}`, 4)) { res.status(429).json({ error: SLOW_DOWN }); return; }
    const tokenP = mpesaToken().catch((e) => e as Error);
    const ins = await pool.query(
      `INSERT INTO payments (phone,name,email,kind,item,pay_type,amount,agreed_total,method,status,quote) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mpesa','pending',$9) RETURNING id`,
      [p.phone, p.name, p.email, p.kind, p.item, price.payType, p.amount, price.agreedTotal, p.quote],
    );
    const id = ins.rows[0].id as number;
    const ts = stamp();
    const shortcode = process.env.MPESA_SHORTCODE!;
    const till = process.env.MPESA_TYPE === "till";
    const base = (process.env.PUBLIC_API_URL ?? process.env.RENDER_EXTERNAL_URL ?? "").replace(/\/$/, "");
    try {
      const token = await tokenP;
      if (typeof token !== "string") throw token;
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
    const p = parseBody(req.body ?? {});
    if (typeof p === "string") { res.status(400).json({ error: p }); return; }
    const bankRef = str(req.body?.bankRef, 600);
    const img = typeof req.body?.receiptImg === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(req.body.receiptImg) && req.body.receiptImg.length < 1_000_000 ? req.body.receiptImg : null;
    if (bankRef.length < 3 && !img) { res.status(400).json({ error: "Upload your payment receipt, or paste the bank message." }); return; }
    const price = await priceCheck(p);
    if (typeof price === "string") { res.status(400).json({ error: price }); return; }
    if (limited(`bank-ip:${req.ip ?? "x"}`, 20) || limited(`bank-phone:${p.phone}`, 6)) { res.status(429).json({ error: SLOW_DOWN }); return; }
    const ins = await pool.query(
      `INSERT INTO payments (phone,name,email,kind,item,pay_type,amount,agreed_total,method,status,bank_ref,receipt_img,quote) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'bank','pending',$9,$10,$11) RETURNING id`,
      [p.phone, p.name, p.email, p.kind, p.item, price.payType, p.amount, price.agreedTotal, bankRef, img, p.quote],
    );
    await notify(p.phone, "Receipt received", `We received your ${kes(p.amount)} bank payment proof for ${p.item}. We are confirming it now.`);
    res.json({ id: ins.rows[0].id, status: "pending", key: baseSecret() ? viewKey(p.phone) : undefined });
  } catch { res.status(500).json({ error: "Something went wrong. Please try again." }); }
});

/* ------------------------------------------------------------- admin */
router.get("/payments-admin/list", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTables();
    const stale = await pool.query("SELECT id FROM payments WHERE method='mpesa' AND status='pending' AND checkout_id IS NOT NULL AND created_at < NOW() - INTERVAL '1 minute' ORDER BY id DESC LIMIT 8");
    await Promise.allSettled(stale.rows.map((x) => reconcile(x.id)));
    const r = await pool.query(
      `SELECT id, phone, name, email, kind, item, pay_type AS "payType", amount, agreed_total AS "agreedTotal", method, status, receipt, bank_ref AS "bankRef", (receipt_img IS NOT NULL) AS "hasImg", note, quote, created_at AS "createdAt" FROM payments ORDER BY created_at DESC LIMIT 300`,
    );
    const dl = await pool.query("SELECT phone, item, total FROM deals");
    const priceOf = new Map<string, number>(dl.rows.map((d) => [`${d.phone}|${d.item}`, Number(d.total)]));
    const rows = r.rows.map((x) => ({ ...x, amount: Number(x.amount), agreedTotal: priceOf.get(`${x.phone}|${x.item}`) ?? 0, priced: priceOf.has(`${x.phone}|${x.item}`) }));
    // running balance per job (phone + item)
    const paid = new Map<string, number>();
    for (const x of rows) if (x.status === "paid") paid.set(`${x.phone}|${x.item}`, (paid.get(`${x.phone}|${x.item}`) ?? 0) + x.amount);
    res.json(rows.map((x) => ({ ...x, paidSoFar: paid.get(`${x.phone}|${x.item}`) ?? 0 })));
  } catch { res.status(500).json({ error: "Could not load payments." }); }
});

/* -------- agreed prices ("deals"): only the admin sets or changes a job's price */
router.get("/payments-admin/deals", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTables();
    const d = await pool.query(
      `SELECT d.id, d.phone, d.client_name AS name, d.item, d.kind, d.rate, d.metres, d.total, d.note, d.updated_at AS "updatedAt",
         COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.phone=d.phone AND p.item=d.item AND p.status='paid'), 0) AS paid
       FROM deals d ORDER BY d.updated_at DESC LIMIT 300`,
    );
    const deals = d.rows.map((x) => {
      const total = Number(x.total), paid = Number(x.paid);
      return { id: x.id, phone: x.phone, name: x.name, item: x.item, kind: x.kind, rate: x.rate == null ? null : Number(x.rate), metres: x.metres == null ? null : Number(x.metres), total, paid, balance: Math.max(0, total - paid), overpaid: Math.max(0, paid - total), note: x.note, updatedAt: x.updatedAt };
    });
    // jobs where clients have paid but no price is set yet
    const u = await pool.query(
      `SELECT p.phone, p.item, p.kind, (ARRAY_AGG(p.name ORDER BY p.created_at DESC))[1] AS name,
         COALESCE(SUM(p.amount) FILTER (WHERE p.status='paid'), 0) AS paid, COALESCE(SUM(p.amount) FILTER (WHERE p.status='pending'), 0) AS pending,
         (ARRAY_AGG(p.quote ORDER BY p.created_at DESC) FILTER (WHERE p.quote <> ''))[1] AS quote, MAX(p.created_at) AS "lastAt"
       FROM payments p
       WHERE p.status IN ('paid','pending') AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.phone=p.phone AND d.item=p.item)
       GROUP BY p.phone, p.item, p.kind ORDER BY MAX(p.created_at) DESC LIMIT 100`,
    );
    res.json({ deals, unpriced: u.rows.map((x) => ({ ...x, paid: Number(x.paid), pending: Number(x.pending) })) });
  } catch { res.status(500).json({ error: "Could not load prices." }); }
});

router.post("/payments-admin/deals", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTables();
    const b = req.body ?? {};
    const phone = normPhone(b.phone);
    const item = str(b.item, 140);
    const kind = b.kind === "product" ? "product" : "service";
    if (!phone) { res.status(400).json({ error: "Enter the client's phone number, like 0712 345 678." }); return; }
    if (!item) { res.status(400).json({ error: "Choose or type what the job is for." }); return; }
    const rate = b.rate === "" || b.rate == null ? null : num(b.rate);
    const metresRaw = b.metres === "" || b.metres == null ? null : Math.round(Number(b.metres) * 10) / 10;
    let total: number;
    if (rate && metresRaw) {
      if (!(rate > 0 && rate <= 1_000_000) || !(metresRaw > 0 && metresRaw <= 5000)) { res.status(400).json({ error: "Check the price per metre and the metres." }); return; }
      total = Math.round(rate * metresRaw); // per-metre jobs: price = rate x metres
    } else total = num(b.total);
    if (!Number.isFinite(total) || total < 1 || total > 50_000_000) { res.status(400).json({ error: "Enter the agreed price." }); return; }
    const useRate = rate && metresRaw ? rate : null;
    const useMetres = rate && metresRaw ? metresRaw : null;
    const before = (await pool.query("SELECT total FROM deals WHERE phone=$1 AND item=$2", [phone, item])).rows[0];
    const nameIn = str(b.name, 80) || ((await pool.query("SELECT name FROM payments WHERE phone=$1 ORDER BY created_at DESC LIMIT 1", [phone])).rows[0]?.name ?? "");
    await pool.query(
      `INSERT INTO deals (phone, client_name, item, kind, rate, metres, total, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (phone, item) DO UPDATE SET client_name = COALESCE(NULLIF(EXCLUDED.client_name, ''), deals.client_name), kind=EXCLUDED.kind,
         rate=EXCLUDED.rate, metres=EXCLUDED.metres, total=EXCLUDED.total, note=EXCLUDED.note, updated_at=NOW()`,
      [phone, nameIn, item, kind, useRate, useMetres, total, str(b.note, 300)],
    );
    // tell the client, in the bell, what their price is and what is left
    if (!before || Number(before.total) !== total) {
      const j = await jobBalance(phone, item);
      const left = j.balance > 0 ? `Balance remaining: ${kes(j.balance)}.` : j.overpaid > 0 ? `You have paid ${kes(j.overpaid)} more than this total, we will contact you.` : "It is fully paid.";
      const paidPart = j.paid > 0 ? ` Paid so far: ${kes(j.paid)}.` : "";
      await notify(
        phone,
        before ? "Your total was updated" : "Your agreed price is set",
        before ? `Your total for ${item} is now ${kes(total)} (it was ${kes(Number(before.total))}).${paidPart} ${left}` : `We recorded your agreed price for ${item}: ${kes(total)}.${paidPart} ${left} You can pay from the Pay button.`,
        "/feed",
      );
    }
    res.status(before ? 200 : 201).json({ ok: true, total });
  } catch { res.status(500).json({ error: "Could not save the price." }); }
});

router.delete("/payments-admin/deals/:id", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTables();
    await pool.query("DELETE FROM deals WHERE id=$1", [Number(req.params.id) || 0]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not remove." }); }
});

router.get("/payments-admin/:id/receipt", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTables();
    const r = await pool.query("SELECT receipt_img FROM payments WHERE id=$1", [Number(req.params.id) || 0]);
    res.json({ img: r.rows[0]?.receipt_img ?? null });
  } catch { res.status(500).json({ error: "Could not load." }); }
});

router.post("/payments-admin/:id/:action", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  const action = req.params.action;
  if (action !== "confirm" && action !== "reject") { res.status(400).json({ error: "Bad action" }); return; }
  try {
    await ensureTables();
    const r = await pool.query(
      "UPDATE payments SET status=$2 WHERE id=$1 AND method='bank' AND status IN ('pending','rejected','paid') RETURNING id",
      [Number(req.params.id) || 0, action === "confirm" ? "paid" : "rejected"],
    );
    if (!r.rows[0]) { res.status(404).json({ error: "Only bank payments can be confirmed here." }); return; }
    if (action === "confirm") await notifyPaid(r.rows[0].id);
    else {
      const q = await pool.query("SELECT phone, item FROM payments WHERE id=$1", [r.rows[0].id]);
      await notify(q.rows[0].phone, "Bank payment not confirmed", `We could not confirm your bank payment for ${q.rows[0].item}. Please call us on +254 719 117 660.`);
    }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not update." }); }
});

export default router;
