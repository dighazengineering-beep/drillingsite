import { Router, type Request } from "express";
import crypto from "node:crypto";
import { pool, db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { markDeleted } from "../lib/tombstones";
import { ensureTables as ensureMemberTables } from "./members";

// More admin tools: overview numbers, accounts (suspend / delete), projects, enquiries and photo uploads. All need the ADMIN_KEY header.
const router = Router();
const isAdmin = (req: Request) => {
  const k = process.env.ADMIN_KEY;
  const h = req.header("x-admin-key");
  return !!k && typeof h === "string" && h === k;
};
router.use(["/admin/overview", "/admin/members", "/admin/projects", "/admin/inquiries", "/admin/upload-sign"], (req, res, next) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  next();
});

const count = async (sql: string) => { try { return Number((await pool.query(sql)).rows[0].n); } catch { return 0; } };

router.get("/admin/overview", async (_req, res) => {
  await ensureMemberTables().catch(() => {});
  const [products, services, projects, members, suspended, enquiries, videos, comments, pending, paidTotal, paidCount] = await Promise.all([
    count("SELECT COUNT(*) n FROM products"), count("SELECT COUNT(*) n FROM services"), count("SELECT COUNT(*) n FROM projects"),
    count("SELECT COUNT(*) n FROM members"), count("SELECT COUNT(*) n FROM members WHERE suspended"), count("SELECT COUNT(*) n FROM inquiries"),
    count("SELECT COUNT(*) n FROM feed_videos"), count("SELECT COUNT(*) n FROM video_comments"),
    count("SELECT COUNT(*) n FROM payments WHERE status='pending' AND method='bank'"),
    count("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE status='paid'"), count("SELECT COUNT(*) n FROM payments WHERE status='paid'"),
  ]);
  res.json({ products, services, projects, members, suspended, enquiries, videos, comments, pendingBank: pending, received: paidTotal, payments: paidCount });
});

/* ------------------------------------------------------------- accounts */
router.get("/admin/members", async (_req, res) => {
  try {
    await ensureMemberTables();
    const r = await pool.query(
      `SELECT m.id, m.name, m.email, m.phone, (m.google_id IS NOT NULL) AS google, COALESCE(m.suspended,false) AS suspended, m.created_at AS "createdAt",
              (SELECT COUNT(*) FROM referrals x WHERE x.member_id = m.id)::int AS referrals
       FROM members m ORDER BY m.created_at DESC LIMIT 500`,
    );
    res.json(r.rows);
  } catch { res.json([]); }
});
router.post("/admin/members/:id/suspend", async (req, res) => {
  await ensureMemberTables().catch(() => {});
  const on = req.body?.suspended !== false;
  const r = await pool.query("UPDATE members SET suspended=$2 WHERE id=$1 RETURNING id", [Number(req.params.id) || 0, on]);
  res.status(r.rowCount ? 200 : 404).json({ ok: !!r.rowCount });
});
router.delete("/admin/members/:id", async (req, res) => {
  await pool.query("DELETE FROM members WHERE id=$1", [Number(req.params.id) || 0]);
  res.json({ ok: true });
});

/* ------------------------------------------------------------- enquiries */
router.get("/admin/inquiries", async (_req, res) => {
  try {
    const r = await pool.query(`SELECT id, name, phone, email, county, inquiry_type AS "inquiryType", message, created_at AS "createdAt" FROM inquiries ORDER BY created_at DESC LIMIT 300`);
    res.json(r.rows);
  } catch { res.json([]); }
});
router.delete("/admin/inquiries/:id", async (req, res) => {
  await pool.query("DELETE FROM inquiries WHERE id=$1", [Number(req.params.id) || 0]);
  res.json({ ok: true });
});

/* ------------------------------------------------------------- projects */
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const optStr = (v: unknown, max: number) => str(v, max) || null;
const optInt = (v: unknown) => { if (v === null || v === undefined || String(v).trim() === "") return null; const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? n : null; };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

function projectPatch(b: Record<string, unknown>, creating: boolean) {
  const p: Partial<typeof projectsTable.$inferInsert> = {};
  if (creating || "title" in b) p.title = str(b.title, 160);
  if (creating || "county" in b) p.county = str(b.county, 80) || "Kenya";
  if (creating || "town" in b) p.town = str(b.town, 80);
  if (creating || "region" in b) p.region = str(b.region, 80) || "Kenya";
  if (creating || "clientType" in b) p.clientType = str(b.clientType, 60) || "Private";
  if (creating || "serviceType" in b) p.serviceType = str(b.serviceType, 60) || "Borehole Drilling";
  if (creating || "description" in b) p.description = str(b.description, 6000);
  if ("challenge" in b) p.challenge = optStr(b.challenge, 3000);
  if ("solution" in b) p.solution = optStr(b.solution, 3000);
  if ("outcome" in b) p.outcome = optStr(b.outcome, 3000);
  if ("depth" in b) p.depth = optInt(b.depth);
  if ("yield" in b) p.yield = optStr(b.yield, 60);
  if ("duration" in b) p.duration = optStr(b.duration, 60);
  if (creating || "completionYear" in b) p.completionYear = optInt(b.completionYear) ?? 0;
  if ("imageUrl" in b) p.imageUrl = optStr(b.imageUrl, 500);
  if ("featured" in b) p.featured = !!b.featured;
  if (creating && (!p.title || !p.description)) throw new Error("Title and description are required");
  return p;
}
router.get("/admin/projects", async (_req, res) => {
  const rows = await db.select().from(projectsTable);
  res.json(rows.sort((a, b) => Number(b.featured) - Number(a.featured) || a.title.localeCompare(b.title)));
});
router.post("/admin/projects", async (req, res) => {
  try {
    const p = projectPatch(req.body ?? {}, true);
    const [row] = await db.insert(projectsTable).values({ ...p, slug: `${slugify(String(p.title))}-${Date.now().toString(36)}` } as typeof projectsTable.$inferInsert).returning();
    res.status(201).json(row);
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Invalid input" }); }
});
router.patch("/admin/projects/:id", async (req, res) => {
  try {
    const p = projectPatch(req.body ?? {}, false);
    if (!Object.keys(p).length) { res.status(400).json({ error: "Nothing to change" }); return; }
    const [row] = await db.update(projectsTable).set(p).where(eq(projectsTable.id, Number(req.params.id) || 0)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Invalid input" }); }
});
router.delete("/admin/projects/:id", async (req, res) => {
  const [gone] = await db.select({ slug: projectsTable.slug }).from(projectsTable).where(eq(projectsTable.id, Number(req.params.id) || 0));
  if (gone) await markDeleted("project", gone.slug);
  await db.delete(projectsTable).where(eq(projectsTable.id, Number(req.params.id) || 0));
  res.json({ ok: true });
});

/* ------------------------------------------------------------- photo upload (Cloudinary, straight from the browser) */
router.post("/admin/upload-sign", (_req, res) => {
  const name = (process.env.CLOUDINARY_CLOUD_NAME ?? "").trim();
  const key = (process.env.CLOUDINARY_API_KEY ?? "").trim();
  const secret = (process.env.CLOUDINARY_API_SECRET ?? "").trim();
  if (!name || !key || !secret) { res.status(503).json({ error: "Photo storage is not set up yet (add the three Cloudinary keys on Render)." }); return; }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "dighaz-engineering/photos";
  const signature = crypto.createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest("hex");
  res.json({ cloudName: name, apiKey: key, timestamp, signature, folder });
});

export default router;
