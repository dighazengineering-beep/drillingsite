import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { pool } from "@workspace/db";

const router = Router();

/* ------------------------------------------------------------------ tables */
let ready: Promise<unknown> | null = null;
function ensureTables() {
  ready ??= pool
    .query(
      `
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      pass_hash TEXT,
      google_id TEXT,
      code TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS referrals (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'service',
      need TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'member',
      rate NUMERIC NOT NULL DEFAULT 15,
      amount NUMERIC,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      fully_paid BOOLEAN NOT NULL DEFAULT FALSE,
      paid_out BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS referrals_member_idx ON referrals (member_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS member_settings (
      key TEXT PRIMARY KEY,
      value NUMERIC NOT NULL
    );
    INSERT INTO member_settings (key, value) VALUES ('service_rate', 15), ('product_rate', 3) ON CONFLICT DO NOTHING;
    -- Earning (affiliate) is optional. Accounts that existed before this column keep earning access; new ones start as plain clients.
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='affiliate') THEN
        ALTER TABLE members ADD COLUMN affiliate BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE members ALTER COLUMN affiliate SET DEFAULT FALSE;
      END IF;
    END $$;
  `,
    )
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

async function rates() {
  await ensureTables();
  const r = await pool.query("SELECT key, value::float AS value FROM member_settings");
  const m = Object.fromEntries(r.rows.map((x) => [x.key, x.value]));
  return { service: Number(m.service_rate ?? 15), product: Number(m.product_rate ?? 3) };
}

/* ---------------------------------------------------------------- security */
const isAdmin = (key: unknown) => {
  const k = process.env.ADMIN_KEY;
  return !!k && typeof key === "string" && key === k;
};

// Sessions are signed tokens. Set MEMBER_SECRET on the server to keep members signed in across restarts.
const SECRET = process.env.MEMBER_SECRET || (process.env.ADMIN_KEY ? `m:${process.env.ADMIN_KEY}` : crypto.randomBytes(32).toString("hex"));
const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (data: string) => crypto.createHmac("sha256", SECRET).update(data).digest("base64url");

function makeToken(memberId: number) {
  const body = b64(JSON.stringify({ id: memberId, exp: Date.now() + 90 * 24 * 3600 * 1000 }));
  return `${body}.${sign(body)}`;
}
function readToken(token: string | undefined): number | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() ? Number(p.id) : null;
  } catch {
    return null;
  }
}

function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}
function checkPassword(pw: string, stored: string | null) {
  if (!stored) return false;
  const [s, h] = stored.split(":");
  if (!s || !h) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(s, "hex"), 64);
  const want = Buffer.from(h, "hex");
  return want.length === hash.length && crypto.timingSafeEqual(want, hash);
}

// Light per-IP limit on sign-in and sign-up attempts: 10 per 10 minutes.
const tries = new Map<string, number[]>();
function limited(ip: string, max = 10, windowMs = 600_000) {
  const now = Date.now();
  const list = (tries.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    tries.set(ip, list);
    return true;
  }
  list.push(now);
  tries.set(ip, list);
  return false;
}

/* ------------------------------------------------------------------ helpers */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
async function newCode() {
  for (let i = 0; i < 20; i++) {
    const code = "KWS-" + Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join("");
    const r = await pool.query("SELECT 1 FROM members WHERE code=$1", [code]);
    if (!r.rowCount) return code;
  }
  throw new Error("code");
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

const publicMember = (m: any) => ({ id: m.id, name: m.name, email: m.email, phone: m.phone ?? "", code: m.code, affiliate: !!m.affiliate });

export async function memberFrom(req: Request) {
  const auth = req.header("authorization") ?? "";
  const id = readToken(auth.startsWith("Bearer ") ? auth.slice(7) : undefined);
  if (!id) return null;
  await ensureTables();
  const r = await pool.query("SELECT * FROM members WHERE id=$1", [id]);
  return r.rows[0] ?? null;
}

type Row = {
  id: number; client_name: string; client_phone: string; kind: string; need: string; source: string;
  rate: string; amount: string | null; completed: boolean; fully_paid: boolean; paid_out: boolean; notes: string; created_at: string;
};
function shapeReferral(r: Row) {
  const amount = r.amount == null ? null : Number(r.amount);
  const rate = Number(r.rate);
  const commission = amount == null ? null : Math.round((amount * rate) / 100);
  const status = r.paid_out ? "paid" : r.completed && r.fully_paid && amount ? "payable" : r.completed ? "awaiting_payment" : "in_progress";
  return {
    id: r.id, clientName: r.client_name, clientPhone: r.client_phone, kind: r.kind, need: r.need, source: r.source,
    rate, amount, commission, status, completed: r.completed, fullyPaid: r.fully_paid, paidOut: r.paid_out,
    notes: r.notes, createdAt: r.created_at,
  };
}

/* ------------------------------------------------------------------- public */
router.get("/members/config", async (_req, res) => {
  try {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID ?? "", rates: await rates() });
  } catch {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID ?? "", rates: { service: 15, product: 3 } });
  }
});

router.post("/members/signup", async (req: Request, res: Response) => {
  if (limited(req.ip ?? "x")) { res.status(429).json({ error: "Too many attempts. Try again in a few minutes." }); return; }
  const name = clean(req.body?.name, 80);
  const email = clean(req.body?.email, 120).toLowerCase();
  const phone = clean(req.body?.phone, 30);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const affiliate = req.body?.affiliate === true;
  if (name.length < 2) { res.status(400).json({ error: "Enter your name." }); return; }
  if (!emailOk(email)) { res.status(400).json({ error: "Enter a valid email address." }); return; }
  if (password.length < 6 || password.length > 100) { res.status(400).json({ error: "Password must be at least 6 characters." }); return; }
  try {
    await ensureTables();
    const exists = await pool.query("SELECT id FROM members WHERE email=$1", [email]);
    if (exists.rowCount) { res.status(409).json({ error: "That email already has an account. Sign in instead." }); return; }
    const code = await newCode();
    const r = await pool.query(
      "INSERT INTO members (name, email, phone, pass_hash, code, affiliate) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [name, email, phone || null, hashPassword(password), code, affiliate],
    );
    res.status(201).json({ token: makeToken(r.rows[0].id), member: publicMember(r.rows[0]) });
  } catch {
    res.status(500).json({ error: "Could not create the account. Try again." });
  }
});

router.post("/members/login", async (req: Request, res: Response) => {
  if (limited(req.ip ?? "x")) { res.status(429).json({ error: "Too many attempts. Try again in a few minutes." }); return; }
  const email = clean(req.body?.email, 120).toLowerCase();
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  try {
    await ensureTables();
    const r = await pool.query("SELECT * FROM members WHERE email=$1", [email]);
    const m = r.rows[0];
    if (m && !m.pass_hash) { res.status(400).json({ error: "This account uses Google. Tap “Continue with Google”." }); return; }
    if (!m || !checkPassword(password, m.pass_hash)) { res.status(401).json({ error: "Wrong email or password." }); return; }
    res.json({ token: makeToken(m.id), member: publicMember(m) });
  } catch {
    res.status(500).json({ error: "Could not sign in. Try again." });
  }
});

// Google sign-in: the browser sends the Google ID token; Google confirms it and who it belongs to.
router.post("/members/google", async (req: Request, res: Response) => {
  if (limited(req.ip ?? "x", 20)) { res.status(429).json({ error: "Too many attempts. Try again in a few minutes." }); return; }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const credential = clean(req.body?.credential, 4000);
  if (!clientId) { res.status(503).json({ error: "Google sign-in is not switched on yet." }); return; }
  if (!credential) { res.status(400).json({ error: "Missing Google sign-in." }); return; }
  try {
    const g = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    const info: any = await g.json();
    if (!g.ok || info.aud !== clientId || !(info.email_verified === true || info.email_verified === "true") || !info.email) {
      res.status(401).json({ error: "Google sign-in could not be verified." });
      return;
    }
    await ensureTables();
    const email = String(info.email).toLowerCase();
    let r = await pool.query("SELECT * FROM members WHERE email=$1", [email]);
    if (!r.rowCount) {
      const code = await newCode();
      r = await pool.query(
        "INSERT INTO members (name, email, google_id, code, affiliate) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        [String(info.name || email.split("@")[0]).slice(0, 80), email, String(info.sub), code, req.body?.affiliate === true],
      );
    } else if (!r.rows[0].google_id) {
      await pool.query("UPDATE members SET google_id=$1 WHERE id=$2", [String(info.sub), r.rows[0].id]);
    }
    res.json({ token: makeToken(r.rows[0].id), member: publicMember(r.rows[0]) });
  } catch {
    res.status(500).json({ error: "Google sign-in failed. Try again." });
  }
});

router.get("/members/me", async (req: Request, res: Response) => {
  try {
    const m = await memberFrom(req);
    if (!m) { res.status(401).json({ error: "Please sign in." }); return; }
    const r = await pool.query("SELECT * FROM referrals WHERE member_id=$1 ORDER BY created_at DESC", [m.id]);
    const referrals = r.rows.map(shapeReferral);
    const sum = (f: (x: ReturnType<typeof shapeReferral>) => boolean) =>
      referrals.filter(f).reduce((a, x) => a + (x.commission ?? 0), 0);
    // Enquiries this person sent through the contact form, matched by email or phone number
    const last9 = (m.phone ?? "").replace(/\D/g, "").slice(-9);
    const enq = await pool.query(
      `SELECT id, inquiry_type AS "type", message, county, created_at AS "createdAt" FROM inquiries
       WHERE lower(email) = $1 OR ($2 <> '' AND right(regexp_replace(phone, '\\D', '', 'g'), 9) = $2)
       ORDER BY created_at DESC LIMIT 30`,
      [m.email, last9],
    ).catch(() => ({ rows: [] }));
    res.json({
      member: publicMember(m),
      enquiries: enq.rows,
      rates: await rates(),
      referrals,
      totals: {
        payable: sum((x) => x.status === "payable"),
        paid: sum((x) => x.status === "paid"),
        expected: sum((x) => x.status === "in_progress" || x.status === "awaiting_payment"),
      },
    });
  } catch {
    res.status(500).json({ error: "Could not load your account." });
  }
});

// A client chooses to start earning. Gives them the referral code, link and commission screens.
router.post("/members/affiliate", async (req: Request, res: Response) => {
  try {
    const m = await memberFrom(req);
    if (!m) { res.status(401).json({ error: "Please sign in." }); return; }
    const r = await pool.query("UPDATE members SET affiliate=TRUE WHERE id=$1 RETURNING *", [m.id]);
    res.json({ member: publicMember(r.rows[0]) });
  } catch {
    res.status(500).json({ error: "Could not switch that on. Try again." });
  }
});

router.patch("/members/me", async (req: Request, res: Response) => {
  try {
    const m = await memberFrom(req);
    if (!m) { res.status(401).json({ error: "Please sign in." }); return; }
    const name = clean(req.body?.name, 80) || m.name;
    const phone = clean(req.body?.phone, 30);
    const r = await pool.query("UPDATE members SET name=$1, phone=$2 WHERE id=$3 RETURNING *", [name, phone || null, m.id]);
    res.json({ member: publicMember(r.rows[0]) });
  } catch {
    res.status(500).json({ error: "Could not save." });
  }
});

// A member registers a client they are bringing
router.post("/members/referrals", async (req: Request, res: Response) => {
  try {
    const m = await memberFrom(req);
    if (!m) { res.status(401).json({ error: "Please sign in." }); return; }
    const clientName = clean(req.body?.clientName, 80);
    const clientPhone = clean(req.body?.clientPhone, 30);
    const kind = req.body?.kind === "product" ? "product" : "service";
    const need = clean(req.body?.need, 300);
    if (clientName.length < 2 || clientPhone.length < 7) { res.status(400).json({ error: "Enter the client's name and phone number." }); return; }
    const rt = await rates();
    const r = await pool.query(
      "INSERT INTO referrals (member_id, client_name, client_phone, kind, need, rate) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [m.id, clientName, clientPhone, kind, need, kind === "product" ? rt.product : rt.service],
    );
    res.status(201).json(shapeReferral(r.rows[0]));
  } catch {
    res.status(500).json({ error: "Could not save the client." });
  }
});

// A client who came through a member's link and filled in the contact form
router.post("/members/lead", async (req: Request, res: Response) => {
  if (limited(req.ip ?? "x", 8, 3600_000)) { res.status(429).json({ error: "Too many." }); return; }
  try {
    await ensureTables();
    const code = clean(req.body?.code, 20).toUpperCase();
    const clientName = clean(req.body?.name, 80);
    const clientPhone = clean(req.body?.phone, 30);
    if (!code || !clientName || !clientPhone) { res.json({ ok: false }); return; }
    const m = await pool.query("SELECT id, phone FROM members WHERE code=$1", [code]);
    if (!m.rowCount) { res.json({ ok: false }); return; }
    // The member cannot earn from their own phone number
    const digits = (s: string) => s.replace(/\D/g, "").slice(-9);
    if (m.rows[0].phone && digits(m.rows[0].phone) === digits(clientPhone)) { res.json({ ok: false }); return; }
    const type = clean(req.body?.type, 30);
    const kind = type === "product_order" ? "product" : "service";
    const rt = await rates();
    await pool.query(
      "INSERT INTO referrals (member_id, client_name, client_phone, kind, need, source, rate) VALUES ($1,$2,$3,$4,$5,'link',$6)",
      [m.rows[0].id, clientName, clientPhone, kind, clean(req.body?.message, 300), kind === "product" ? rt.product : rt.service],
    );
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

/* -------------------------------------------------------------------- admin */
router.use("/admin/referrals", (req, res, next) => {
  if (!isAdmin(req.header("x-admin-key"))) { res.status(403).json({ error: "Admin only" }); return; }
  next();
});
router.use("/admin/member-settings", (req, res, next) => {
  if (!isAdmin(req.header("x-admin-key"))) { res.status(403).json({ error: "Admin only" }); return; }
  next();
});

router.get("/admin/referrals", async (_req, res) => {
  try {
    await ensureTables();
    const r = await pool.query(
      `SELECT r.*, m.name AS member_name, m.email AS member_email, m.phone AS member_phone, m.code AS member_code
       FROM referrals r JOIN members m ON m.id = r.member_id ORDER BY r.created_at DESC LIMIT 500`,
    );
    const members = await pool.query("SELECT COUNT(*)::int AS n FROM members");
    res.json({
      memberCount: members.rows[0].n,
      rates: await rates(),
      items: r.rows.map((x) => ({
        ...shapeReferral(x),
        member: { name: x.member_name, email: x.member_email, phone: x.member_phone ?? "", code: x.member_code },
      })),
    });
  } catch {
    res.status(500).json({ error: "Could not load referrals." });
  }
});

router.patch("/admin/referrals/:id", async (req, res) => {
  try {
    await ensureTables();
    const id = Number(req.params.id);
    const cur = await pool.query("SELECT * FROM referrals WHERE id=$1", [id]);
    if (!cur.rowCount) { res.status(404).json({ error: "Not found" }); return; }
    const b = req.body ?? {};
    const sets: string[] = [];
    const vals: unknown[] = [];
    const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    if (b.kind === "product" || b.kind === "service") {
      add("kind", b.kind);
      if (b.kind !== cur.rows[0].kind && b.rate === undefined) {
        const rt = await rates();
        add("rate", b.kind === "product" ? rt.product : rt.service);
      }
    }
    if (b.rate !== undefined) {
      const n = Number(b.rate);
      if (!Number.isFinite(n) || n < 0 || n > 100) { res.status(400).json({ error: "Rate must be 0 to 100." }); return; }
      add("rate", n);
    }
    if (b.amount !== undefined) {
      if (b.amount === null || b.amount === "") add("amount", null);
      else {
        const n = Number(b.amount);
        if (!Number.isFinite(n) || n < 0) { res.status(400).json({ error: "Enter a valid amount." }); return; }
        add("amount", n);
      }
    }
    if (typeof b.completed === "boolean") add("completed", b.completed);
    if (typeof b.fullyPaid === "boolean") add("fully_paid", b.fullyPaid);
    if (typeof b.paidOut === "boolean") add("paid_out", b.paidOut);
    if (typeof b.notes === "string") add("notes", b.notes.slice(0, 500));
    if (!sets.length) { res.json(shapeReferral(cur.rows[0])); return; }
    vals.push(id);
    const r = await pool.query(`UPDATE referrals SET ${sets.join(", ")} WHERE id=$${vals.length} RETURNING *`, vals);
    res.json(shapeReferral(r.rows[0]));
  } catch {
    res.status(500).json({ error: "Could not save." });
  }
});

router.delete("/admin/referrals/:id", async (req, res) => {
  try {
    await ensureTables();
    await pool.query("DELETE FROM referrals WHERE id=$1", [Number(req.params.id)]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not delete." });
  }
});

router.put("/admin/member-settings", async (req, res) => {
  try {
    await ensureTables();
    const s = Number(req.body?.service);
    const p = Number(req.body?.product);
    if (![s, p].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) { res.status(400).json({ error: "Rates must be 0 to 100." }); return; }
    await pool.query("INSERT INTO member_settings (key,value) VALUES ('service_rate',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [s]);
    await pool.query("INSERT INTO member_settings (key,value) VALUES ('product_rate',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [p]);
    res.json(await rates());
  } catch {
    res.status(500).json({ error: "Could not save." });
  }
});

export default router;
