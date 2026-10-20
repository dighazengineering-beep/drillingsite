import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

let ready: Promise<unknown> | null = null;
function ensureTables() {
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS video_likes (
      video_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (video_id, client_id)
    );
    CREATE TABLE IF NOT EXISTS video_stats (
      video_id TEXT PRIMARY KEY,
      views INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0
    );
  `).catch((e) => { ready = null; throw e; });
  return ready;
}

const vid = (s: string) => String(s).slice(0, 120);
const cid = (s: unknown) => String(s ?? "").slice(0, 64);

// Everything the feed needs in one call: counts per video, plus which ones this visitor has liked.
router.get("/video-stats", async (req, res) => {
  try {
    await ensureTables();
    const client = cid(req.query.clientId);
    const [likes, stats, mine, comments] = await Promise.all([
      pool.query("SELECT video_id, COUNT(*)::int AS n FROM video_likes GROUP BY video_id"),
      pool.query("SELECT video_id, views, shares FROM video_stats"),
      client ? pool.query("SELECT video_id FROM video_likes WHERE client_id = $1", [client]) : Promise.resolve({ rows: [] as { video_id: string }[] }),
      pool.query("SELECT video_id, COUNT(*)::int AS n FROM video_comments GROUP BY video_id").catch(() => ({ rows: [] as { video_id: string; n: number }[] })),
    ]);
    const out: Record<string, { likes: number; views: number; shares: number; comments: number }> = {};
    const row = (id: string) => (out[id] ??= { likes: 0, views: 0, shares: 0, comments: 0 });
    likes.rows.forEach((r) => (row(r.video_id).likes = r.n));
    stats.rows.forEach((r) => { row(r.video_id).views = r.views; row(r.video_id).shares = r.shares; });
    comments.rows.forEach((r) => (row(r.video_id).comments = r.n));
    res.json({ stats: out, liked: mine.rows.map((r) => r.video_id) });
  } catch { res.json({ stats: {}, liked: [] }); }
});

// like / unlike (one like per visitor per video)
router.post("/video-stats/:id/like", async (req, res) => {
  const client = cid(req.body?.clientId);
  if (!client) { res.status(400).json({ error: "clientId required" }); return; }
  try {
    await ensureTables();
    if (req.body?.liked === false) await pool.query("DELETE FROM video_likes WHERE video_id=$1 AND client_id=$2", [vid(req.params.id), client]);
    else await pool.query("INSERT INTO video_likes (video_id, client_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [vid(req.params.id), client]);
    const r = await pool.query("SELECT COUNT(*)::int AS n FROM video_likes WHERE video_id=$1", [vid(req.params.id)]);
    res.json({ likes: r.rows[0].n });
  } catch { res.status(500).json({ error: "Could not save like" }); }
});

for (const kind of ["view", "share"] as const) {
  router.post(`/video-stats/:id/${kind}`, async (req, res) => {
    try {
      await ensureTables();
      const col = kind === "view" ? "views" : "shares";
      await pool.query(
        `INSERT INTO video_stats (video_id, ${col}) VALUES ($1, 1) ON CONFLICT (video_id) DO UPDATE SET ${col} = video_stats.${col} + 1`,
        [vid(req.params.id)],
      );
      res.json({ ok: true });
    } catch { res.status(500).json({ error: "Could not save" }); }
  });
}

export default router;
