import { Router } from "express";
import { pool } from "@workspace/db";
import { memberFrom } from "./members";

const router = Router();

// Table is created on first use, so no manual database step is needed.
let ready: Promise<unknown> | null = null;
function ensureTable() {
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS video_comments (
      id SERIAL PRIMARY KEY,
      video_id TEXT NOT NULL,
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS video_comments_video_idx ON video_comments (video_id, created_at DESC);
    ALTER TABLE video_comments ADD COLUMN IF NOT EXISTS parent_id INTEGER;
    ALTER TABLE video_comments ADD COLUMN IF NOT EXISTS reply_to_name TEXT;
    ALTER TABLE video_comments ADD COLUMN IF NOT EXISTS member_id TEXT;
    CREATE TABLE IF NOT EXISTS video_comment_likes (
      comment_id INTEGER NOT NULL,
      client_id TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (comment_id, client_id)
    );
  `).catch((e) => { ready = null; throw e; });
  return ready;
}

// Admin = anyone who sends the ADMIN_KEY set on the server. If ADMIN_KEY is not set, nobody is admin.
const isAdmin = (key: unknown) => {
  const k = process.env.ADMIN_KEY;
  return !!k && typeof key === "string" && key === k;
};

// Simple per-IP limit: 6 comments per minute.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 6) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list);
  return false;
}

router.get("/video-comments/counts", async (_req, res) => {
  try {
    await ensureTable();
    const r = await pool.query("SELECT video_id, COUNT(*)::int AS n FROM video_comments GROUP BY video_id");
    res.json(Object.fromEntries(r.rows.map((x) => [x.video_id, x.n])));
  } catch { res.json({}); }
});

router.post("/video-comments/admin-check", (req, res) => {
  res.json({ admin: isAdmin(req.header("x-admin-key")) });
});

// Admin: latest comments across all videos, for moderating in one place
router.get("/video-comments-admin/recent", async (req, res) => {
  if (!isAdmin(req.header("x-admin-key"))) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTable();
    const r = await pool.query("SELECT id, video_id AS \"videoId\", name, body, created_at AS \"createdAt\" FROM video_comments ORDER BY created_at DESC LIMIT 100");
    res.json(r.rows);
  } catch { res.status(500).json({ error: "Could not load comments" }); }
});

const SHAPE = `c.id, c.name, c.body, c.created_at AS "createdAt", c.parent_id AS "parentId", c.reply_to_name AS "replyTo",
  (SELECT COUNT(*)::int FROM video_comment_likes l WHERE l.comment_id = c.id) AS likes,
  EXISTS (SELECT 1 FROM video_comment_likes l WHERE l.comment_id = c.id AND l.client_id = $2) AS liked,
  (c.member_id IS NOT NULL AND c.member_id = $3) AS mine`;
const clientOf = (v: unknown) => String(v ?? "").slice(0, 64);

router.get("/video-comments/:videoId", async (req, res) => {
  try {
    await ensureTable();
    const member = await memberFrom(req).catch(() => null);
    const r = await pool.query(
      `SELECT ${SHAPE} FROM video_comments c WHERE c.video_id = $1 ORDER BY c.created_at DESC LIMIT 400`,
      [req.params.videoId.slice(0, 120), clientOf(req.query.clientId), member ? String(member.id) : ""],
    );
    res.json(r.rows);
  } catch { res.status(500).json({ error: "Could not load comments" }); }
});

// Reading comments and liking are open to everyone. Writing a comment needs a signed-in account.
router.post("/video-comments/:videoId", async (req, res) => {
  const member = await memberFrom(req).catch(() => null);
  if (!member) { res.status(401).json({ error: "Please log in to comment." }); return; }
  const name = String(member.name ?? "").trim().replace(/\s+/g, " ").slice(0, 40) || "Member";
  const body = String(req.body?.body ?? "").trim().slice(0, 300);
  if (!body) { res.status(400).json({ error: "Write a comment first" }); return; }
  if (limited(req.ip ?? "unknown")) { res.status(429).json({ error: "Too many comments, please wait a minute" }); return; }
  try {
    await ensureTable();
    const videoId = req.params.videoId.slice(0, 120);
    // A reply always hangs under the top comment of its thread (like Facebook) and remembers who it answered.
    let parentId: number | null = null;
    let replyTo: string | null = null;
    const target = Number(req.body?.parentId) || 0;
    if (target) {
      const t = await pool.query("SELECT id, parent_id, name FROM video_comments WHERE id = $1 AND video_id = $2", [target, videoId]);
      if (!t.rows[0]) { res.status(404).json({ error: "That comment is no longer there." }); return; }
      parentId = t.rows[0].parent_id ?? t.rows[0].id;
      replyTo = t.rows[0].name;
    }
    const ins = await pool.query(
      "INSERT INTO video_comments (video_id, name, body, parent_id, reply_to_name, member_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [videoId, name, body, parentId, replyTo, String(member.id)],
    );
    const r = await pool.query(`SELECT ${SHAPE} FROM video_comments c WHERE c.id = $1`, [ins.rows[0].id, clientOf(req.body?.clientId), String(member.id)]);
    res.status(201).json(r.rows[0]);
  } catch { res.status(500).json({ error: "Could not save comment" }); }
});

router.post("/video-comments/:id/like", async (req, res) => {
  const id = Number(req.params.id) || 0;
  const client = clientOf(req.body?.clientId);
  if (!id || !client) { res.status(400).json({ error: "Could not like this comment" }); return; }
  try {
    await ensureTable();
    const exists = await pool.query("SELECT 1 FROM video_comments WHERE id = $1", [id]);
    if (!exists.rows[0]) { res.status(404).json({ error: "That comment is no longer there." }); return; }
    const removed = await pool.query("DELETE FROM video_comment_likes WHERE comment_id = $1 AND client_id = $2", [id, client]);
    const liked = !removed.rowCount;
    if (liked) await pool.query("INSERT INTO video_comment_likes (comment_id, client_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, client]);
    const n = await pool.query("SELECT COUNT(*)::int AS n FROM video_comment_likes WHERE comment_id = $1", [id]);
    res.json({ liked, likes: n.rows[0].n });
  } catch { res.status(500).json({ error: "Could not like this comment" }); }
});

// The admin can delete any comment. A member can delete their own. Deleting a comment also removes the replies under it.
router.delete("/video-comments/:id", async (req, res) => {
  try {
    await ensureTable();
    const id = Number(req.params.id) || 0;
    const row = (await pool.query("SELECT id, member_id FROM video_comments WHERE id = $1", [id])).rows[0];
    if (!row) { res.json({ ok: true, ids: [] }); return; }
    const member = await memberFrom(req).catch(() => null);
    const own = !!member && !!row.member_id && row.member_id === String(member.id);
    if (!own && !isAdmin(req.header("x-admin-key"))) { res.status(403).json({ error: "You can only delete your own comments." }); return; }
    const gone = await pool.query("DELETE FROM video_comments WHERE id = $1 OR parent_id = $1 RETURNING id", [id]);
    const ids = gone.rows.map((x) => x.id as number);
    await pool.query("DELETE FROM video_comment_likes WHERE comment_id = ANY($1::int[])", [ids]);
    res.json({ ok: true, ids });
  } catch { res.status(500).json({ error: "Could not delete" }); }
});

export default router;
