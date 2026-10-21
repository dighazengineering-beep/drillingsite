import express, { Router } from "express";
import crypto from "node:crypto";
import { pool } from "@workspace/db";
import { memberFrom } from "./members";

// Videos the admin uploads from the website. The files live on Cloudinary (original quality, no re-encoding);
// this table only keeps the list: link, title, place.
// Storage (pick one, GitHub wins if both are set). Env variables on the API service:
//   ADMIN_KEY                                                    always needed
//   CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET               store videos on Cloudinary (preferred when set)
//   GITHUB_TOKEN (+ optional GITHUB_REPO, GITHUB_BRANCH)          otherwise store them in the GitHub repo, original file
const router = Router();
const FOLDER = "dighaz-engineering/feed";

let ready: Promise<unknown> | null = null;
function ensureTable() {
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS feed_videos (
      id SERIAL PRIMARY KEY,
      public_id TEXT NOT NULL,
      url TEXT NOT NULL,
      poster TEXT,
      title TEXT NOT NULL,
      location TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL DEFAULT 'cloudinary'
    );
    ALTER TABLE feed_videos ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'cloudinary';
    ALTER TABLE feed_videos ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'boreholes';
    ALTER TABLE feed_videos ADD COLUMN IF NOT EXISTS village TEXT;
    ALTER TABLE feed_videos ADD COLUMN IF NOT EXISTS shot_on TEXT;
    ALTER TABLE feed_videos ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
    ALTER TABLE feed_videos ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
    ALTER TABLE feed_videos ADD COLUMN IF NOT EXISTS member_id TEXT;
    -- People (besides the admin) who may post videos. The list starts empty; the admin adds posters in /admin.
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_uploaders') THEN
        CREATE TABLE video_uploaders (
          email TEXT PRIMARY KEY,
          approved BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      END IF;
    END $$;
  `).catch((e) => { ready = null; throw e; });
  return ready;
}

const isAdmin = (key: unknown) => {
  const k = process.env.ADMIN_KEY;
  return !!k && typeof key === "string" && key === k;
};
// Who is posting: the admin (password), or a signed-in member whose email is on the poster list.
// A listed member counts once Google has confirmed the email, or once the admin has pressed Approve for it.
async function actor(req: express.Request): Promise<{ admin: boolean; member: { id: number; email: string } | null } | null> {
  if (isAdmin(req.header("x-admin-key"))) return { admin: true, member: null };
  const member = await memberFrom(req).catch(() => null);
  if (!member) return null;
  await ensureTable();
  const r = await pool.query("SELECT approved FROM video_uploaders WHERE email = $1", [String(member.email).toLowerCase()]);
  if (!r.rows[0]) return null;
  return member.google_id || r.rows[0].approved ? { admin: false, member } : null;
}
const NOT_ALLOWED = "Only approved video posters can do this.";
const numIn = (v: unknown, lo: number, hi: number) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};
const lat = (v: unknown) => numIn(v, -5.5, 5.5);
const lng = (v: unknown) => numIn(v, 33.5, 42);
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;
const COLS = `id, url, poster, title, location, village, lat, lng, source, category, created_at AS "createdAt"`;

// Pasted settings often carry a stray space, new line or quote marks, which makes Cloudinary reject the upload signature. Clean them.
const envClean = (v: string | undefined) => v?.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
const cloud = () => ({
  name: envClean(process.env.CLOUDINARY_CLOUD_NAME),
  key: envClean(process.env.CLOUDINARY_API_KEY),
  secret: envClean(process.env.CLOUDINARY_API_SECRET),
});
const gh = {
  get token() { return process.env.GITHUB_TOKEN; },
  get repo() { return process.env.GITHUB_REPO || ""; },
  get branch() { return process.env.GITHUB_BRANCH || "main"; },
};
const GH_DIR = "artifacts/borehole-kenya/public/videos/uploads";
const ghFetch = (path: string, init: RequestInit = {}) =>
  fetch(`https://api.github.com/repos/${gh.repo}/contents/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${gh.token}`, Accept: "application/vnd.github+json", "User-Agent": "dighaz-engineering-website", ...(init.headers ?? {}) },
  });
const CATS = ["boreholes", "drilling", "solar", "pump", "inspection", "survey", "purification"];
const cat = (v: unknown) => (typeof v === "string" && CATS.includes(v) ? v : "boreholes");
const sha1 = (s: string) => crypto.createHash("sha1").update(s).digest("hex");

router.get("/feed-videos", async (req, res) => {
  try {
    await ensureTable();
    const member = await memberFrom(req).catch(() => null);
    const r = await pool.query(`SELECT ${COLS}, (member_id IS NOT NULL AND member_id = $1) AS mine FROM feed_videos ORDER BY created_at DESC`, [member ? String(member.id) : ""]);
    // Visitors get the pin rounded to the area (about 1 km), so a customer's exact home or farm is never published.
    // The exact position stays in the database, and is sent when the admin key is supplied.
    const exact = isAdmin(req.header("x-admin-key"));
    const area = (n: number | null) => (n == null || exact ? n : Math.round(n * 100) / 100);
    res.json(r.rows.map((x) => ({ ...x, lat: area(x.lat), lng: area(x.lng) })));
  } catch { res.json([]); }
});

// Tells the website whether to show the Upload button to the signed-in member.
router.get("/feed-videos/can-upload", async (req, res) => {
  try {
    await ensureTable();
    const member = await memberFrom(req).catch(() => null);
    if (!member) { res.json({ canUpload: false, listed: false }); return; }
    const r = await pool.query("SELECT approved FROM video_uploaders WHERE email = $1", [String(member.email).toLowerCase()]);
    const listed = !!r.rows[0];
    const canUpload = listed && !!(member.google_id || r.rows[0].approved);
    res.json({ canUpload, listed, needsGoogle: listed && !canUpload });
  } catch { res.json({ canUpload: false, listed: false }); }
});

// Signed upload ticket: the browser sends the video straight to Cloudinary, so Render never touches the file.
router.post("/feed-videos/sign", async (req, res) => {
  if (!(await actor(req))) { res.status(403).json({ error: NOT_ALLOWED }); return; }
  const c = cloud();
  const cloudReady = !!(c.name && c.key && c.secret);
  // Cloudinary is preferred when its keys are set (bigger files, faster, nothing to rebuild).
  // GitHub is used only when Cloudinary is not set up.
  if (!cloudReady) {
    if (gh.token) { res.json({ mode: "github", maxMB: 90 }); return; }
    res.status(503).json({ error: "No video storage is set up on the server yet (add the three Cloudinary keys on Render)" });
    return;
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sha1(`folder=${FOLDER}&timestamp=${timestamp}${c.secret}`);
  res.json({ mode: "cloudinary", cloudName: c.name, apiKey: c.key, timestamp, signature, folder: FOLDER });
});

// GitHub mode: the browser sends the original file here and we commit it to the repo untouched.
router.post("/feed-videos/upload", express.raw({ type: () => true, limit: "90mb" }), async (req, res) => {
  const who = await actor(req);
  if (!who) { res.status(403).json({ error: NOT_ALLOWED }); return; }
  if (!gh.token) { res.status(503).json({ error: "GITHUB_TOKEN is not set on the server" }); return; }
  const ext = (String(req.query.name ?? "").match(/\.(mp4|webm)$/i)?.[1] ?? "").toLowerCase();
  const title = String(req.query.title ?? "").trim().slice(0, 120);
  const location = String(req.query.location ?? "").trim().slice(0, 80);
  const village = text(req.query.village, 60);
  if (!ext) { res.status(400).json({ error: "Please upload an .mp4 or .webm video" }); return; }
  if (!title) { res.status(400).json({ error: "Missing title" }); return; }
  if (!Buffer.isBuffer(req.body) || req.body.length < 1000) { res.status(400).json({ error: "Empty file" }); return; }
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "video";
  const fileName = `${slug}-${Date.now()}.${ext}`;
  try {
    await ensureTable();
    const put = await ghFetch(`${GH_DIR}/${fileName}`, {
      method: "PUT",
      body: JSON.stringify({ message: `Add video: ${title}`, content: req.body.toString("base64"), branch: gh.branch }),
    });
    if (!put.ok) { res.status(502).json({ error: `GitHub refused the upload (${put.status}). Check the token has write access to the repo.` }); return; }
    const r = await pool.query(
      `INSERT INTO feed_videos (public_id, url, poster, title, location, village, lat, lng, member_id, source, category) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,'github',$9) RETURNING ${COLS}, TRUE AS mine`,
      [`${GH_DIR}/${fileName}`, `videos/uploads/${fileName}`, title, location || null, village, lat(req.query.lat), lng(req.query.lng), who.member ? String(who.member.id) : null, cat(req.query.category)],
    );
    res.status(201).json(r.rows[0]);
  } catch { res.status(500).json({ error: "Could not save video" }); }
});

router.post("/feed-videos", async (req, res) => {
  const who = await actor(req);
  if (!who) { res.status(403).json({ error: NOT_ALLOWED }); return; }
  const { publicId, url, poster, title, location, category } = req.body ?? {};
  if (typeof publicId !== "string" || typeof url !== "string" || !url.startsWith("https://res.cloudinary.com/") || !String(title ?? "").trim()) {
    res.status(400).json({ error: "Missing video or title" }); return;
  }
  try {
    await ensureTable();
    const r = await pool.query(
      `INSERT INTO feed_videos (public_id, url, poster, title, location, village, lat, lng, member_id, category) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${COLS}, TRUE AS mine`,
      [publicId.slice(0, 200), url.slice(0, 500), typeof poster === "string" ? poster.slice(0, 500) : null, String(title).trim().slice(0, 120), String(location ?? "").trim().slice(0, 80) || null,
        text(req.body?.village, 60), lat(req.body?.lat), lng(req.body?.lng), who.member ? String(who.member.id) : null, cat(category)],
    );
    res.status(201).json(r.rows[0]);
  } catch { res.status(500).json({ error: "Could not save video" }); }
});

router.delete("/feed-videos/:id", async (req, res) => {
  const who = await actor(req);
  if (!who) { res.status(403).json({ error: NOT_ALLOWED }); return; }
  try {
    await ensureTable();
    if (!who.admin) {
      const own = await pool.query("SELECT member_id FROM feed_videos WHERE id=$1", [Number(req.params.id) || 0]);
      if (!own.rows[0] || own.rows[0].member_id !== String(who.member?.id)) { res.status(403).json({ error: "You can only delete your own videos." }); return; }
    }
    const r = await pool.query("DELETE FROM feed_videos WHERE id=$1 RETURNING public_id, source", [Number(req.params.id) || 0]);
    const c = cloud();
    if (r.rows[0]?.source === "github" && gh.token) {
      // remove the file from the repo too (best effort)
      const path = r.rows[0].public_id as string;
      ghFetch(`${path}?ref=${gh.branch}`).then((g) => g.json()).then((g: { sha?: string }) => {
        if (g.sha) ghFetch(path, { method: "DELETE", body: JSON.stringify({ message: "Remove video", sha: g.sha, branch: gh.branch }) }).catch(() => {});
      }).catch(() => {});
    } else if (r.rows[0] && c.name && c.key && c.secret) {
      // also remove the file from Cloudinary (best effort)
      const timestamp = Math.floor(Date.now() / 1000);
      const publicId = r.rows[0].public_id as string;
      const signature = sha1(`public_id=${publicId}&timestamp=${timestamp}${c.secret}`);
      fetch(`https://api.cloudinary.com/v1_1/${c.name}/video/destroy`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: c.key, signature }),
      }).catch(() => {});
    }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not delete" }); }
});

// ---- Admin: who may post videos --------------------------------------------------------------------------
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const cleanEmail = (v: unknown) => String(v ?? "").trim().toLowerCase().slice(0, 120);

router.get("/feed-videos-admin/uploaders", async (req, res) => {
  if (!isAdmin(req.header("x-admin-key"))) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTable();
    let rows;
    try {
      rows = (await pool.query(
        `SELECT u.email, u.approved, m.name, (m.id IS NOT NULL) AS "signedUp", (m.google_id IS NOT NULL) AS google
         FROM video_uploaders u LEFT JOIN members m ON LOWER(m.email) = u.email ORDER BY u.created_at`,
      )).rows;
    } catch {
      // nobody has signed up on the site yet, so the members table does not exist
      rows = (await pool.query(`SELECT email, approved, NULL AS name, FALSE AS "signedUp", FALSE AS google FROM video_uploaders ORDER BY created_at`)).rows;
    }
    res.json(rows);
  } catch { res.status(500).json({ error: "Could not load the list" }); }
});

router.post("/feed-videos-admin/uploaders", async (req, res) => {
  if (!isAdmin(req.header("x-admin-key"))) { res.status(403).json({ error: "Admin only" }); return; }
  const email = cleanEmail(req.body?.email);
  if (!emailOk(email)) { res.status(400).json({ error: "Enter a valid email address." }); return; }
  try {
    await ensureTable();
    await pool.query("INSERT INTO video_uploaders (email) VALUES ($1) ON CONFLICT DO NOTHING", [email]);
    res.status(201).json({ ok: true });
  } catch { res.status(500).json({ error: "Could not add" }); }
});

router.post("/feed-videos-admin/uploaders/approve", async (req, res) => {
  if (!isAdmin(req.header("x-admin-key"))) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTable();
    await pool.query("UPDATE video_uploaders SET approved = $2 WHERE email = $1", [cleanEmail(req.body?.email), req.body?.approved !== false]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not update" }); }
});

router.delete("/feed-videos-admin/uploaders", async (req, res) => {
  if (!isAdmin(req.header("x-admin-key"))) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTable();
    await pool.query("DELETE FROM video_uploaders WHERE email = $1", [cleanEmail(req.query.email)]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not remove" }); }
});

export default router;
