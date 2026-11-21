import { shareButtons } from "../lib/shareButtons";
import { stampSvg, stampDate } from "../lib/companyStamp";
import { Router, type Request } from "express";
import { isAdminKey } from "../lib/adminAuth";
import crypto from "node:crypto";
import { pool, db, servicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { smsOwner } from "./payments";
import { emailClient, siteUrl as ownSite } from "../lib/mailer";
import { buildQuotePdf, contactLines } from "../lib/quotePdf";
import { companyInfo, DEFAULT_NEXT_STEP } from "../lib/company";
import { LOGO_PNG_B64 } from "../lib/logoData";
import { buildLines, cleanTemplate, templateProblems, depositOf, perMetreTotal, DEFAULT_TEMPLATES, type BuiltLine, type BuiltQuote, type QuoteTemplate } from "../lib/quoteLines";
import { JOB_TYPES, suggestType } from "../lib/jobSteps";
import { buildSolarQuote, SOLAR_TYPE_LABEL } from "../lib/solarQuote";
import { buildPumpQuote, POWER_LABEL, type PumpPower, type PumpSand } from "../lib/pumpQuote";

// Quotes: the admin builds one for a client (or the client makes one on the site), the client opens a printable page or a PDF and can pay the deposit from it.
// Services that have a "quote lines" template get an itemised quote; the lines are a breakdown of the SAME total the site shows (see ../lib/quoteLines.ts).
const router = Router();
const isAdmin = (req: Request) => isAdminKey(req.header("x-admin-key"));

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quotes (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'service',
        item TEXT NOT NULL,
        casing TEXT NOT NULL DEFAULT '',
        depth NUMERIC NOT NULL DEFAULT 0,
        rate NUMERIC NOT NULL DEFAULT 0,
        total NUMERIC NOT NULL,
        deposit_pct INTEGER NOT NULL DEFAULT 70,
        note TEXT NOT NULL DEFAULT '',
        valid_days INTEGER NOT NULL DEFAULT 14,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin';
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS lines JSONB;
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS footer TEXT NOT NULL DEFAULT '';
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS custom_price BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS next_step TEXT NOT NULL DEFAULT '';
      CREATE TABLE IF NOT EXISTS quote_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS nema_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS pump_report_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS warma_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS size TEXT NOT NULL DEFAULT '';
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS report_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE quotes ADD COLUMN IF NOT EXISTS agreed_total NUMERIC;
      CREATE TABLE IF NOT EXISTS quote_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        needs_depth BOOLEAN NOT NULL DEFAULT FALSE,
        lines JSONB NOT NULL DEFAULT '[]',
        footer TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE quote_templates ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '[]'`);
    // the templates from the real quotations are put in when missing; an existing template (and any edit the admin made) is never overwritten
    for (const t of DEFAULT_TEMPLATES) {
      await pool.query("INSERT INTO quote_templates (id,name,needs_depth,lines,footer,options) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING", [t.id, t.name, t.needsDepth, JSON.stringify(t.lines), t.footer, JSON.stringify(t.options ?? [])]);
    }
    // test pumping is its own service (KSh 80,000), so the line "24 hr test pumping" is taken out of the stored drilling quote template, once (a line the admin adds back later stays)
    await pool.query("CREATE TABLE IF NOT EXISTS applied_fixes (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    if (!(await pool.query("SELECT 1 FROM applied_fixes WHERE id='drilling-no-test-pumping'")).rowCount) {
      await pool.query("UPDATE quote_templates SET lines=COALESCE((SELECT jsonb_agg(l ORDER BY o) FROM jsonb_array_elements(lines) WITH ORDINALITY AS t(l,o) WHERE NOT (COALESCE(l->>'description','') ~* '^24 hr test pumping')),'[]'::jsonb) WHERE id='drilling'");
      await pool.query("INSERT INTO applied_fixes (id) VALUES ('drilling-no-test-pumping') ON CONFLICT DO NOTHING");
    }
    // the drilling quote follows the owner's sample (mobilization in its own table, drilling fixed at KSh 3,850 a metre, Transport, auto-balancing Labor, surface casing rate): the stored template is replaced ONCE; old quotes and contracts keep their lines
    if (!(await pool.query("SELECT 1 FROM applied_fixes WHERE id='drilling-sample-layout-1'")).rowCount) {
      const dr = DEFAULT_TEMPLATES.find((t) => t.id === "drilling")!;
      await pool.query("UPDATE quote_templates SET lines=$1, footer=$2, updated_at=now() WHERE id='drilling'", [JSON.stringify(dr.lines), dr.footer]);
      await pool.query("INSERT INTO applied_fixes (id) VALUES ('drilling-sample-layout-1') ON CONFLICT DO NOTHING");
    }
    // the usual mobilization on the drilling quote is now KSh 150,000 (it was 100,000): changed once, and only while the stored amount is still the old 100,000 (an amount the admin set is never touched)
    if (!(await pool.query("SELECT 1 FROM applied_fixes WHERE id='drilling-mob-150'")).rowCount) {
      await pool.query("UPDATE quote_templates SET lines=(SELECT jsonb_agg(CASE WHEN l->>'kind'='mob' AND (l->>'rate')::int=100000 THEN jsonb_set(l,'{rate}','150000') ELSE l END ORDER BY o) FROM jsonb_array_elements(lines) WITH ORDINALITY AS t(l,o)) WHERE id='drilling' AND jsonb_array_length(lines)>0");
      await pool.query("INSERT INTO applied_fixes (id) VALUES ('drilling-mob-150') ON CONFLICT DO NOTHING");
    }
    // the purification sizes were first added without prices; give them their starting prices once, and only while none has been set (the admin's own prices are never touched)
    const pur = DEFAULT_TEMPLATES.find((t) => t.id === "purification");
    if (pur?.options) await pool.query("UPDATE quote_templates SET options=$1 WHERE id='purification' AND NOT jsonb_path_exists(options, '$[*] ? (@.price > 0)')", [JSON.stringify(pur.options)]);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const kes = (n: number) => `KSh ${Math.round(n).toLocaleString("en-KE")}`;
const money = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.00`;
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const normPhone = (v: unknown) => {
  const d = String(v ?? "").replace(/\D/g, "");
  if (/^254\d{9}$/.test(d)) return d;
  if (/^0\d{9}$/.test(d)) return `254${d.slice(1)}`;
  if (/^\d{9}$/.test(d)) return `254${d}`;
  if (/^[1-9]\d{7,14}$/.test(d)) return d; // a number from another country, full international digits
  return "";
};
// the list never carries the line items (they can be long); "itemised" says whether the quote has them
const COLS = `agreed_total::float AS "agreedTotal", id, token, name, phone, kind, item, casing, depth::float AS depth, rate::float AS rate, total::float AS total, deposit_pct AS "depositPct", note, valid_days AS "validDays", source, size, custom_price AS "customPrice", (lines IS NOT NULL) AS itemised, location, lat, lng, report_url AS "reportUrl", nema_url AS "nemaUrl", warma_url AS "warmaUrl", pump_report_url AS "pumpReportUrl", created_at AS "createdAt"`;
const COLS_FULL = `${COLS}, lines, footer, next_step AS "nextStep"`;

// The "Next step" wording is one setting for all new quotes; each quote keeps a copy of what it said when it was made.
async function nextStepText(): Promise<string> {
  const r = await pool.query("SELECT value FROM quote_settings WHERE key='next_step'");
  return r.rows[0] ? String(r.rows[0].value) : DEFAULT_NEXT_STEP;
}
router.get("/admin/quote-settings", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try { await ensureTable(); res.json({ nextStep: await nextStepText(), defaultNextStep: DEFAULT_NEXT_STEP, contacts: contactLines(companyInfo()), email: !!companyInfo().email, website: !!companyInfo().website }); }
  catch { res.status(500).json({ error: "Could not load." }); }
});
router.put("/admin/quote-settings", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTable();
    const v = str(req.body?.nextStep, 700);
    await pool.query("INSERT INTO quote_settings (key,value) VALUES ('next_step',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [v]);
    res.json({ nextStep: v });
  } catch { res.status(500).json({ error: "Could not save." }); }
});

const STEEL_RATE = 6500;
const DEPOSIT_PCT = 70;
// Survey offer (the owner's instruction): the survey quote adds up to KSh 35,000, the client saves KSh 2,000 and pays KSh 33,000. Keep in step with REGULAR_PRICE / OFFER_PRICE in OfferPopup.tsx.
const SURVEY_STANDARD = 35000, SURVEY_OFFER = 33000;

/* ------------------------------------------------------------- quote line templates (edited in the admin) */
/** Job types a template can be made for. "Other / product delivery" is left out: it has no single price to break down. */
const TEMPLATE_TYPES = [...JOB_TYPES.filter((t) => t.id !== "other").map((t) => ({ id: t.id, label: t.label })), { id: "testpump", label: "Test pumping" }, { id: "flushing", label: "Borehole flushing" }, { id: "opendrill", label: "Open borehole drilling" }];
/** Which quote template a service uses. Test pumping has its own (it is not "pump installation"). */
const quoteTypeOf = (serviceName: string) => (/test.?pump/i.test(serviceName) ? "testpump" : /flush/i.test(serviceName) ? "flushing" : /open\s+(borehole\s+)?drill/i.test(serviceName) ? "opendrill" : suggestType(serviceName, "service"));
// Casing (PVC or steel) only applies to drilling. Flushing is priced per metre at one rate.
const usesCasing = (serviceName: string) => !/flush|open\s+(borehole\s+)?drill/i.test(serviceName);

async function loadTemplate(id: string): Promise<QuoteTemplate | null> {
  const r = await pool.query("SELECT id, name, needs_depth, lines, footer, options FROM quote_templates WHERE id=$1", [id]);
  const row = r.rows[0];
  if (!row) return null;
  const c = cleanTemplate({ name: row.name, needsDepth: row.needs_depth, lines: row.lines, footer: row.footer, options: row.options }, row.id);
  return c.ok ? c.template : null;
}

/** Line items for a quote, or null (the quote then stays a single line). Never throws: a problem here must not stop a quote being made. */
const optionPrice = (t: QuoteTemplate | null, size: string) => t?.options?.find((o) => o.label === size && o.price > 0)?.price ?? 0;
export async function itemise(serviceName: string, perMetre: boolean, depth: number, casing: string, total: number, size = ""): Promise<BuiltQuote | null> {
  try {
    const id = quoteTypeOf(serviceName);
    if (!TEMPLATE_TYPES.some((t) => t.id === id)) return null;
    const t = await loadTemplate(id);
    if (!t || (t.needsDepth && !(perMetre && depth > 0))) return null;
    return buildLines(t, t.needsDepth ? depth : 0, casing, total, size);
  } catch { return null; }
}

const isPerMetre = (unit: string | null) => /metre|meter/i.test(unit ?? "");
const wholePrice = (priceFrom: string | null) => (priceFrom !== null ? Math.round(parseFloat(priceFrom)) : 0);

// Sizes the client can pick, per service (only sizes whose price is set), so the Get a Quote form can show them.
router.get("/quote-options", async (_req, res) => {
  try {
    await ensureTable();
    const svcs = await db.select().from(servicesTable);
    const out: Record<string, { label: string; price: number }[]> = {};
    const cache = new Map<string, QuoteTemplate | null>();
    for (const s of svcs) {
      const id = quoteTypeOf(s.name);
      if (!cache.has(id)) cache.set(id, TEMPLATE_TYPES.some((t) => t.id === id) ? await loadTemplate(id) : null);
      const o = (cache.get(id)?.options ?? []).filter((x) => x.price > 0);
      if (o.length) out[String(s.id)] = o;
    }
    res.json(out);
  } catch { res.json({}); }
});

router.get("/admin/quote-templates", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTable();
    const r = await pool.query("SELECT id FROM quote_templates ORDER BY id");
    const templates: QuoteTemplate[] = [];
    for (const { id } of r.rows) { const t = await loadTemplate(id); if (t) templates.push(t); }
    res.json({ templates, defaults: DEFAULT_TEMPLATES, types: TEMPLATE_TYPES, steelRate: STEEL_RATE });
  } catch { res.status(500).json({ error: "Could not load the quote lines." }); }
});

router.put("/admin/quote-templates/:id", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTable();
    const type = TEMPLATE_TYPES.find((t) => t.id === req.params.id);
    if (!type) { res.status(400).json({ error: "Unknown job type." }); return; }
    const c = cleanTemplate({ ...(req.body ?? {}), name: req.body?.name || type.label }, type.id);
    if (!c.ok) { res.status(400).json({ error: c.error }); return; }
    const t = c.template;
    await pool.query(
      `INSERT INTO quote_templates (id,name,needs_depth,lines,footer,options,updated_at) VALUES ($1,$2,$3,$4,$5,$6,now())
       ON CONFLICT (id) DO UPDATE SET name=$2, needs_depth=$3, lines=$4, footer=$5, options=$6, updated_at=now()`,
      [t.id, t.name, t.needsDepth, JSON.stringify(t.lines), t.footer, JSON.stringify(t.options ?? [])]);
    res.json(t);
  } catch { res.status(500).json({ error: "Could not save the quote lines." }); }
});

// Builds the lines for a template that is still being edited (nothing is saved). Uses the same function as real quotes.
router.post("/admin/quote-templates/preview", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTable();
    const b = req.body ?? {};
    const id = String(b.id ?? "preview").slice(0, 30);
    const c = cleanTemplate(b.template, id);
    if (!c.ok) { res.json({ ok: false, error: c.error, built: null, problems: [c.error] }); return; }
    const t = c.template;
    const depth = t.needsDepth ? Math.min(600, Math.max(0, Math.round(num(b.depth)))) : 0;
    const casing = b.casing === "steel" ? "steel" : "pvc";
    const size = t.options?.length ? (t.options.find((o) => o.label === str(b.size, 40)) ?? t.options.find((o) => o.price > 0) ?? t.options[0]!).label : "";

    // the price the site shows for this kind of service (the first matching service), unless a price was typed in
    const svcs = await db.select().from(servicesTable);
    const svc = svcs.find((s) => quoteTypeOf(s.name) === id && wholePrice(s.priceFrom) > 0 && (!t.needsDepth || isPerMetre(s.priceUnit)));
    let siteTotal: number | null = null;
    if (size) siteTotal = optionPrice(t, size) || null; // sold in sizes: the price of the chosen size
    else if (svc) siteTotal = t.needsDepth ? (depth > 0 ? perMetreTotal(depth, casing === "steel" ? STEEL_RATE : wholePrice(svc.priceFrom)) : null) : wholePrice(svc.priceFrom);
    const typed = Math.round(num(b.total));
    let total = typed > 0 ? typed : siteTotal;
    const problems: string[] = [];
    if (t.needsDepth && depth < 1) problems.push("Enter a depth to see the lines.");
    let built: BuiltQuote | null = null;
    try {
      if (total === null && (!t.needsDepth || depth > 0)) { // no matching service on the site: show the template at its own total
        const own = buildLines(t, depth, casing, 1_000_000, size);
        total = own ? own.templateTotal : null;
      }
      if (total && (!t.needsDepth || depth > 0)) built = buildLines(t, depth, casing, total, size);
    } catch { problems.push("The lines could not be made to add up. Check the rates and quantities."); }
    if (!t.needsDepth || depth > 0) problems.push(...templateProblems(t, built));
    if (built && built.lines.some((l) => l.kind === "line" && l.description.includes("Rounding adjustment"))) problems.push("A small \"Rounding adjustment\" line was needed because no line has a quantity of 1. Add a lump-sum (quantity 1) line to avoid it.");
    if (size && !optionPrice(t, size)) problems.push(`The price for "${size}" is not set yet, so clients cannot choose that size.`);
    res.json({ ok: true, built, total, siteTotal, service: svc?.name ?? null, depth, casing, size, problems });
  } catch { res.status(500).json({ error: "Could not build the preview." }); }
});

/* ------------------------------------------------------------- admin quotes */
router.get("/admin/quotes", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try { await ensureTable(); res.json((await pool.query(`SELECT ${COLS} FROM quotes ORDER BY id DESC LIMIT 200`)).rows); }
  catch { res.json([]); }
});

router.post("/admin/quotes", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTable();
    const b = req.body ?? {};
    const item = str(b.item, 160), total = Math.round(num(b.total));
    if (!item || total < 1) { res.status(400).json({ error: "Choose the service and enter the price." }); return; }
    const pct = Math.min(100, Math.max(1, Math.round(num(b.depositPct) || 70)));
    const kind = b.kind === "product" ? "product" : "service";
    const casing = /flush|open\s+(borehole\s+)?drill/i.test(item) ? "" : str(b.casing, 20) === "steel" ? "steel" : str(b.casing, 20) ? "pvc" : "";
    const depth = Math.round(num(b.depth));
    const size = str(b.size, 40);

    // itemise when the service has a template; if the admin typed his own price, the lines are scaled to it and the quote is marked "custom price"
    let built: BuiltQuote | null = null, custom = false;
    if (kind === "service") {
      const [svc] = await db.select().from(servicesTable).where(eq(servicesTable.name, item));
      if (svc) {
        const perMetre = isPerMetre(svc.priceUnit), price = wholePrice(svc.priceFrom);
        const tpl = await loadTemplate(quoteTypeOf(svc.name));
        const sized = optionPrice(tpl, size);
        built = await itemise(svc.name, perMetre, perMetre ? depth : 0, perMetre ? (casing || "pvc") : "", total, sized ? size : "");
        if (sized) custom = total !== sized;
        else if (price > 0 && (!perMetre || depth > 0)) custom = total !== (perMetre ? perMetreTotal(depth, (casing || "pvc") === "steel" ? STEEL_RATE : price) : price);
      }
    }
    const r = await pool.query(
      `INSERT INTO quotes (token,name,phone,kind,item,casing,depth,rate,total,deposit_pct,note,valid_days,lines,footer,custom_price,next_step,size) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING ${COLS}`,
      [crypto.randomBytes(12).toString("hex"), str(b.name, 100), normPhone(b.phone), kind, item, casing, depth, num(b.rate), total, pct, str(b.note, 500),
        Math.min(90, Math.max(1, Math.round(num(b.validDays) || 14))), built ? JSON.stringify(built.lines) : null, built ? built.footer : "", custom, await nextStepText(), optionPrice(await loadTemplate(quoteTypeOf(item)), size) ? size : ""]);
    res.json(r.rows[0]);
  } catch { res.status(500).json({ error: "Could not save the quote." }); }
});

// Owner sets (or clears) "Our best price" on an existing quote. Per-metre services take the price per metre; the rest take a total.
router.put("/admin/quotes/:id/best", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTable();
    const r = await pool.query("SELECT id, depth::float AS depth, total::float AS total FROM quotes WHERE id=$1", [Number(req.params.id) || 0]);
    const q = r.rows[0]; if (!q) { res.status(404).json({ error: "Quote not found" }); return; }
    const v = Math.round(num(req.body?.price));
    if (!req.body?.price) { await pool.query("UPDATE quotes SET agreed_total=NULL WHERE id=$1", [q.id]); res.json({ ok: true, agreedTotal: 0 }); return; }
    const a = q.depth > 0 ? v * Math.round(q.depth) : v;
    if (!Number.isFinite(a) || a < 1) { res.status(400).json({ error: "Enter the best price." }); return; }
    if (a >= q.total) { res.status(400).json({ error: "The best price must be lower than the standard price." }); return; }
    await pool.query("UPDATE quotes SET agreed_total=$1 WHERE id=$2", [a, q.id]);
    res.json({ ok: true, agreedTotal: a });
  } catch { res.status(500).json({ error: "Could not save." }); }
});
router.delete("/admin/quotes/:id", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try { await ensureTable(); await pool.query("DELETE FROM quotes WHERE id=$1", [Number(req.params.id) || 0]); res.json({ ok: true }); }
  catch { res.status(500).json({ error: "Could not delete." }); }
});

/* ------------------------------------------------------------- instant quote (made by the client, no admin needed) */
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs = 600_000) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return true; }
  list.push(now); hits.set(key, list);
  return false;
}

// A client may attach the geologist's report (photo or PDF). The browser uploads it straight to Cloudinary with this one-use signature; the file lands in its own folder.
router.post("/quotes/report-sign", (req, res) => {
  if (limited(`rs-ip:${req.ip ?? "x"}`, 10)) { res.status(429).json({ error: "Too many uploads just now. Please wait a few minutes." }); return; }
  const name = (process.env.CLOUDINARY_CLOUD_NAME ?? "").trim(), key = (process.env.CLOUDINARY_API_KEY ?? "").trim(), secret = (process.env.CLOUDINARY_API_SECRET ?? "").trim();
  if (!name || !key || !secret) { res.status(503).json({ error: "Uploads are not available right now. You can send the report on WhatsApp instead." }); return; }
  const timestamp = Math.floor(Date.now() / 1000), folder = "geologist-reports";
  const signature = crypto.createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest("hex");
  res.json({ cloudName: name, apiKey: key, timestamp, signature, folder });
});

// The client sends only the service, casing, depth, name and phone (plus optional location and report). The price is worked out here from the service price in the database.
router.post("/quotes/instant", async (req, res) => {
  try {
    await ensureTable();
    const b = req.body ?? {};
    const name = str(b.name, 80), phone = normPhone(b.phone);
    if (name.length < 2) { res.status(400).json({ error: "Enter your name." }); return; }
    if (!phone) { res.status(400).json({ error: "Enter a valid phone number, like 0712 345 678." }); return; }
    if (limited(`iq-ip:${req.ip ?? "x"}`, 12) || limited(`iq-phone:${phone}`, 5)) { res.status(429).json({ error: "Too many quotes just now. Please wait a few minutes and try again." }); return; }

    // one or several services: [{ serviceId, casing, depth }]. The old single-service fields still work.
    const asked: { serviceId: unknown; casing?: unknown; depth?: unknown; size?: unknown; power?: unknown; yieldLph?: unknown; staticLevel?: unknown; pumpingLevel?: unknown; delivery?: unknown; sand?: unknown; solarType?: unknown; solarKw?: unknown; solarPacks?: unknown; solarMount?: unknown }[] = Array.isArray(b.items) && b.items.length ? b.items : [{ serviceId: b.serviceId, casing: b.casing, depth: b.depth, size: b.size, power: b.power, yieldLph: b.yieldLph, staticLevel: b.staticLevel, pumpingLevel: b.pumpingLevel, delivery: b.delivery, sand: b.sand }];
    if (asked.length > 6) { res.status(400).json({ error: "You can quote up to 6 services at a time." }); return; }
    const picked: { svc: typeof servicesTable.$inferSelect; perMetre: boolean; casing: string; depth: number; rate: number; total: number; size: string; built: BuiltQuote | null }[] = [];
    for (const it of asked) {
      const [svc] = await db.select().from(servicesTable).where(eq(servicesTable.id, Math.round(Number(it?.serviceId)) || 0));
      if (!svc) { res.status(400).json({ error: "Choose a service." }); return; }
      if (picked.some((x) => x.svc.id === svc.id)) { res.status(400).json({ error: "Each service can be added only once." }); return; }
      if (/solar/i.test(svc.name) && !/pump/i.test(svc.name)) { // solar installation: priced line by line from the system type and size
        const r = buildSolarQuote({ type: it.solarType, kw: it.solarKw, packs: it.solarPacks, mount: it.solarMount });
        if (!r.ok) { res.status(400).json({ error: r.error }); return; }
        picked.push({ svc, perMetre: false, casing: "", depth: 0, rate: 0, total: r.built.total, size: `${SOLAR_TYPE_LABEL[it.solarType as "grid"]}, ${r.kw} kW`, built: r.built });
        continue;
      }
      if (/pump/i.test(svc.name) && !/test.?pump/i.test(svc.name)) { // pump installation: the pump is sized from the borehole details and priced line by line
        const opt = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));
        const power = (["grid", "solar", "generator"] as const).find((x) => x === it.power);
        if (!power) { res.status(400).json({ error: `Choose the power source for ${svc.name}: grid electricity, solar or generator.` }); return; }
        const r = buildPumpQuote({ power: power as PumpPower, depth: Number(it.depth), yieldLph: Number(it.yieldLph), staticLevel: opt(it.staticLevel), pumpingLevel: opt(it.pumpingLevel), delivery: opt(it.delivery), sand: (["some", "sandy"] as const).find((x) => x === it.sand) ?? ("clear" as PumpSand) });
        if (!r.ok) { res.status(400).json({ error: r.error }); return; }
        picked.push({ svc, perMetre: false, casing: "", depth: 0, rate: 0, total: r.built.total, size: POWER_LABEL[power], built: r.built });
        continue;
      }
      const price = wholePrice(svc.priceFrom);
      const perMetre = isPerMetre(svc.priceUnit);
      let casing = "", depth = 0, rate = 0, total = 0, size = "";
      const tpl = await loadTemplate(quoteTypeOf(svc.name));
      if (tpl?.options?.some((o) => o.price > 0)) { // sold in sizes (for example water purification): the client picks one, and the price is that size's price
        const opt = tpl.options.find((o) => o.label === str(it.size, 40) && o.price > 0);
        if (!opt) { res.status(400).json({ error: `Choose the size you need for ${svc.name}.` }); return; }
        size = opt.label; total = opt.price;
      } else if (perMetre) {
        depth = Math.round(num(it.depth));
        if (depth < 1 || depth > 600) { res.status(400).json({ error: `Enter the depth in metres for ${svc.name}, between 1 and 600.` }); return; }
        casing = usesCasing(svc.name) ? (it.casing === "steel" ? "steel" : "pvc") : "";
        rate = casing === "steel" ? STEEL_RATE : price;
        total = perMetreTotal(depth, rate);
      } else {
        total = price;
      }
      if (!(total > 0)) { res.status(400).json({ error: `${svc.name} is priced on request. Please call or WhatsApp us for a price.` }); return; }
      picked.push({ svc, perMetre, casing, depth, rate, total, size, built: await itemise(svc.name, perMetre, depth, casing, total, size) }); // the lines are a breakdown of this same total
    }
    // A survey always comes first: it is the first step for anyone who needs a borehole.
    picked.sort((a, b) => Number(/survey/i.test(b.svc.name)) - Number(/survey/i.test(a.svc.name)));

    let total = 0, itemName = "", casing = "", depth = 0, rate = 0, size = "";
    let built: BuiltQuote | null = null;
    if (picked.length === 1) {
      const p1 = picked[0]!;
      ({ total, casing, depth, rate, built, size } = p1); itemName = p1.svc.name;
    } else {
      // several services: one section per service, the lines numbered straight through, and the total is the sum of the service totals
      const lines: BuiltLine[] = [];
      const footers: string[] = [];
      let sn = 0;
      for (const p1 of picked) {
        lines.push({ kind: "section", sn: null, description: p1.svc.name, unit: "", qty: null, rate: null, amount: null, rateOnly: false });
        const own = p1.built && p1.built.lines.length
          ? p1.built.lines
          : [{ kind: "line", sn: 1, description: p1.svc.name, unit: "Ls", qty: 1, rate: p1.total, amount: p1.total, rateOnly: false } as BuiltLine];
        for (const l of own) { if (l.kind === "mob" || l.kind === "sum") continue; lines.push(l.kind === "section" ? l : { ...l, sn: ++sn }); }
        if (p1.built?.footer && !footers.includes(p1.built.footer)) footers.push(p1.built.footer);
        total += p1.total;
      }
      itemName = picked.map((x) => x.svc.name).join(" + ").slice(0, 150);
      built = { lines, total, templateTotal: total, footer: footers.join("\n") };
    }

    // where the borehole will be (typed, or from the map pin / phone location), and the optional geologist report
    const location = str(b.location, 300);
    const lat = Number(b.lat), lng = Number(b.lng);
    const hasPin = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);
    const cloud = (process.env.CLOUDINARY_CLOUD_NAME ?? "").trim();
    const ownFile = (v: unknown) => (cloud && typeof v === "string" && v.startsWith(`https://res.cloudinary.com/${cloud}/`) && v.length < 600 ? v : "");
    const reportUrl = ownFile(b.reportUrl), nemaUrl = ownFile(b.nemaUrl), warmaUrl = ownFile(b.warmaUrl), pumpReportUrl = ownFile(b.pumpReportUrl); // only files uploaded to our own storage are accepted

    const r = await pool.query(
      `INSERT INTO quotes (token,name,phone,kind,item,casing,depth,rate,total,deposit_pct,note,valid_days,source,lines,footer,location,lat,lng,report_url,next_step,size,nema_url,warma_url,pump_report_url) VALUES ($1,$2,$3,'service',$4,$5,$6,$7,$8,$9,'',14,'client',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING ${COLS}`,
      [crypto.randomBytes(12).toString("hex"), name, phone, itemName, casing, depth, rate, total, DEPOSIT_PCT, built ? JSON.stringify(built.lines) : null, built ? built.footer : "",
        location, hasPin ? lat : null, hasPin ? lng : null, reportUrl, await nextStepText(), size, nemaUrl, warmaUrl, pumpReportUrl]);
    const q = r.rows[0];
    // "Our best price": only the owner (admin login) can set it, for a single service, and it must be lower than the standard price
    let agreedTotal = 0;
    if (isAdmin(req) && picked.length === 1) {
      const p1 = picked[0]!;
      const a = p1.perMetre && depth > 0 ? Math.round(num(b.agreedRate)) * depth : Math.round(num(b.agreedTotal));
      if (Number.isFinite(a) && a > 0 && a < total) { agreedTotal = a; await pool.query("UPDATE quotes SET agreed_total=$1 WHERE id=$2", [a, q.id]); }
    }
    // A survey quote at the standard KSh 35,000 carries the KSh 33,000 offer (the owner's own lower "best price", set above, wins). The contract then picks 33,000 as the agreed price.
    if (!agreedTotal && picked.length === 1 && quoteTypeOf(picked[0]!.svc.name) === "survey" && total === SURVEY_STANDARD) {
      agreedTotal = SURVEY_OFFER;
      await pool.query("UPDATE quotes SET agreed_total=$1 WHERE id=$2", [agreedTotal, q.id]);
    }
    smsOwner(`New instant quote QT-${String(q.id).padStart(5, "0")}: ${itemName}${depth ? `, ${depth} m ${casing.toUpperCase()}` : ""}${size ? `, ${size}` : ""}, ${kes(total)} for ${name} (${phone}).${location ? ` Site: ${location}.` : ""}${hasPin ? ` Pin: https://maps.google.com/?q=${lat},${lng}` : ""}${reportUrl || nemaUrl || warmaUrl || pumpReportUrl ? ` Documents attached: ${[reportUrl && "survey report", nemaUrl && "NEMA permit", warmaUrl && "WARMA permit", pumpReportUrl && "test pumping report"].filter(Boolean).join(", ")} (see Quotes in the admin).` : ""}`);
    {   // the client gets the quote by email too (only when they typed an address; it is not stored)
      const to = str(b.email, 120).toLowerCase(), host = req.get("x-forwarded-host") || req.get("host") || "";
      if (to) emailClient(to, `Your quote ${`QT-${String(q.id).padStart(5, "0")}`}: ${itemName}`,
        `Hello ${name},\n\nThank you for asking for a quote. Here it is: ${itemName}${size ? `, ${size}` : ""}, ${kes(total)}.\n\nThe quote is valid for ${q.validDays} days. To go ahead, make the contract on our website or call us.`,
        { text: "Open my quote (PDF)", url: `${/^localhost|^127\./.test(host) ? `http://${host}` : ownSite()}/api/quotes/${q.token}/pdf` });
    }
    res.json({
      token: q.token, id: q.id, item: q.item, size: q.size, casing: q.casing, depth: q.depth, rate: q.rate, total: q.total,
      depositPct: q.depositPct, deposit: depositOf(q.total, q.depositPct), validDays: q.validDays,
      lines: built ? noMob(built.lines) : null, footer: built ? built.footer : "", agreedTotal,
    });
  } catch { res.status(500).json({ error: "Could not make the quote. Please try again." }); }
});

/* ------------------------------------------------------------- reading a quote */
// A last safeguard every time a quote is shown: the lines must multiply out and add up to the total exactly. If anything is off (it should never be), the quote falls back to the single-line total instead of showing a wrong table.
export const linesOf = (q: { lines?: unknown; total?: unknown }): BuiltLine[] | null => {
  if (!Array.isArray(q.lines) || !q.lines.length) return null;
  const ls = q.lines as BuiltLine[];
  let sum = 0n;
  for (const l of ls) {
    if (l.kind !== "line" || l.amount === null) continue;
    if (!Number.isInteger(l.amount) || !Number.isInteger(l.qty) || !Number.isInteger(l.rate) || BigInt(l.qty!) * BigInt(l.rate!) !== BigInt(l.amount)) { console.error("quote lines do not multiply out; showing the single-line total"); return null; }
    sum += BigInt(l.amount);
  }
  if (sum !== BigInt(Math.round(Number(q.total)))) { console.error("quote lines do not add up to the total; showing the single-line total"); return null; }
  return ls;
};

// A real PDF file of a quote, built here on the server.
router.get("/quotes/:token/pdf", async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`SELECT ${COLS_FULL} FROM quotes WHERE token=$1`, [String(req.params.token).slice(0, 40)]);
    const q = r.rows[0];
    if (!q) { res.status(404).type("text/plain").send("Quote not found."); return; }
    // where the small Pay button in the PDF leads: SITE_URL if set, else the "site" the page or app passed along; if neither is known there is no button
    const okUrl = (v: unknown) => (typeof v === "string" && /^https?:\/\/[^\s"'<>\\]+$/.test(v.trim()) ? v.trim().replace(/[\/.\s]+$/, "") : "");
    const siteUrl = okUrl(process.env.SITE_URL) || okUrl(req.query.site);
    const buf = buildQuotePdf(
      { agreedTotal: q.agreedTotal, id: q.id, name: q.name, phone: q.phone, item: q.item, size: q.size ?? "", casing: q.casing, depth: q.depth, rate: q.rate, total: q.total, note: q.note, validDays: q.validDays, createdAt: q.createdAt, lines: noMob(linesOf(q)), footer: q.footer ?? "", nextStep: q.nextStep ?? "", payUrl: siteUrl ? `${siteUrl}/?quote=${q.token}` : "" },
      companyInfo());
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="QT-${String(q.id).padStart(5, "0")}.pdf"`);
    res.setHeader("Content-Length", String(buf.length));
    res.send(buf);
  } catch { res.status(500).type("text/plain").send("Could not build the PDF."); }
});

// What the site needs to open the Pay card already filled in.
router.get("/quotes/:token", async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`SELECT ${COLS} FROM quotes WHERE token=$1`, [String(req.params.token).slice(0, 40)]);
    const q = r.rows[0];
    if (!q) { res.status(404).json({ error: "Quote not found" }); return; }
    res.json({ kind: q.kind, item: q.item, total: q.total, name: q.name, phone: q.phone, depositPct: q.depositPct });
  } catch { res.status(500).json({ error: "Could not load the quote." }); }
});

/** The quote does not show the rig mobilization: it is agreed in the contract. */
export const noMob = (lines: BuiltLine[] | null): BuiltLine[] | null => lines ? lines.filter((l) => l.kind !== "mob" && !(l.kind === "sum" && /^(less|balance)/i.test(l.description))) : lines;
export function itemsTable(lines: BuiltLine[], total: number): string {
  let n = 0;
  const mob = lines.find((l) => l.kind === "mob");
  const sums = lines.filter((l) => l.kind === "sum");
  const rows = lines.filter((l) => l.kind === "line" || l.kind === "section").map((l) => {
    if (l.kind === "section") { n = 0; return `<tr class="sec"><td colspan="6">${esc(l.description)}</td></tr>`; }
    const alt = n++ % 2 === 1 ? ' class="alt"' : "";
    return `<tr${alt}><td class="c-sn">${l.sn}</td><td class="d">${esc(l.description)}</td><td class="c-unit">${esc(l.unit)}</td><td class="n">${l.qty ?? ""}</td><td class="n">${l.rate === null ? "" : money(l.rate)}</td><td class="n a">${l.amount === null ? `<span class="ro">${esc(l.label || "Rate only")}</span>` : money(l.amount)}</td></tr>`;
  }).join("");
  // the rig mobilization has its own small table above the numbered items (it is deducted from the total, not added to it)
  const top = mob ? `<div class="tw mobw"><table class="items mobt"><thead><tr><th>Description</th><th class="n">Amount (Ksh)</th></tr></thead><tbody><tr><td class="d">${esc(mob.description)}</td><td class="n a">${money(mob.amount ?? 0)}${mob.label ? `<span class="note">${esc(mob.label)}</span>` : ""}</td></tr></tbody></table></div>` : "";
  const foot = sums.length
    ? sums.map((l, i) => `<tr class="${i === 1 ? "less" : "tot"}"><td colspan="5">${esc(l.description)}</td><td class="n">${money(l.amount ?? 0)}</td></tr>`).join("")
    : `<tr class="tot"><td colspan="5">TOTAL</td><td class="n">${money(total)}</td></tr>`;
  return `${top}<div class="tw"><table class="items"><thead><tr><th class="c-sn">S/N</th><th>Description</th><th class="c-unit">Unit</th><th class="n">Qty</th><th class="n">Rate (Ksh)</th><th class="n">Amount (Ksh)</th></tr></thead><tbody>${rows}${foot}</tbody></table></div>`;
}

router.get("/quotes/:token/page", async (req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(`SELECT ${COLS_FULL} FROM quotes WHERE token=$1`, [String(req.params.token).slice(0, 40)]);
    const q = r.rows[0];
    if (!q) { res.status(404).type("text/plain").send("Quote not found."); return; }
    const co = companyInfo(), company = co.name;
    const made = new Date(q.createdAt), until = new Date(made.getTime() + q.validDays * 86_400_000);
    const d = (x: Date) => x.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "long" });
    const no = `QT-${String(q.id).padStart(5, "0")}`;
    const lines = noMob(linesOf(q));
    const detail = q.size ? `Size: ${q.size}` : q.depth > 0 && q.rate > 0 ? `${q.casing ? `${q.casing.toUpperCase()} casing, ` : ""}${q.depth} m at ${kes(q.rate)} per metre` : "";
    const notes = [q.note, q.footer].map((t) => String(t ?? "").trim()).filter(Boolean);
    const next = String(q.nextStep ?? "").trim();
    const waText = encodeURIComponent(`Hello ${company}, I received quotation ${no} for ${q.item} (${kes(q.total)}). I would like to talk about a contract.`);
    const link = (c: { label: string; value: string }) => {
      const v = esc(c.value);
      if (c.label === "Call") return `<a href="tel:${esc(c.value.replace(/[^\d+]/g, ""))}">${v}</a>`;
      if (c.label === "WhatsApp") return `<a href="https://wa.me/${esc(co.whatsapp)}?text=${waText}">${v}</a>`;
      if (c.label === "Email") return `<a href="mailto:${v}">${v}</a>`;
      return `<a href="${esc(co.website)}">${v}</a>`;
    };
    const contacts = contactLines(co);
    const btns = [
      co.phone ? `<a class="cb" href="tel:${esc(co.phone.replace(/[^\d+]/g, ""))}">Call us</a>` : "",
      co.whatsapp ? `<a class="cb wa" href="https://wa.me/${esc(co.whatsapp)}?text=${waText}">WhatsApp</a>` : "",
      co.email ? `<a class="cb" href="mailto:${esc(co.email)}?subject=${encodeURIComponent(`Quotation ${no}`)}">Email us</a>` : "",
    ].join("");
    const siteQ = /^https?:\/\/[^\s"'<>\\]+$/.test(String(req.query.site ?? "")) ? `?site=${encodeURIComponent(String(req.query.site).replace(/\/+$/, ""))}` : "";
    const linkBase = siteQ ? decodeURIComponent(siteQ.slice(6)) : `${req.protocol}://${req.get("host")}`;
    const pdfUrl = `${linkBase}/api/quotes/${q.token}/pdf${siteQ}`;
    const pageLink = `${linkBase}/api/quotes/${q.token}/page${siteQ}`;   // the public link of this quote: anyone who holds it can open it
    res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quote ${no}</title><style>
*{box-sizing:border-box}body{margin:0;background:#eef2f7;font-family:Inter,system-ui,Arial,sans-serif;color:#0f172a;padding:16px}
.sheet{max-width:${lines ? 820 : 600}px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.12)}
.top{background:linear-gradient(135deg,#0b1d3a,#0a3a80 65%,#14407f);color:#fff;padding:20px 22px;border-bottom:5px solid #f59e0b}
.brand{display:flex;align-items:center;gap:14px}.brand img{width:56px;height:56px;flex:none;object-fit:contain}
.brand h1{margin:0;font-size:21px;line-height:1.15}.brand p{margin:3px 0 0;font-size:11px;letter-spacing:.14em;color:#f59e0b;font-weight:700}
.cts{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:14px;font-size:12px;color:#cbd5e1}.cts b{color:#fff}.cts a{color:#fff;text-decoration:none;font-weight:700}
.body{padding:20px 22px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.box{background:#f1f5f9;border-radius:12px;padding:12px 14px;border-left:4px solid #f59e0b;font-size:13px}.box.b2{border-left-color:#0b1d3a}
.box small{display:block;font-size:10px;letter-spacing:.08em;color:#64748b;font-weight:700;text-transform:uppercase}.box .v{font-size:15px;font-weight:800;margin-top:2px}.box .s{color:#64748b;font-size:12px}
.row{display:flex;justify-content:space-between;gap:10px;margin-top:3px;font-size:12px}.row b{text-align:right}
.svc{margin:16px 0 0;font-size:14px}.svc span{color:#64748b;font-size:12px;display:block}.svc b{font-size:15px}
.tw{margin-top:14px;overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:12px;border:1px solid #cbd5e1}table.items{width:100%;border-collapse:collapse;font-size:12px;min-width:520px}
table.items th{background:#0b1d3a;color:#fff;font-size:10px;padding:9px 7px;text-align:left;text-transform:uppercase;letter-spacing:.04em}
table.items td{border-top:1px solid #e2e8f0;padding:7px;vertical-align:top}table.items .n{text-align:right;white-space:nowrap}table.items td.a{font-weight:700}table.items td.d{white-space:pre-line}
table.items tr.alt td{background:#f8fafc}table.items tr.sec td{background:#dbe7fb;color:#0b1d3a;font-weight:800;border-top:1px solid #c3d4f2}
.mobw{margin-bottom:6px}.mobt .note{display:block;color:#1d4ed8;font-size:10.5px;font-weight:500;margin-top:1px}table.items tr.less td{background:#fff;color:#334155;font-weight:600}
table.items tr.tot td{background:#fef3c7;font-weight:800;font-size:13px;border-top:2px solid #f59e0b;padding:11px 7px}table.items tr.tot td.n{color:#0a4fb3;font-size:16px}
.ro{color:#64748b;font-weight:500}table.items thead{display:table-header-group}table.items tr{page-break-inside:avoid}
.single{margin-top:14px;background:#fef3c7;border-radius:12px;padding:14px;display:flex;justify-content:space-between;align-items:center;font-weight:800}.single span:last-child{font-size:22px;color:#0a4fb3}
.why{margin-top:16px;background:#f1f5f9;border-left:4px solid #f59e0b;border-radius:12px;padding:12px 14px;font-size:13px}.why ul{margin:6px 0 0;padding-left:18px;color:#334155}
.note{margin-top:14px;font-size:13px;color:#334155;white-space:pre-wrap}
.whyrow{display:flex;align-items:center;gap:8px;margin-top:16px}.whyrow .why{flex:1;margin-top:0}.qst{flex:0 0 auto;width:128px;line-height:0}.qst svg{width:128px;height:auto;transform:rotate(-5deg);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.next{margin-top:16px;background:#0b1d3a;color:#fff;border-radius:14px;border-left:5px solid #f59e0b;padding:16px}.next small{color:#f59e0b;font-weight:800;letter-spacing:.1em;font-size:11px}
.next p{margin:6px 0 0;font-size:13px;line-height:1.5;color:#e2e8f0}.cbs{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
a.cb{flex:1;min-width:110px;text-align:center;text-decoration:none;background:#fff;color:#0b1d3a;font-weight:800;font-size:13px;padding:10px;border-radius:10px}a.cb.wa{background:#22c55e;color:#fff}
.btns{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
a.btn,button{flex:1;min-width:150px;text-align:center;text-decoration:none;border:0;background:#0a4fb3;color:#fff;font-weight:700;padding:12px;border-radius:12px;font-size:14px;cursor:pointer;font-family:inherit}
button{background:#fff;color:#0a4fb3;border:1.5px solid #0a4fb3}
.foot{padding:0 22px 20px;font-size:11px;color:#64748b;text-align:center}
@media(max-width:520px){body{padding:8px}.body{padding:14px}.top{padding:16px}.meta{grid-template-columns:1fr}.brand h1{font-size:18px}
table.items{font-size:11px;min-width:0;table-layout:fixed}table.items td,table.items th{padding:6px 4px;overflow-wrap:anywhere}
table.items .c-sn,table.items .c-unit{width:0;padding:0;font-size:0;border:0;overflow:hidden}table.items th:nth-child(2){width:36%}table.items th:nth-child(4){width:11%}table.items th:nth-child(5){width:24%}table.items th:nth-child(6){width:29%}
table.items th{font-size:9px}table.items tr.tot td.n{font-size:13px}}
@page{size:A4;margin:12mm}
@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;max-width:none}.btns,.cbs{display:none}.tw{overflow:visible}.top,.next,table.items th,table.items tr.sec td,table.items tr.tot td,table.items tr.alt td,.box,.why{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
<div class="sheet"><div class="top"><div class="brand"><img src="data:image/png;base64,${LOGO_PNG_B64}" alt="${esc(company)} logo"><div><h1>${esc(company)}</h1><p>QUOTATION</p></div></div>
${contacts.length ? `<div class="cts">${contacts.map((c) => `<span>${esc(c.label)}: ${link(c)}</span>`).join("")}</div>` : ""}</div>
<div class="body"><div class="meta">
<div class="box"><small>Prepared for</small><div class="v">${esc(q.name || "-")}</div>${q.phone ? `<div class="s">+${esc(String(q.phone).replace(/^\+/, ""))}</div>` : ""}</div>
<div class="box b2"><div class="row"><small>Quote no.</small><b style="color:#0a4fb3">${no}</b></div><div class="row"><small>Date</small><b>${esc(d(made))}</b></div><div class="row"><small>Valid until</small><b>${esc(d(until))}</b></div></div></div>
<div class="svc"><span>Service</span><b>${esc(q.item)}</b>${detail ? `<span style="margin-top:2px">${esc(detail)}</span>` : ""}</div>
${lines ? itemsTable(lines, q.total) : `<div class="single"><span>Total price</span><span>${esc(kes(q.total))}</span></div>`}
${Number(q.agreedTotal) > 0 && Number(q.agreedTotal) < Number(q.total) ? `<div class="single" style="background:#dcfce7"><span>Our best price${Number(q.depth) > 0 ? ` <small style="font-weight:600">(${esc(kes(Math.round(q.agreedTotal / q.depth)))} per metre, standard ${esc(kes(Math.round(q.total / q.depth)))})</small>` : ""}</span><span style="color:#166534">${esc(kes(q.agreedTotal))}</span></div><div class="note">You save ${esc(kes(Math.round(q.total - q.agreedTotal)))} on the standard price.</div>` : ""}
${notes.map((t) => `<div class="note">${esc(t)}</div>`).join("")}
<div class="whyrow"><div class="why"><b>Why choose ${esc(company)}</b><ul><li>Quality workmanship and materials</li><li>Timely delivery, with progress updates you can follow</li><li>We serve all 47 counties</li><li>Clear written quotes, no hidden charges</li></ul></div><div class="qst">${stampSvg(stampDate(made))}</div></div>
${next ? `<div class="next"><small>NEXT STEP</small><p>${esc(next)}</p>${btns ? `<div class="cbs">${btns}</div>` : ""}</div>` : ""}
<div class="btns"><a class="btn" href="${esc(pdfUrl)}">Download PDF</a>${shareButtons([{ label: "Copy link", url: pageLink }, { label: "Copy PDF link", url: pdfUrl }], `Quote QT-${String(q.id).padStart(5, "0")}`)}</div></div>
<div class="foot">Thank you for choosing ${esc(company)}. Prices are agreed for the period shown above.</div></div></body></html>`);
  } catch { res.status(500).type("text/plain").send("Could not load the quote."); }
});

export default router;
