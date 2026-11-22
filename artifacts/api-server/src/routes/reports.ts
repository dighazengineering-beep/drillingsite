import express, { Router, type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";
import { isAdminKey } from "../lib/adminAuth";
import { claudeReady } from "../lib/claude";
import { normaliseShot, readSection, researchArea, type Facts } from "../lib/hydroAi";
import { sectionFigure, boreholeFigure, type SectionCalibration } from "../lib/hydroFigures";
import { workedCalculations } from "../lib/hydroCalc";
import { SURVEY_SECTIONS, writeReport, conformance, REFERENCE_LIBRARY, type Flow } from "../lib/hydroWrite";
import { buildDocx, type DocFigure, type DocTable, type DocAppendix } from "../lib/hydroDocx";
import { buildPreviewPdf } from "../lib/hydroPreview";
import { logoPng } from "../lib/hydroAssets";
import { sms, smsOwner } from "./payments";
import { siteUrl } from "../lib/mailer";
import { elevationAt } from "../lib/elevation";
import { tileMap, aerialView, googleHybrid } from "../lib/satMap";
import { aiFigure, conceptualGeology, conceptualHydro, analysedSection } from "../lib/aiFigure";
import { savedDocs, DOC_LABELS } from "./clientDocs";
import { zoneChart, yieldChart, depthBarsFor, flowChart, depthPlanChart, climateChart, type StationRow } from "../lib/hydroFigures";

/** Admin-only report writer (hydrogeological survey reports). Nothing here is reachable without the admin key. */
const router = Router();
const admin = (req: Request, res: Response, next: NextFunction) => (isAdminKey(req.header("x-admin-key")) ? next() : void res.status(401).json({ error: "Admin only" }));

let ready: Promise<void> | null = null;
const ensure = () => (ready ??= (async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hydro_reports (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', progress TEXT NOT NULL DEFAULT '',
      data JSONB NOT NULL DEFAULT '{}', docx BYTEA, error TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS hydro_files (
      id SERIAL PRIMARY KEY, report_id INTEGER NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', mime TEXT NOT NULL DEFAULT 'image/png',
      w INTEGER NOT NULL DEFAULT 0, h INTEGER NOT NULL DEFAULT 0, data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS hydro_files_r ON hydro_files (report_id);
    ALTER TABLE hydro_reports ADD COLUMN IF NOT EXISTS owner_phone TEXT NOT NULL DEFAULT '';
    ALTER TABLE hydro_reports ADD COLUMN IF NOT EXISTS released BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE hydro_reports ADD COLUMN IF NOT EXISTS draft_token TEXT NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS report_credits (
      id SERIAL PRIMARY KEY, phone TEXT NOT NULL, kind TEXT NOT NULL, qty INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ, payment_id INTEGER UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE report_credits ADD COLUMN IF NOT EXISTS member_id INTEGER;
    ALTER TABLE hydro_reports ADD COLUMN IF NOT EXISTS unlocked BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE hydro_reports ADD COLUMN IF NOT EXISTS preview BYTEA;
    ALTER TABLE hydro_reports ADD COLUMN IF NOT EXISTS clean_pdf BYTEA;
    ALTER TABLE hydro_reports ADD COLUMN IF NOT EXISTS member_id INTEGER;
    CREATE INDEX IF NOT EXISTS report_credits_p ON report_credits (phone);
    ALTER TABLE hydro_reports ADD COLUMN IF NOT EXISTS ref_no TEXT NOT NULL DEFAULT '';
    ALTER TABLE hydro_reports ADD COLUMN IF NOT EXISTS resumes INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS report_ref_counters (code TEXT NOT NULL, yr INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (code, yr));
  `);
})().catch((e) => { ready = null; console.error("hydro tables setup failed", e); throw e; }));

const COUNTY_CODES: Record<string, string> = { mombasa: "MSA", kwale: "KWL", kilifi: "KLF", "tana river": "TNR", lamu: "LAM", "taita taveta": "TTV", "taita-taveta": "TTV", garissa: "GRS", wajir: "WJR", mandera: "MDR", marsabit: "MRS", isiolo: "ISL", meru: "MRU", "tharaka nithi": "THN", "tharaka-nithi": "THN", embu: "EMB", kitui: "KTU", machakos: "MCK", makueni: "MKN", nyandarua: "NYD", nyeri: "NYR", kirinyaga: "KRG", "murang'a": "MRG", muranga: "MRG", kiambu: "KBU", turkana: "TRK", "west pokot": "WPK", samburu: "SMB", "trans nzoia": "TNZ", "trans-nzoia": "TNZ", "uasin gishu": "UGS", "elgeyo marakwet": "EMK", "elgeyo-marakwet": "EMK", nandi: "NDI", baringo: "BRG", laikipia: "LKP", nakuru: "NKR", narok: "NRK", kajiado: "KJD", kericho: "KRC", bomet: "BMT", kakamega: "KKG", vihiga: "VHG", bungoma: "BGM", busia: "BSA", siaya: "SYA", kisumu: "KSM", "homa bay": "HMB", migori: "MGR", kisii: "KSI", nyamira: "NYM", nairobi: "NRB" };
/** Unique report number like HGR-MSA-2026-001: county code, year, and a counter that never repeats. Kept when the report is written again. */
async function referenceFor(rid: number, county: string): Promise<string> {
  const have = (await pool.query("SELECT ref_no FROM hydro_reports WHERE id=$1", [rid])).rows[0]?.ref_no as string | undefined;
  if (have) return have;
  const key = county.toLowerCase().replace(/\s+county$/, "").replace(/\s+/g, " ").trim();
  const code = COUNTY_CODES[key] ?? "KEN"; const yr = new Date().getFullYear();
  const n = (await pool.query("INSERT INTO report_ref_counters (code, yr, n) VALUES ($1,$2,1) ON CONFLICT (code, yr) DO UPDATE SET n = report_ref_counters.n + 1 RETURNING n", [code, yr])).rows[0].n as number;
  const ref = `HGR-${code}-${yr}-${String(n).padStart(3, "0")}`;
  await pool.query("UPDATE hydro_reports SET ref_no=$2 WHERE id=$1", [rid, ref]);
  return ref;
}
router.use("/reports", admin, async (_q, _s, next) => { try { await ensure(); next(); } catch (e) { next(e); } });

const id = (req: Request) => Number(req.params.id) || 0;
const getData = async (rid: number) => (await pool.query("SELECT data FROM hydro_reports WHERE id=$1", [rid])).rows[0]?.data as Record<string, any> | undefined;
const setData = (rid: number, d: unknown) => pool.query("UPDATE hydro_reports SET data=$2, updated_at=now() WHERE id=$1", [rid, JSON.stringify(d)]);
/** 254712345678 or 0712345678 -> "+254 712 345 678"; other countries keep their own code with a plus */
const telFmt = (x: unknown): string => {
  let d = String(x ?? "").replace(/\D/g, ""); if (!d) return "";
  if (d.startsWith("0") && d.length === 10) d = "254" + d.slice(1);
  return d.startsWith("254") && d.length === 12 ? `+254 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : `+${d}`;
};
const fileBuf = async (fid: number, rid: number) => (await pool.query("SELECT data, w, h, name, kind FROM hydro_files WHERE id=$1 AND report_id=$2", [fid, rid])).rows[0] as { data: Buffer; w: number; h: number; name: string; kind: string } | undefined;

// reports a client has started (details typed or pictures added) but not yet generated
router.get("/reports/unfinished", async (_q, res) => {
  const r = await pool.query(`SELECT r.id, r.data, r.created_at, r.updated_at, (SELECT count(*) FROM hydro_files f WHERE f.report_id=r.id AND f.kind='section')::int AS pics
    FROM hydro_reports r WHERE r.status='draft' AND r.draft_token<>'' ORDER BY r.updated_at DESC LIMIT 200`);
  res.json({ drafts: r.rows.filter((x) => x.pics > 0 || x.data?.clientName || x.data?.clientPhone || x.data?.county).map((x) => ({ id: x.id, name: x.data?.clientName ?? "", phone: x.data?.clientPhone ?? "", email: x.data?.clientEmail ?? "", where: [x.data?.village, x.data?.subcounty, x.data?.county].filter(Boolean).join(", "), siteRef: x.data?.siteRef ?? "", pics: x.pics, createdAt: x.created_at, updatedAt: x.updated_at })) });
});
router.get("/reports", async (_q, res) => {
  const r = await pool.query("SELECT id, title, ref_no, status, progress, owner_phone, released, created_at, updated_at, docx IS NOT NULL AS has_doc FROM hydro_reports WHERE NOT (status='draft' AND owner_phone='' AND draft_token<>'') ORDER BY (status='review') DESC, id DESC LIMIT 200");
  res.json({ reports: r.rows, ai: claudeReady() });
});
router.post("/reports", async (req, res) => {
  const d = req.body?.data ?? {};
  const r = await pool.query("INSERT INTO hydro_reports (title, data) VALUES ($1,$2) RETURNING id", [String(d.siteRef || d.clientName || "New report").slice(0, 120), JSON.stringify(d)]);
  res.json({ id: r.rows[0].id });
});
router.get("/reports/:id/live", (req, res) => { res.set("Cache-Control", "no-store").json(live.get(Math.floor(Number(req.params.id))) ?? { sections: [], done: false, none: true }); });
router.get("/reports/:id", async (req, res) => {
  const r = await pool.query("SELECT id, title, status, progress, error, data, owner_phone, released, docx IS NOT NULL AS has_doc FROM hydro_reports WHERE id=$1", [id(req)]);
  if (!r.rows[0]) return void res.status(404).json({ error: "Not found" });
  const f = await pool.query("SELECT id, kind, name, w, h FROM hydro_files WHERE report_id=$1 ORDER BY id", [id(req)]);
  res.json({ report: r.rows[0], files: f.rows, ai: claudeReady() });
});
router.put("/reports/:id", async (req, res) => {
  const d = req.body?.data ?? {};
  await pool.query("UPDATE hydro_reports SET data=$2, title=$3, updated_at=now() WHERE id=$1", [id(req), JSON.stringify(d), String(d.siteRef || d.clientName || "Report").slice(0, 120)]);
  res.json({ ok: true });
});
router.delete("/reports/:id", async (req, res) => {
  await pool.query("DELETE FROM hydro_files WHERE report_id=$1", [id(req)]);
  await pool.query("DELETE FROM hydro_reports WHERE id=$1", [id(req)]);
  res.json({ ok: true });
});

// pictures: sent as the raw image. kind: section | location | photo | map | logo | stamp | signature
const KINDS = ["section", "location", "photo", "map", "logo", "stamp", "signature"];
router.post("/reports/:id/files", express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "12mb" }), async (req, res) => {
  const kind = String(req.query.kind ?? ""), name = String(req.query.name ?? "").slice(0, 80);
  if (!KINDS.includes(kind) || !Buffer.isBuffer(req.body) || !req.body.length) return void res.status(400).json({ error: "Send an image (PNG, JPG or WEBP)" });
  const { png, w, h } = await normaliseShot(req.body, kind === "section" ? 1400 : 1800);
  const r = await pool.query("INSERT INTO hydro_files (report_id, kind, name, mime, w, h, data) VALUES ($1,$2,$3,'image/png',$4,$5,$6) RETURNING id", [id(req), kind, name, w, h, png]);
  res.json({ id: r.rows[0].id, w, h });
});
// replace a picture's image in place (after the admin edits it): same place, same point, new pixels
router.put("/reports/:id/files/:fid", express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "12mb" }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return void res.status(400).json({ error: "Send an image (PNG, JPG or WEBP)" });
  const f = (await pool.query("SELECT kind FROM hydro_files WHERE id=$1 AND report_id=$2", [Number(req.params.fid), id(req)])).rows[0];
  if (!f) return void res.status(404).json({ error: "Not found" });
  const { png, w, h } = await normaliseShot(req.body, f.kind === "section" ? 1400 : 1800);
  await pool.query("UPDATE hydro_files SET data=$3, w=$4, h=$5, mime='image/png' WHERE id=$1 AND report_id=$2", [Number(req.params.fid), id(req), png, w, h]);
  res.json({ ok: true, w, h });
});
router.get("/reports/:id/files/:fid", async (req, res) => {
  const f = await fileBuf(Number(req.params.fid), id(req));
  if (!f) return void res.status(404).end();
  res.type("image/png").send(f.data);
});
// move a picture to another place (e.g. a ground photo uploaded as a machine screenshot)
router.patch("/reports/:id/files/:fid", async (req, res) => {
  const kind = String(req.body?.kind ?? ""); if (!["section", "location", "photo", "map"].includes(kind)) return void res.status(400).json({ error: "Choose where to move it." });
  const ORDN = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"];
  const n = Number((await pool.query("SELECT count(*) AS n FROM hydro_files WHERE report_id=$1 AND kind=$2 AND id<>$3", [id(req), kind, Number(req.params.fid)])).rows[0].n);
  const name = kind === "location" ? `${ORDN[n] ?? `Location ${n + 1}`} Location` : kind === "photo" ? `Field photo ${n + 1}` : kind === "map" ? String(req.body?.name || "Site location map").slice(0, 80) : "";
  const r = await pool.query("UPDATE hydro_files SET kind=$3, name=$4 WHERE id=$1 AND report_id=$2 RETURNING id", [Number(req.params.fid), id(req), kind, name]);
  if (!r.rows[0]) return void res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});
router.delete("/reports/:id/files/:fid", async (req, res) => { await pool.query("DELETE FROM hydro_files WHERE id=$1 AND report_id=$2", [Number(req.params.fid), id(req)]); res.json({ ok: true }); });

// the AI reads a section picture for the chosen station
router.post("/reports/:id/analyse", async (req, res) => {
  if (!claudeReady()) return void res.status(503).json({ error: "No AI key is set on the server yet (GEMINI_API_KEY, GROQ_API_KEY or CEREBRAS_API_KEY)." });
  const f = await fileBuf(Number(req.body?.fileId), id(req));
  if (!f) return void res.status(404).json({ error: "Picture not found" });
  try {
    const reading = await readSection(f.data, f.w, f.h, { instrument: String(req.body?.instrument ?? "").slice(0, 60), station: String(req.body?.station ?? "").slice(0, 10) });
    res.json({ reading });
  } catch (e) { res.status(502).json({ error: String((e as Error).message).slice(0, 300) }); }
});

// draw the marked section picture from the numbers on screen (so the person can nudge the lines and see the result)
router.post("/reports/:id/preview", async (req, res) => {
  const b = req.body ?? {}; const f = await fileBuf(Number(b.fileId), id(req));
  if (!f) return void res.status(404).json({ error: "Picture not found" });
  try { res.type("image/png").send(await figureFor(f.data, b, await getData(id(req)) ?? {})); } catch (e) { res.status(400).json({ error: String((e as Error).message).slice(0, 200) }); }
});

const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const figureFor = (shot: Buffer, p: any, data: Record<string, any>) => {
  const cal = p.cal as SectionCalibration;
  return sectionFigure({
    screenshot: shot, cal, station: String(p.station ?? ""), zoneFrom: num(p.zoneFrom), zoneTo: num(p.zoneTo), yieldText: String(p.yieldText ?? ""),
    instrument: String(data.instrument ?? ""), surveyDate: String(data.surveyDate ?? ""),
    depths: { min: num(data.minDepth) || undefined, max: num(data.maxDepth) || undefined, preferred: num(data.preferredDepth) || undefined },
    summary: [["Target aquifer depth", `${num(p.zoneFrom)} – ${num(p.zoneTo)} m`], ["Expected yield", String(p.yieldText ?? "")], ["Recommended station", String(p.station ?? "")], ...(num(data.minDepth) || num(data.maxDepth) || num(data.preferredDepth) ? [["Drilling depth (client)", `min ${num(data.minDepth)} m, max ${num(data.maxDepth)} m, preferred ${num(data.preferredDepth)} m`] as [string, string]] : []), ["Instrument", String(data.instrument ?? "")], ["Survey date", String(data.surveyDate ?? "")]],
  });
};

const rawNotes = (p: any, data: Record<string, any>, recommended: boolean) => ({
  heading: "RAW FIELD DATA",
  extra: recommended ? { bars: depthBarsFor({ zoneFrom: num(p.zoneFrom), zoneTo: num(p.zoneTo), min: num(data.minDepth) || undefined, max: num(data.maxDepth) || undefined, preferred: num(data.preferredDepth) || undefined, casingTo: num(data.surfaceCasingTo) || undefined }) } : { key: true },
  lines: [
    `**Station ${p.station}${recommended ? " (recommended point)" : " (surveyed, not recommended)"}`,
    `Instrument: ${data.instrument || "not recorded"}. Survey date: ${data.surveyDate || "not recorded"}.`,
    "This is the unprocessed section exactly as the instrument recorded it, before any interpretation.",
    "Warm colours (yellow to red) show higher resistivity: hard or dry formations. Cool colours (blue and purple) show lower resistivity: fractured, weathered or water-bearing zones.",
    ...(recommended && num(p.zoneTo) > num(p.zoneFrom) ? [`Water zone given for this point: ${num(p.zoneFrom)} to ${num(p.zoneTo)} m${p.yieldText ? `; expected yield ${p.yieldText} m³/hour` : ""}.`] : []),
    ...(!recommended && p.reason ? [`Reason given: ${p.reason}`] : []),
  ],
});
const dms = (v: number, pos: string, neg: string) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60; return `${d}°${String(m).padStart(2, "0")}′${s.toFixed(2).padStart(5, "0")}″ ${v >= 0 ? pos : neg}`; };
const ordinal = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"];

async function setProgress(rid: number, status: string, progress: string, error = "") { await pool.query("UPDATE hydro_reports SET status=$2, progress=$3, error=$4, updated_at=now() WHERE id=$1", [rid, status, progress, error]); }
const running = new Set<number>();

router.post("/reports/:id/generate", async (req, res) => {
  const rid = id(req);
  if (!claudeReady()) return void res.status(503).json({ error: "No AI key is set on the server yet (GEMINI_API_KEY, GROQ_API_KEY or CEREBRAS_API_KEY)." });
  if (running.has(rid)) return void res.json({ ok: true, already: true });
  running.add(rid);
  res.json({ ok: true });
  void queued(rid, !!req.body?.refreshFacts);
});

// at most two reports are written at the same time, so the server's memory is safe
let active = 0; const waiting: (() => void)[] = [];
export async function queued(rid: number, refresh: boolean) {
  running.add(rid);
  if (active >= 2) { await setProgress(rid, "working", "In the queue…"); await new Promise<void>((ok) => waiting.push(ok)); }
  active++;
  try { await run(rid, refresh); } finally { active--; running.delete(rid); waiting.shift()?.(); }
}

/** What the client watches while the report is written: the title page, then each section as the code confirms it. */
export interface LiveDoc { title: string; company: string; lines: [string, string][]; date: string; sections: { id: string; num: string; title: string; level: number; flow: Flow[] }[]; done: boolean; at: number }
const live = new Map<number, LiveDoc>();
export const liveOf = (rid: number) => live.get(rid);

async function run(rid: number, refresh: boolean) {
  try {
    const data = (await getData(rid)) ?? {};
    const files = (await pool.query("SELECT id, kind, name, w, h FROM hydro_files WHERE report_id=$1 ORDER BY id", [rid])).rows as { id: number; kind: string; name: string; w: number; h: number }[];
    const picks = (data.picks ?? []) as any[];
    // pictures the person has not had read yet (a client submission): the AI reads them now
    const onlyRec = picks.some((x) => x.recommended); // stations surveyed but not recommended are not analysed (saves credits)
    for (const p of picks) {
      if (p.cal || !p.fileId || !p.station) continue;
      if (onlyRec && !p.recommended) continue;
      const f = await fileBuf(Number(p.fileId), rid); if (!f) continue;
      await setProgress(rid, "working", `Reading the picture for station ${p.station}…`);
      try { const rd = await readSection(f.data, f.w, f.h, { instrument: String(data.instrument ?? ""), station: String(p.station) }); p.cal = rd.cal; const z = rd.zones[0]; if (z && !(num(p.zoneFrom) && num(p.zoneTo))) { p.zoneFrom = z.from; p.zoneTo = z.to; } p.note = [z?.note, rd.scaleNote].filter(Boolean).join(" | "); } catch { /* the admin can fix it in review */ }
    }
    await setData(rid, data);
    const rec = picks.find((p) => p.recommended) ?? picks[0];
    if (!rec) throw new Error("Add at least one section picture and mark the recommended point.");
    const loc = { village: data.village ?? "", location: data.locationName ?? "", subcounty: data.subcounty ?? "", county: data.county ?? "" };
    if (!loc.county) throw new Error("Fill in the county (and sub-county).");
    {
      const la = num(data.lat, NaN), ln = num(data.lng, NaN);
      if (!(Number.isFinite(la) && Number.isFinite(ln)) && !files.some((f) => f.kind === "map")) throw new Error("A map is required. Pin the site on the map (or type the coordinates), or upload a map picture.");
    }
    const refNo = String(data.projectId || "").trim() || await referenceFor(rid, String(loc.county));
    await referenceFor(rid, String(loc.county));

    await setProgress(rid, "working", "Researching the area from web sources…");
    let facts: Facts = data.facts;
    if (!facts || refresh) { facts = await researchArea(loc); data.facts = facts; await setData(rid, data); }

    const lat = num(data.lat, NaN), lng = num(data.lng, NaN);
    // no elevation given: look it up for the coordinates (approximate)
    if (!String(data.elevation ?? "").trim() && Number.isFinite(lat) && Number.isFinite(lng)) { const e = await elevationAt(lat, lng); if (e !== null) { data.elevation = String(e); data.elevationAuto = "1"; await setData(rid, data); } }
    const facts4ai = {
      projectId: data.projectId, siteReference: data.siteRef, purpose: data.purpose, client: data.clientName, location: loc, landmark: data.landmark,
      coordinatesDecimal: Number.isFinite(lat) ? { lat, lng } : undefined, coordinatesDMS: Number.isFinite(lat) ? `${dms(lat, "N", "S")}, ${dms(lng, "E", "W")}` : undefined, elevationM: data.elevation,
      surveyDate: data.surveyDate, instrument: data.instrument, stationSpacing: data.spacing, lineDirection: data.lineDirection, stationsInvestigated: data.stationCount,
      landUse: data.landUse, nearbySource: data.nearbySource || "(not supplied: describe the area generally from researched facts only; do not claim anything about the plot)", demand: data.demand || "(not supplied: describe typical demand from researched facts only)",
      recommended: { station: rec.station, targetZoneM: `${rec.zoneFrom}-${rec.zoneTo}`, expectedYield: rec.yieldText, reason: rec.reason, aiNote: rec.note },
      otherPoints: picks.filter((p) => p !== rec).map((p) => ({ station: p.station, outcome: p.recommended ? "recommended" : "not recommended", reasonGivenByClient: p.reason, yieldGivenByClient: p.yieldText || undefined, depthZoneGivenByClient: num(p.zoneTo) > num(p.zoneFrom) ? `${num(p.zoneFrom)}-${num(p.zoneTo)} m` : undefined })),
      boreholeDepthsM: { minimum: data.minDepth, maximum: data.maxDepth, preferred: data.preferredDepth, preferredReason: data.preferredReason }, casing: data.casing, waterQualityTests: data.quality,
      layers: data.layers, notes: data.notes, figuresInReport: "section picture for each point, borehole design drawing, site photos",
    };
    const seed = `${rid}-${Date.now().toString(36)}`;
    const text: Record<string, string[]> = {};
    const liveDoc: LiveDoc = { title: "HYDROGEOLOGICAL SURVEY REPORT", company: process.env.COMPANY_NAME || "Dighaz Engineering Limited", lines: ([["Client", data.clientName], ["Project", data.siteRef || data.projectId], ["Location", [loc.village, loc.location, loc.subcounty, loc.county].filter(Boolean).join(", ")], ["Survey method", data.instrument], ["Survey date", data.surveyDate]] as [string, unknown][]).filter(([, v]) => v).map(([k, v]) => [k, String(v)]), date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), sections: [], done: false, at: Date.now() };
    live.set(rid, liveDoc); let lastIdx = -1;
    const extra: { glossary?: [string, string][]; images?: { label: string; b64: string }[] } = {};
    if (picks.length > 1 && picks.some((p) => p.recommended)) {
      for (const p of picks.slice(0, 6)) { try { const f = await fileBuf(Number(p.fileId), rid); if (!f) continue; const n = await normaliseShot(f.data, 1000); (extra.images ??= []).push({ label: `Station ${p.station}${p.recommended ? " (recommended)" : " (not recommended)"}`, b64: n.png.toString("base64") }); } catch { /* skip an unreadable picture */ } }
    }
    const flow = await writeReport({ data: facts4ai, facts, seed }, (m) => setProgress(rid, "working", m), (id, f) => {
      const at = SURVEY_SECTIONS.findIndex((x) => x.id === id);
      for (let k = lastIdx + 1; k <= at; k++) { const sc = SURVEY_SECTIONS[k]!; liveDoc.sections.push({ id: sc.id, num: sc.num, title: sc.title, level: sc.level, flow: k === at ? f : [] }); }
      lastIdx = at; liveDoc.at = Date.now();
    }, extra);

    await setProgress(rid, "working", "Drawing figures and building the Word file…");
    const figures: DocFigure[] = [];
    for (const p of picks) {
      const f = await fileBuf(Number(p.fileId), rid); if (!f) continue;
      if (!p.cal) { if (!p.recommended) { const rawO = await normaliseShot(f.data, 1400); figures.push({ buf: rawO.png, w: rawO.w, h: rawO.h, caption: `Field section recorded at Station ${p.station} (surveyed, not recommended)`, after: "6.2.2", notes: rawNotes(p, data, false) }); } continue; }
      const png = await figureFor(f.data, p, data);
      // the analysed picture (AI redraw in the reference layout) for the recommended station, then the real screenshot marked by the code
      if (p.recommended) {
        const an = await analysedSection((await normaliseShot(f.data, 1600)).png, { station: String(p.station), zoneFrom: num(p.zoneFrom), zoneTo: num(p.zoneTo), yieldText: String(p.yieldText ?? ""), instrument: String(data.instrument ?? ""), surveyDate: String(data.surveyDate ?? ""), layers: typeof data.layers === "string" ? data.layers : "", reason: String(p.reason ?? ""), minDepth: num(data.minDepth) || undefined, maxDepth: num(data.maxDepth) || undefined, preferredDepth: num(data.preferredDepth) || undefined });
        if (an) figures.push({ buf: an.png, w: an.w, h: an.h, caption: `Analysed interpreted geoelectric section at Station ${p.station} (AI-assisted presentation of the field section)`, after: "6.2.2" });
      }
      figures.push({ buf: png, w: 1500, h: 1500, caption: `Interpreted geoelectric section at Station ${p.station}${p.recommended ? " (recommended)" : ""}`, after: "6.2.2" });
    }
    // charts built from the supplied stations only
    {
      const rows: StationRow[] = picks.filter((p) => num(p.zoneTo) > num(p.zoneFrom)).map((p) => ({ station: String(p.station), from: num(p.zoneFrom), to: num(p.zoneTo), yieldM3h: (() => { const m = String(p.yieldText ?? "").match(/\d+(\.\d+)?/); return m ? Number(m[0]) : null; })(), recommended: !!p.recommended }));
      if (rows.length) figures.push({ buf: await zoneChart(rows), w: 1400, h: 780, caption: "Interpreted target aquifer depth by surveyed station", after: "6.2.2" });
      if (rows.length && rows.every((r) => r.yieldM3h !== null)) figures.push({ buf: await yieldChart(rows), w: 1400, h: 700, caption: "Expected yield by surveyed station (preliminary)", after: "7" });
    }
    // more visuals: method flow chart, depth plan (client depths), monthly climate chart (only when researched figures exist)
    try {
      figures.push({ buf: await flowChart(String(data.instrument ?? "")), w: 1400, h: 520, caption: "Workflow of the hydrogeological investigation", after: "5.3" });
      if (num(data.preferredDepth) || num(data.maxDepth)) figures.push({ buf: await depthPlanChart({ zoneFrom: num(rec.zoneFrom), zoneTo: num(rec.zoneTo), min: num(data.minDepth), max: num(data.maxDepth), preferred: num(data.preferredDepth), casingTo: num(data.surfaceCasingTo) }), w: 1400, h: 700, caption: "Proposed borehole depths against the interpreted target zone", after: "8.1" });
      const cm = facts.climateMonthly; const okArr = (a: unknown) => Array.isArray(a) && a.length === 12 && a.some((x) => Number.isFinite(Number(x)));
      if (cm && okArr(cm.rainfallMm)) figures.push({ buf: await climateChart(cm.rainfallMm!.map((x) => (x === null || !Number.isFinite(Number(x)) ? null : Number(x))), okArr(cm.tempC) ? cm.tempC!.map((x) => (x === null || !Number.isFinite(Number(x)) ? null : Number(x))) : []), w: 1400, h: 700, caption: "Mean monthly rainfall and temperature of the area (from researched sources)", after: "2.3" });
    } catch (e) { console.warn("[report] extra charts skipped:", (e as Error).message); }
    // fix real figure sizes
    for (const fg of figures) { const { loadImage } = await import("@napi-rs/canvas"); const im = await loadImage(fg.buf); fg.w = im.width; fg.h = im.height; }
    const layers = (data.layers as any[] | undefined)?.length ? (data.layers as any[]) : [
      { from: 0, to: num(rec.zoneFrom), label: "Overburden and weathered formations", kind: "weathered" },
      { from: num(rec.zoneFrom), to: num(rec.zoneTo), label: "Interpreted water-bearing zone", kind: "aquifer" },
    ];
    const bh = await boreholeFigure({
      title: `Station ${rec.station} – interpreted zones and proposed borehole construction`, layers: layers.map((l) => ({ from: num(l.from), to: num(l.to), label: String(l.label), kind: l.kind ?? "weathered" })),
      surfaceCasingTo: Math.min(num(data.surfaceCasingTo, 30), num(data.minDepth, 30)), screens: [{ from: num(rec.zoneFrom), to: Math.min(num(rec.zoneTo), num(data.preferredDepth, num(rec.zoneTo))), label: "Screen (target zone)" }],
      minDepth: num(data.minDepth, num(rec.zoneFrom)), recommendedDepth: num(data.preferredDepth || data.maxDepth, num(rec.zoneTo)),
    });
    const { loadImage } = await import("@napi-rs/canvas"); const bi = await loadImage(bh);
    figures.push({ buf: bh, w: bi.width, h: bi.height, caption: "Proposed borehole construction (schematic)", after: "6.3" });
    // site photos and area pictures
    const area = files.filter((f) => f.kind === "location" || f.kind === "photo" || f.kind === "map");
    for (const f of area) { const b = await fileBuf(f.id, rid); if (b) figures.push({ buf: b.data, w: b.w, h: b.h, caption: f.name || (f.kind === "map" ? "Map" : "Site photograph"), after: f.kind === "map" ? (/terrain|topo|relief|contour|drain/i.test(f.name) ? "2.2" : /recommend|borehole|position|plot/i.test(f.name) ? "6.3" : "2.1") : "6.1", notes: { heading: f.kind === "map" ? "MAP" : "SITE PHOTOGRAPH", lines: [`**${f.name || (f.kind === "map" ? "Map of the area" : "Site photograph")}`, `Location: ${[data.village, data.locationName, data.subcounty, data.county].filter(Boolean).join(", ")}.`, `Survey date: ${data.surveyDate || "not recorded"}.`, f.kind === "map" ? "Map supplied for the project area." : "Photograph taken during the site visit."] } }); }

    // maps drawn from real map tiles at the site coordinates (accurate), plus conceptual diagrams drawn by the AI image model (labelled as schematic)
    await setProgress(rid, "working", "Preparing maps and figures…");
    const givenMaps = files.some((f) => f.kind === "map"); // maps supplied with the report are the ones used; the automatic maps are only for reports without any
    if (Number.isFinite(lat) && Number.isFinite(lng) && !givenMaps) {
      const mapSet: [number, "sat" | "topo", string, string][] = [
        [6, "topo", "Regional location map showing the project area (red marker)", "2.1"],
        [12, "topo", "Project location map", "2.1"],
        [11, "topo", "Local topography and drainage setting (rivers and relief)", "2.2"],
      ];
      mapSet.push([19, "sat", "Recommended borehole position map (satellite view, zoomed to the plot)", "6.3"]);
      // aerial views with the surrounding landmarks named: the first for the Introduction, the second (closer, wider) for the Background
      const a1 = (await googleHybrid(lat, lng, 20)) ?? (await aerialView(lat, lng, 19)) ?? (await aerialView(lat, lng, 18));
      if (a1) figures.push({ buf: a1.png, w: a1.w, h: a1.h, caption: process.env.GOOGLE_MAPS_API_KEY ? "Aerial map of the project site and surrounding landmarks (Google Maps)" : "Aerial map of the project site and surrounding landmarks", after: "1.1" });
      for (const [z, layer, caption, after] of mapSet) { const m = (await tileMap(lat, lng, z, layer)) ?? (layer === "sat" ? await tileMap(lat, lng, z - 1, layer) : null); if (m) figures.push({ buf: m.png, w: m.w, h: m.h, caption, after }); }
    }
    {
      const place = String(loc.county ?? "");
      const g1 = await aiFigure(conceptualGeology(String(data.layers ?? ""), place));
      if (g1) figures.push({ buf: g1.png, w: g1.w, h: g1.h, caption: "Conceptual geological cross-section (schematic, not to scale)", after: "6.2.3" });
      const g2 = await aiFigure(conceptualHydro(place));
      if (g2) figures.push({ buf: g2.png, w: g2.w, h: g2.h, caption: "Conceptual hydrogeological model (schematic, not to scale)", after: "3.2" });
    }

    const tables: DocTable[] = [];
    // visuals the code builds from the client's own data, so the Introduction and the Conclusions have at least two or three each
    {
      const dash = (x: unknown) => (x === undefined || x === null || String(x).trim() === "" ? "Not recorded" : String(x));
      const where = [loc.village, loc.location, loc.subcounty, loc.county].filter(Boolean).join(", ");
      const depth = data.preferredDepth || data.maxDepth;
      tables.push({ caption: "Project summary at a glance", after: "1.1", head: ["Item", "Detail"], rows: [
        ["Client", dash(data.clientName)], ["Project / site", dash(data.siteRef)], ["Location", dash(where)],
        ["Coordinates (WGS84)", Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(6)}°, ${lng.toFixed(6)}°` : "Not recorded"],
        ["Survey instrument", dash(data.instrument)], ["Survey date", dash(data.surveyDate)],
        ["Stations investigated", String(picks.length || "Not recorded")], ["Recommended station", rec ? `Station ${rec.station}` : "Not recorded"],
      ] });
      if (rec) tables.push({ caption: "Summary of the borehole recommendation", after: "7", head: ["Item", "Recommendation"], rows: [
        ["Recommended point", `Station ${rec.station}`], ["Target aquifer zone", `${rec.zoneFrom}–${rec.zoneTo} m below ground level`],
        ["Expected yield (preliminary)", dash(rec.yieldText)], ["Recommended drilling depth", depth ? `About ${depth} m, subject to confirmation during drilling` : "To be confirmed"],
        ["Next step", "Drill, develop and pump-test the borehole, then analyse the water quality"],
      ] });
    }

    // appendices: filled from the project data; anything not supplied says "To be confirmed"
    const tbc = "To be confirmed";
    const v = (x: unknown) => (x === undefined || x === null || String(x).trim() === "" ? tbc : String(x));
    const zone = `${num(rec.zoneFrom)}–${num(rec.zoneTo)} m`;
    const prefD = data.preferredDepth || data.maxDepth;
    const surfTo = Math.min(num(data.surfaceCasingTo, 30), num(data.minDepth, 30));
    const placeName = [loc.village, loc.location, loc.subcounty, loc.county].filter(Boolean).join(", ");
    const appendices: DocAppendix[] = [
      { title: "Project Information", intro: "Project details supplied for this survey.", caption: "Project information", head: ["Field", "Detail"], rows: [
        ["Project ID", v(data.projectId)], ["Client", v(data.clientName)], ["Telephone", telFmt(data.clientPhone)], ["Email", v(data.clientEmail)], ["Project sponsor", v(data.sponsor)],
        ["Supervising organisation", v(data.supervisor)], ["Project representative", v(data.representative)], ["Project location", v(placeName)], ["Site reference", v(data.siteRef)],
        ["Purpose of the investigation", v(data.purpose)], ["Date of survey", v(data.surveyDate)], ["Data collected by", v(data.collectedBy)] ] },
      { title: "GPS Survey Data", intro: "Position of the recommended borehole location, recorded in WGS 84.", caption: "GPS survey data", head: ["Parameter", "Value"], rows: [
        ["Latitude (decimal degrees)", Number.isFinite(lat) ? lat.toFixed(6) : tbc], ["Longitude (decimal degrees)", Number.isFinite(lng) ? lng.toFixed(6) : tbc],
        ["Latitude (DMS)", Number.isFinite(lat) ? dms(lat, "N", "S") : tbc], ["Longitude (DMS)", Number.isFinite(lng) ? dms(lng, "E", "W") : tbc],
        ["Elevation", data.elevation ? `${data.elevation} m AMSL` : tbc], ["Datum", "WGS 84 (EPSG:4326)"], ["Nearest landmark", v(data.landmark)], ["Station", String(rec.station)] ] },
      { title: "Site Reconnaissance Observations", intro: "Observations recorded at the site before and during the survey.", caption: "Site reconnaissance observations", head: ["Observation item", "Finding"], rows: [
        ["Location", v(placeName)], ["Land use", v(data.landUse)], ["Nearest known water source", v(data.nearbySource)], ["Water demand", v(data.demand)],
        ["Survey line direction", v(data.lineDirection)], ["Station spacing", data.spacing ? `${data.spacing}` : tbc], ["Stations investigated", v(data.stationCount)], ["Additional notes", v(data.notes)] ] },
      { title: "Hydrogeophysical Survey Parameters", intro: "Survey set-up used for the investigation.", caption: "Hydrogeophysical survey parameters", head: ["Parameter", "Value"], rows: [
        ["Instrument", v(data.instrument)], ["Survey date", v(data.surveyDate)], ["Survey line direction", v(data.lineDirection)], ["Station spacing", data.spacing ? `${data.spacing}` : tbc],
        ["Stations investigated", v(data.stationCount)], ["Recommended station", String(rec.station)], ["Data collected by", v(data.collectedBy)] ] },
      { title: "Comparative Assessment of Survey Points", intro: "Each surveyed point is compared and the recommended point is selected.", caption: "Comparative assessment of the surveyed points", head: ["Station", "Target zone (m)", "Expected yield", "Outcome", "Reason"],
        rows: picks.map((p) => [String(p.station), num(p.zoneTo) > num(p.zoneFrom) ? `${num(p.zoneFrom)}–${num(p.zoneTo)}` : "—", v(p.yieldText), p.recommended ? "Recommended" : "Not recommended", v(p.reason)]) },
      { title: "Interpreted Subsurface Geological Profile", intro: `Interpreted profile at Station ${rec.station}. Depths are interpreted from the geophysical data and are confirmed by logging during drilling.`, caption: "Interpreted subsurface profile", head: ["Depth range (m bgl)", "Interpreted formation"],
        rows: layers.map((l) => [`${l.from}–${l.to}`, String(l.label)]) },
      { title: "Recommended Borehole Design", intro: "Recommended construction, to be confirmed by the drilling contractor against the formations met during drilling.", caption: "Recommended borehole design", head: ["Construction element", "Recommendation"], rows: [
        ["Minimum drilling depth", data.minDepth ? `${data.minDepth} m` : tbc], ["Preferred drilling depth", prefD ? `${prefD} m` : tbc], ["Surface casing", `0–${surfTo} m, cemented in place`],
        ["Casing type", v(data.casing)], ["Screened interval (target zone)", zone], ["Gravel pack", "Across the screened interval"], ["Sanitary seal", "Cement grout at the top of the surface casing"], ["Borehole diameter", tbc] ] },
      { title: "Preliminary Drilling Programme", intro: "Preliminary sequence of work. The programme is adjusted on site to the formations met.", caption: "Preliminary drilling programme", head: ["Phase", "Activity", "Output"], rows: [
        ["1", "Mobilisation to site and confirmation of the drilling point", `Station ${rec.station}`], ["2", `Drilling to the surface casing depth (${surfTo} m)`, "Surface casing installed and cemented"],
        ["3", `Drilling to the minimum depth${data.minDepth ? ` (${data.minDepth} m)` : ""} with geological logging`, "Drilling log and water strikes recorded"],
        ["4", `Drilling through the target zone (${zone})${prefD ? ` and to the preferred depth (${prefD} m) where feasible` : ""}`, "Final depth decided on site"],
        ["5", "Installation of casing, screens and gravel pack", "Completed borehole"], ["6", "Borehole development", "Clear, sand-free water"], ["7", "Pumping test", "Yield and drawdown data"],
        ["8", "Water sampling for laboratory analysis", "Quality report"], ["9", "Handover", "Drilling log and test data"] ] },
      { title: "Estimated Aquifer Characteristics", intro: "Preliminary planning figures. Hydraulic parameters are proven by the pumping test.", caption: "Estimated aquifer characteristics", head: ["Aquifer parameter", "Estimate", "Basis"], rows: [
        ["Target aquifer zone", zone, "Geophysical interpretation"], ["Expected yield", v(rec.yieldText), "Supplied with the survey"], ["Static water level", "Measured after drilling", "Drilling and development"],
        ["Transmissivity", "From the pumping test", "Pumping test analysis"], ["Hydraulic conductivity", "From the pumping test", "Pumping test analysis"], ["Storage coefficient", "From the pumping test", "Pumping test analysis"], ["Safe yield", "From the pumping test", "Pumping test analysis"] ] },
      { title: "Borehole Drilling Log Template", intro: "To be completed by the drilling contractor and the supervising geologist during drilling.", caption: "Borehole drilling log", head: ["From (m)", "To (m)", "Lithology description", "Water strike (Yes/No)", "Remarks"],
        rows: Array.from({ length: 16 }, () => ["", "", "", "", ""]) },
      { title: "Recommended Water Quality Analysis Schedule", intro: "Samples are taken at the end of the pumping test and analysed by an accredited laboratory against the WHO Guidelines for Drinking-water Quality.", caption: "Recommended water quality analysis schedule", head: ["Analysis category", "Parameters", "Reference"], rows: [
        ["Physical", "pH, electrical conductivity, total dissolved solids, turbidity, colour, temperature", "WHO Guidelines for Drinking-water Quality"],
        ["Major ions", "Calcium, magnesium, sodium, potassium, bicarbonate, chloride, sulphate", "WHO Guidelines for Drinking-water Quality"],
        ["Health-related chemicals", "Fluoride, nitrate, iron, manganese", "WHO Guidelines for Drinking-water Quality"],
        ["Hardness and alkalinity", "Total hardness, total alkalinity", "WHO Guidelines for Drinking-water Quality"],
        ["Microbiological", "Total coliforms, Escherichia coli", "WHO Guidelines for Drinking-water Quality"],
        ["Additional tests requested", Array.isArray(data.quality) ? data.quality.join(", ") || "None requested" : v(data.quality), "As requested by the client"] ] },
    ];
    // field data sheet, photograph plates, equipment, drilling specification and glossary
    const photoFigs = figures.filter((x) => x.after === "6.1");
    for (let k = figures.length - 1; k >= 0; k--) if (figures[k].after === "6.1") figures.splice(k, 1);
    const wc = workedCalculations({ yieldText: String(rec.yieldText ?? ""), zoneFrom: num(rec.zoneFrom), zoneTo: num(rec.zoneTo), minDepth: num(data.minDepth), maxDepth: num(data.maxDepth), preferredDepth: num(data.preferredDepth), surfaceCasingTo: num(data.surfaceCasingTo), casingMm: (() => { const m = /(\d+(?:\.\d+)?)\s*(?:-|\s)?\s*inch/i.exec(String(data.casing ?? "")); const mm = /(\d{2,3})\s*mm/i.exec(String(data.casing ?? "")); return m ? Math.round(Number(m[1]) * 25.4) : mm ? Number(mm[1]) : undefined; })() });
    if (wc) appendices.push({ title: "Worked Calculations", intro: "Each calculation shows the formula, the values put in and the result. " + wc.notes.join(" "), caption: "Worked calculations from the survey data", head: wc.head, rows: wc.rows });
    if (photoFigs.length) appendices.push({ title: "Site Photographs (Plates)", intro: "Photographs of the site and the survey.", caption: "Site photographs", head: [], rows: [], plates: photoFigs.map((f) => ({ buf: f.buf, w: f.w, h: f.h, caption: f.caption, notes: f.notes })) });
    // the client's own documents (optional), as chosen when the report was submitted
    const owner = (await pool.query("SELECT owner_phone FROM hydro_reports WHERE id=$1", [rid])).rows[0]?.owner_phone as string | undefined;
    const want = String(data.attachDocs ?? "").split(",").filter(Boolean);
    if (owner && want.length) {
      const docs = await savedDocs(owner, want);
      for (const k of want) {
        const u = docs[k]; if (!u) continue;
        try { const buf = Buffer.from(u.split(",")[1]!, "base64"); const { png, w, h } = await normaliseShot(buf, 1400); appendices.push({ title: DOC_LABELS[k] ?? k, caption: DOC_LABELS[k] ?? k, head: [], rows: [], figure: { buf: png, w, h } }); } catch { /* skip an unreadable copy */ }
      }
    }
    // uploaded maps go to the appendix
    for (const f of figures.filter((x) => x.after === "appendix")) appendices.push({ title: f.caption, caption: f.caption, head: [], rows: [], figure: { buf: f.buf, w: f.w, h: f.h } });
    for (let k = figures.length - 1; k >= 0; k--) if (figures[k].after === "appendix") figures.splice(k, 1);

    const sigs = files.filter((f) => f.kind === "stamp" || f.kind === "signature" || f.kind === "logo");
    const one = async (k: string) => { const f = sigs.find((x) => x.kind === k); return f ? (await fileBuf(f.id, rid))?.data : undefined; };
    const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const online = facts.sources.map((s) => `${s.title}. ${s.url} (accessed ${today}).`);
    let preview: Buffer | null = null; let clean: Buffer | null = null;
    const doc = await buildDocx({
      title: "HYDROGEOLOGICAL SURVEY REPORT", subtitle: "FOR GROUNDWATER DEVELOPMENT PROJECT",
      reference: refNo,
      cover: [["Project ID", data.projectId ?? ""], ["Client", data.clientName ?? ""], ["Telephone", data.clientPhone ?? ""], ["Email", data.clientEmail ?? ""], ["Project sponsor", data.sponsor ?? ""], ["Supervising organisation", data.supervisor ?? ""], ["Project representative", data.representative ?? ""],
        ["Project location", [loc.village, loc.location, loc.subcounty, loc.county].filter(Boolean).join(", ")], ["Site reference", data.siteRef ?? ""], ["Date of survey", data.surveyDate ?? ""], ["Data collected by", data.collectedBy ?? ""]],
      company: data.company || "Dighaz Engineering Limited", logo: (await one("logo")) ?? logoPng(), footerText: `${refNo}  |  ${data.siteRef || "Hydrogeological Survey Report"}`, date: today,
      secs: SURVEY_SECTIONS, text, flow, figures, tables, appendices,
      abbreviations: (extra.glossary && extra.glossary.length >= 15 ? extra.glossary : [["ADMT", "Audio-frequency Deep Magnetotelluric (groundwater detector)"], ["PQWT", "Portable Geological Prospecting Equipment"], ["VES", "Vertical Electrical Sounding"], ["WGS 84", "World Geodetic System 1984"], ["m bgl", "Metres below ground level"], ["m AMSL", "Metres above mean sea level"], ["m³/h", "Cubic metres per hour"], ["Ω·m", "Ohm-metre (resistivity)"], ["TDS", "Total dissolved solids"], ["WRA", "Water Resources Authority (Kenya)"], ["WHO", "World Health Organization"], ["GPS", "Global Positioning System"]] as [string, string][]),
      references: REFERENCE_LIBRARY, onlineRefs: online,
      signature: { name: data.geologistName ?? "", title: data.geologistTitle ?? "", stamp: await one("stamp"), sign: await one("signature") },
    }, async (prep) => { preview = await buildPreviewPdf(prep, process.env.REPORT_WATERMARK || `${data.company || "Dighaz Engineering Limited"} Limited`); clean = await buildPreviewPdf(prep, null); });
    await pool.query("UPDATE hydro_reports SET docx=$2, preview=$3, clean_pdf=$4 WHERE id=$1", [rid, doc, preview, clean]);
    const own = (await pool.query("SELECT owner_phone FROM hydro_reports WHERE id=$1", [rid])).rows[0]?.owner_phone;
    // client reports go straight to the client unless REPORT_REVIEW=on (then they wait for the admin's "Release to client")
    const perMain: Record<string, number> = {};
    const bump = (id: string) => { const k = id.split(".")[0]!; perMain[k] = (perMain[k] ?? 0) + 1; };
    for (const [id, f] of Object.entries(flow)) for (const x of f) if ("table" in x) bump(id);
    for (const f of figures) bump(f.after); for (const t of tables) bump(t.after);
    const thin = Object.keys(perMain).concat(["1", "2", "3", "4", "5", "6", "7", "8"]).filter((k, i, a) => a.indexOf(k) === i && (perMain[k] ?? 0) < 2).sort();
    const fit = conformance(flow) + (thin.length ? `; sections with fewer than 2 visuals: ${thin.join(", ")}` : "; every main section has 2 or more tables or figures");
    liveDoc.done = true; setTimeout(() => live.delete(rid), 30 * 60_000);
    const review = process.env.REPORT_REVIEW === "on";
    if (own && !review) {
      await pool.query("UPDATE hydro_reports SET released=true WHERE id=$1", [rid]);
      await setProgress(rid, "done", `Ready to download. ${fit}`);
      void sms(own, `${process.env.COMPANY_NAME || "Dighaz Engineering Limited"}: your survey report is ready. Open ${siteUrl()}/report to download it.`);
      smsOwner("A client survey report was written and released automatically. You can review it in Admin > Reports.");
    } else {
      await setProgress(rid, own ? "review" : "done", `${own ? "Waiting for your review" : "Ready to download"}. ${fit}`);
      if (own) smsOwner("A paid survey report is ready for your review in Admin > Reports.");
    }
  } catch (e) {
    live.delete(rid);
    await setProgress(rid, "failed", "", String((e as Error).message).slice(0, 400));
  }
}

router.post("/reports/:id/release", async (req, res) => {
  const r = await pool.query("UPDATE hydro_reports SET released=$2, updated_at=now() WHERE id=$1 AND docx IS NOT NULL RETURNING owner_phone, title", [id(req), req.body?.released !== false]);
  if (!r.rows[0]) return void res.status(404).json({ error: "Write the report first" });
  if (req.body?.released !== false && r.rows[0].owner_phone) void sms(r.rows[0].owner_phone, `${process.env.COMPANY_NAME || "Dighaz Engineering Limited"}: your survey report is ready. Open ${siteUrl()}/report to download it.`);
  res.json({ ok: true });
});
router.get("/reports/:id/download", async (req, res) => {
  const r = await pool.query("SELECT docx, title FROM hydro_reports WHERE id=$1", [id(req)]);
  if (!r.rows[0]?.docx) return void res.status(404).json({ error: "Not generated yet" });
  const name = `Hydrogeological Survey Report - ${String(r.rows[0].title).replace(/[^\w .-]+/g, "")}.docx`;
  res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${name}"` }).send(r.rows[0].docx);
});

/** A deploy or restart kills a report that is being written in the background. On start, write those reports again (at most twice each). */
if (process.env.DATABASE_URL && process.env.NODE_ENV !== "test") {
  setTimeout(async () => {
    try {
      await ensure();
      const r = await pool.query("SELECT id FROM hydro_reports WHERE status='working' AND resumes < 2 AND updated_at > now() - interval '3 hours' ORDER BY id");
      for (const { id } of r.rows as { id: number }[]) {
        if (running.has(id)) continue;
        await pool.query("UPDATE hydro_reports SET resumes = resumes + 1 WHERE id=$1", [id]);
        console.log("resuming interrupted report", id);
        void queued(id, false);
      }
    } catch (e) { console.error("resume interrupted reports failed", e); }
  }, 10_000).unref?.();
}

export { ensure as ensureReportTables, run as runReport, running as runningReports, getData as getReportData, setData as setReportData, fileBuf as reportFile };
export default router;
void ordinal;
