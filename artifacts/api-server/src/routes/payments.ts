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
      CREATE INDEX IF NOT EXISTS payments_job_idx ON payments (phone, item);
      CREATE INDEX IF NOT EXISTS payments_checkout_idx ON payments (checkout_id);`,
    )
    .catch((e) => { ready = null; throw e; });
  return ready;
}

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
  if (!phone) return "Enter a valid Safaricom phone number, like 0712 345 678.";
  if (!item) return "Choose what you are paying for.";
  if (!Number.isFinite(agreedTotal) || agreedTotal < 1 || agreedTotal > 50_000_000) return "Enter the agreed price.";
  if (!Number.isFinite(amount) || amount < 1) return "Enter the amount to pay.";
  if (amount > agreedTotal) return "The amount cannot be more than the agreed price.";
  return { phone, name, email: str(b.email, 120), kind, item, payType, amount, agreedTotal };
}

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

/* ------------------------------------------------------------- public */
router.get("/payments/config", (_req, res) => {
  const bank = process.env.BANK_ACCOUNT_NUMBER
    ? { bankName: process.env.BANK_NAME ?? "", accountName: process.env.BANK_ACCOUNT_NAME ?? "", accountNumber: process.env.BANK_ACCOUNT_NUMBER, branch: process.env.BANK_BRANCH ?? "" }
    : null;
  res.json({ mpesa: mpesaReady(), bank });
});

router.get("/payments/balance", async (req, res) => {
  try {
    await ensureTables();
    const phone = normPhone(req.query.phone);
    const item = str(req.query.item, 140);
    if (!phone || !item) { res.json({ found: false, agreedTotal: 0, paid: 0, pending: 0, balance: 0 }); return; }
    res.json(await jobBalance(phone, item));
  } catch { res.json({ found: false, agreedTotal: 0, paid: 0, pending: 0, balance: 0 }); }
});

router.get("/payments/:id/status", async (req, res) => {
  try {
    await ensureTables();
    const r = await pool.query("SELECT status, receipt, amount, note FROM payments WHERE id=$1", [Number(req.params.id) || 0]);
    if (!r.rows[0]) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ status: r.rows[0].status, receipt: r.rows[0].receipt, amount: Number(r.rows[0].amount), note: r.rows[0].note });
  } catch { res.status(500).json({ error: "Could not check the payment." }); }
});

/* ------------------------------------------------------------- M-Pesa */
const mpesaReady = () => !!(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_SHORTCODE && process.env.MPESA_PASSKEY);
const mpesaBase = () => process.env.MPESA_BASE_URL || (process.env.MPESA_ENV === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");
const callbackSecret = () => crypto.createHmac("sha256", process.env.MEMBER_SECRET ?? "dev").update("mpesa-callback").digest("hex").slice(0, 24);

async function mpesaToken(): Promise<string> {
  const basic = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString("base64");
  const r = await fetch(`${mpesaBase()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${basic}` } });
  const d: any = await r.json().catch(() => ({}));
  if (!d.access_token) throw new Error("M-Pesa sign-in failed");
  return d.access_token;
}
const stamp = () => new Date(Date.now() + 3 * 3600_000).toISOString().replace(/\D/g, "").slice(0, 14);

router.post("/payments/mpesa", async (req: Request, res: Response) => {
  try {
    await ensureTables();
    if (!mpesaReady()) { res.status(503).json({ error: "M-Pesa is not switched on yet. Please use bank transfer or call us." }); return; }
    const p = parseBody(req.body ?? {});
    if (typeof p === "string") { res.status(400).json({ error: p }); return; }
    const ins = await pool.query(
      `INSERT INTO payments (phone,name,email,kind,item,pay_type,amount,agreed_total,method,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'mpesa','pending') RETURNING id`,
      [p.phone, p.name, p.email, p.kind, p.item, p.payType, p.amount, p.agreedTotal],
    );
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
      res.json({ id, status: "pending" });
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
      await pool.query(
        `UPDATE payments SET status = CASE WHEN $3::numeric = amount THEN 'paid' ELSE 'pending' END, receipt=$2,
           note = CASE WHEN $3::numeric = amount THEN '' ELSE 'Amount received differs: check M-Pesa' END
         WHERE checkout_id=$1 AND status='pending'`,
        [cb.CheckoutRequestID, receipt, Number.isFinite(paidAmt) ? paidAmt : -1],
      );
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
    const bankRef = str(req.body?.bankRef, 80);
    if (bankRef.length < 3) { res.status(400).json({ error: "Enter the transaction code or reference from your bank." }); return; }
    const ins = await pool.query(
      `INSERT INTO payments (phone,name,email,kind,item,pay_type,amount,agreed_total,method,status,bank_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'bank','pending',$9) RETURNING id`,
      [p.phone, p.name, p.email, p.kind, p.item, p.payType, p.amount, p.agreedTotal, bankRef],
    );
    res.json({ id: ins.rows[0].id, status: "pending" });
  } catch { res.status(500).json({ error: "Something went wrong. Please try again." }); }
});

/* ------------------------------------------------------------- admin */
router.get("/payments-admin/list", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTables();
    const r = await pool.query(
      `SELECT id, phone, name, email, kind, item, pay_type AS "payType", amount, agreed_total AS "agreedTotal", method, status, receipt, bank_ref AS "bankRef", note, created_at AS "createdAt" FROM payments ORDER BY created_at DESC LIMIT 300`,
    );
    const rows = r.rows.map((x) => ({ ...x, amount: Number(x.amount), agreedTotal: Number(x.agreedTotal) }));
    // running balance per job (phone + item)
    const paid = new Map<string, number>();
    for (const x of rows) if (x.status === "paid") paid.set(`${x.phone}|${x.item}`, (paid.get(`${x.phone}|${x.item}`) ?? 0) + x.amount);
    res.json(rows.map((x) => ({ ...x, paidSoFar: paid.get(`${x.phone}|${x.item}`) ?? 0 })));
  } catch { res.status(500).json({ error: "Could not load payments." }); }
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
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not update." }); }
});

export default router;
