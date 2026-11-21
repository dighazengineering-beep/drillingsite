import { Router } from "express";
import crypto from "node:crypto";
import { pool } from "@workspace/db";
import { isAdminKey } from "../lib/adminAuth";
import { smsOwner } from "./payments";
import { emailClient, siteUrl } from "../lib/mailer";

const router = Router();
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
// Government fees only. We add nothing of our own.
export const FEES = { warma: 28_000, nema: 35_000 } as const;
const feeOf = (p: string) => (p === "warma" ? FEES.warma : p === "nema" ? FEES.nema : FEES.warma + FEES.nema);
const KINDS = ["id_front", "id_back", "land", "kra", "cert_warma", "cert_nema", "co_cert", "co_kra", "co_cr12", "co_auth"] as const;
// a company has one ID (front and back) per director: dir0_front, dir0_back, dir1_front ...
const okKind = (k: string) => (KINDS as readonly string[]).includes(k) || /^dir\d{1,2}_(front|back)$/.test(k);

let ready: Promise<void> | null = null;
function ensure() {
  ready ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permit_apps (
        id SERIAL PRIMARY KEY, token TEXT NOT NULL UNIQUE, mode TEXT NOT NULL, permits TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, phone2 TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL, county TEXT NOT NULL DEFAULT '', ward TEXT NOT NULL DEFAULT '', sublocation TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', village TEXT NOT NULL DEFAULT '',
        place_text TEXT NOT NULL DEFAULT '', lat DOUBLE PRECISION, lng DOUBLE PRECISION, use_type TEXT NOT NULL DEFAULT 'domestic', kra_pin TEXT NOT NULL DEFAULT '',
        fee INTEGER NOT NULL DEFAULT 0, id_no TEXT NOT NULL DEFAULT '', id_match TEXT NOT NULL DEFAULT '', id_source TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new', notes TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE permit_apps ADD COLUMN IF NOT EXISTS id_no TEXT NOT NULL DEFAULT '';
      ALTER TABLE permit_apps ADD COLUMN IF NOT EXISTS id_match TEXT NOT NULL DEFAULT '';
      ALTER TABLE permit_apps ADD COLUMN IF NOT EXISTS id_source TEXT NOT NULL DEFAULT '';
      ALTER TABLE permit_apps ADD COLUMN IF NOT EXISTS applicant TEXT NOT NULL DEFAULT 'person';
      ALTER TABLE permit_apps ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT '';
      CREATE TABLE IF NOT EXISTS permit_files (
        id SERIAL PRIMARY KEY, app_token TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (app_token, kind)
      );`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}
const ref = (id: number) => `PR${String(id).padStart(4, "0")}`;
const hits = new Map<string, number[]>();
const limited = (k: string, n: number) => { const now = Date.now(), a = (hits.get(k) ?? []).filter((t) => now - t < 3600_000); a.push(now); hits.set(k, a); return a.length > n; };

router.post("/permits", async (req, res) => {
  try {
    await ensure();
    const b = req.body ?? {};
    if (limited(`pm:${req.ip}`, 15)) { res.status(429).json({ error: "Too many tries. Please wait a little." }); return; }
    const mode = b.mode === "self" ? "self" : "apply";
    const permits = ["warma", "nema", "both"].includes(String(b.permits)) ? String(b.permits) : "both";
    const name = str(b.name, 80), email = str(b.email, 120), phone = str(b.phone, 20).replace(/[^\d+]/g, "");
    const kra = str(b.kraPin, 12).toUpperCase();
    if (name.length < 3) { res.status(400).json({ error: "Enter your full names." }); return; }
    if (phone.replace(/\D/g, "").length < 9) { res.status(400).json({ error: "Enter your phone number." }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: "Enter your email address." }); return; }
    // a personal application uses a PIN starting A0; a company uses the company PIN starting P0 (set by the choice, not a switch)
    const applicant = mode === "apply" && b.applicant === "company" ? "company" : "person";
    if (mode === "apply" && applicant === "person" && !/^A0\d{8}[A-Z]$/.test(kra)) { res.status(400).json({ error: "The KRA PIN is required. Personal PINs start with A0, like A012345678B." }); return; }
    let company = "";
    if (applicant === "company") {
      const c = (b.company ?? {}) as Record<string, unknown>;
      const dirs = (Array.isArray(c.directors) ? c.directors : []).slice(0, 20).map((d: Record<string, unknown>) => ({ name: str(d?.name, 80), idNo: str(d?.idNo, 20).toUpperCase(), kraPin: str(d?.kraPin, 12).toUpperCase() }));
      const shs = (Array.isArray(c.shareholders) ? c.shareholders : []).slice(0, 40).map((x: Record<string, unknown>) => ({ name: str(x?.name, 80), pct: Math.max(0, Math.min(100, Number(x?.pct) || 0)) }));
      const cname = str(c.name, 120), regNo = str(c.regNo, 40), address = str(c.address, 160);
      if (cname.length < 3) { res.status(400).json({ error: "Enter the company name exactly as registered." }); return; }
      if (regNo.length < 3) { res.status(400).json({ error: "Enter the company registration number." }); return; }
      if (!/^P0\d{8}[A-Z]$/.test(kra)) { res.status(400).json({ error: "The company KRA PIN is required. Company PINs start with P0, like P012345678B." }); return; }
      if (!dirs.length) { res.status(400).json({ error: "Add at least one director." }); return; }
      if (dirs.some((d) => d.name.length < 3 || d.idNo.replace(/[^A-Z0-9]/g, "").length < 5)) { res.status(400).json({ error: "Each director needs a name and an ID number." }); return; }
      if (dirs.some((d) => d.kraPin && !/^A0\d{8}[A-Z]$/.test(d.kraPin))) { res.status(400).json({ error: "A director's KRA PIN must start with A0, like A012345678B." }); return; }
      if (!shs.length || shs.some((x) => x.name.length < 3 || x.pct <= 0)) { res.status(400).json({ error: "List each shareholder with the percentage they own." }); return; }
      company = JSON.stringify({ name: cname, regNo, address, directors: dirs, shareholders: shs });
    }
    const lat = Number.isFinite(Number(b.lat)) && b.lat !== null && b.lat !== "" ? Number(b.lat) : null, lng = Number.isFinite(Number(b.lng)) && b.lng !== null && b.lng !== "" ? Number(b.lng) : null;
    const idNo = str(b.idNo, 20).toUpperCase();
    if (mode === "apply" && applicant === "person" && idNo.replace(/[^A-Z0-9]/g, "").length < 5) { res.status(400).json({ error: "Enter your ID number." }); return; }
    const idMatch = ["strong", "weak", "unverified"].includes(String(b.idMatch)) ? String(b.idMatch) : "", idSource = b.idSource === "photo" ? "photo" : "scan";
    const fee = mode === "apply" ? feeOf(permits) : 0;
    const token = crypto.randomBytes(12).toString("hex");
    const r = await pool.query(
      `INSERT INTO permit_apps (token,mode,permits,name,phone,phone2,email,county,ward,sublocation,location,village,place_text,lat,lng,use_type,kra_pin,fee,id_no,id_match,id_source,applicant,company)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'domestic',$16,$17,$18,$19,$20,$21,$22) RETURNING id`,
      [token, mode, permits, name, phone, str(b.phone2, 20).replace(/[^\d+]/g, ""), email, str(b.county, 60), str(b.ward, 60), str(b.subLocation, 60), str(b.location, 60), str(b.village, 60), str(b.placeText, 200), lat, lng, kra, fee, idNo, idMatch, idSource, applicant, company]);
    const id = r.rows[0].id as number;
    res.json({ token, ref: ref(id), fee, item: `Permit fees ${ref(id)}` });
  } catch { res.status(500).json({ error: "Could not save. Please try again." }); }
});

router.post("/permits/:token/file", async (req, res) => {
  try {
    await ensure();
    const kind = String(req.body?.kind ?? ""), data = String(req.body?.data ?? "");
    if (!okKind(kind)) { res.status(400).json({ error: "Unknown document." }); return; }
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 1_300_000) { res.status(400).json({ error: "Use a photo (JPG or PNG)." }); return; }
    const a = (await pool.query("SELECT 1 FROM permit_apps WHERE token=$1", [req.params.token])).rows[0];
    if (!a) { res.status(404).json({ error: "Application not found." }); return; }
    await pool.query("INSERT INTO permit_files (app_token, kind, data) VALUES ($1,$2,$3) ON CONFLICT (app_token, kind) DO UPDATE SET data=EXCLUDED.data, created_at=now()", [req.params.token, kind, data]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not save the photo." }); }
});

// Last step of the form: tell us the documents are in, so you are alerted and the client gets an email.
router.post("/permits/:token/done", async (req, res) => {
  try {
    await ensure();
    const a = (await pool.query("SELECT id, name, phone, email, mode, permits, fee, applicant, company FROM permit_apps WHERE token=$1", [req.params.token])).rows[0];
    if (!a) { res.status(404).json({ error: "Application not found." }); return; }
    const kinds = (await pool.query("SELECT kind FROM permit_files WHERE app_token=$1", [req.params.token])).rows.map((x) => x.kind as string);
    const isCo = a.applicant === "company";
    let ndir = 0; try { ndir = (JSON.parse(a.company || "{}").directors ?? []).length; } catch { ndir = 0; }
    const need = a.mode !== "apply" ? [] : isCo ? ["land", "co_cert", "co_kra", "co_cr12"] : ["land"];
    const miss = need.filter((k) => !kinds.includes(k));
    if (miss.length) { res.status(400).json({ error: isCo ? "Upload the company documents and the land proof first." : "Upload your land proof first." }); return; }
    if (a.mode === "self" && !kinds.some((k) => k.startsWith("cert_"))) { res.status(400).json({ error: "Upload your WARMA or NEMA certificate." }); return; }
    smsOwner(`New permit ${a.mode === "apply" ? "application (apply for client)" : "certificate upload"} ${ref(a.id)}: ${a.name} (${a.phone}), ${a.permits}${a.fee ? `, fee KSh ${a.fee.toLocaleString("en-KE")}` : ""}.`);
    emailClient(a.email, `We received your permit details (${ref(a.id)})`, `Hello ${a.name},\n\nWe received your ${a.mode === "apply" ? "permit application details" : "permit documents"}. Your reference is ${ref(a.id)}. We will contact you on ${a.phone}.`, { text: "Visit our site", url: siteUrl() });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Something went wrong." }); }
});

/* admin */
const guard = (req: { header(n: string): string | undefined }) => isAdminKey(req.header("x-admin-key"));
router.get("/admin/permits", async (req, res) => {
  if (!guard(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensure();
    const r = await pool.query(`SELECT a.*, COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.item = 'Permit fees PR' || LPAD(a.id::text,4,'0') AND p.status='paid'),0)::float AS paid,
      ARRAY(SELECT kind FROM permit_files f WHERE f.app_token=a.token) AS files FROM permit_apps a ORDER BY a.id DESC LIMIT 300`);
    res.json(r.rows.map((a) => ({ id: a.id, ref: ref(a.id), mode: a.mode, permits: a.permits, name: a.name, phone: a.phone, phone2: a.phone2, email: a.email, county: a.county, ward: a.ward, subLocation: a.sublocation, location: a.location, village: a.village, placeText: a.place_text, lat: a.lat, lng: a.lng, useType: a.use_type, idNo: a.id_no, idMatch: a.id_match, idSource: a.id_source, kraPin: a.kra_pin, applicant: a.applicant, company: (() => { try { return a.company ? JSON.parse(a.company) : null; } catch { return null; } })(), fee: a.fee, paid: a.paid, status: a.status, notes: a.notes, files: a.files, token: a.token, createdAt: a.created_at })));
  } catch { res.status(500).json({ error: "Could not load." }); }
});
router.get("/admin/permits/:id/file/:kind", async (req, res) => {
  if (!guard(req)) { res.status(403).json({ error: "Admin only" }); return; }
  const r = (await pool.query("SELECT f.data FROM permit_files f JOIN permit_apps a ON a.token=f.app_token WHERE a.id=$1 AND f.kind=$2", [Number(req.params.id) || 0, String(req.params.kind)])).rows[0];
  if (!r) { res.status(404).end(); return; }
  const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(r.data as string);
  if (!m) { res.status(404).end(); return; }
  res.setHeader("Cache-Control", "private, no-store"); res.type(m[1]).send(Buffer.from(m[2], "base64"));
});
router.patch("/admin/permits/:id", async (req, res) => {
  if (!guard(req)) { res.status(403).json({ error: "Admin only" }); return; }
  const status = ["new", "working", "submitted", "approved", "closed"].includes(String(req.body?.status)) ? String(req.body.status) : "new";
  await pool.query("UPDATE permit_apps SET status=$2, notes=$3 WHERE id=$1", [Number(req.params.id) || 0, status, str(req.body?.notes, 500)]);
  res.json({ ok: true });
});

export default router;
