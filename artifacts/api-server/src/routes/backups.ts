import { Router, type Request } from "express";
import { isAdminKey } from "../lib/adminAuth";
import zlib from "node:zlib";
import { pool } from "@workspace/db";
import { smsOwner } from "./payments";

// Backups of the database. A copy is made every week by itself (and on demand). The last 4 are kept in the database for quick
// downloads, and when BACKUP_GITHUB_REPO is set (a PRIVATE repo, "owner/name") each copy is also saved there and the last 8 are kept.
const router = Router();
const isAdmin = (req: Request) => isAdminKey(req.header("x-admin-key"));

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS backups (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'auto',
      bytes INTEGER NOT NULL DEFAULT 0,
      table_count INTEGER NOT NULL DEFAULT 0,
      row_count INTEGER NOT NULL DEFAULT 0,
      offsite TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      data BYTEA,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`).then(() => undefined).catch((e) => { ready = null; throw e; });
  return ready;
}

const ghRepo = () => (process.env.BACKUP_GITHUB_REPO ?? "").trim();
const ghToken = () => process.env.BACKUP_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
const gh = (path: string, init: RequestInit = {}) =>
  fetch(`https://api.github.com/repos/${ghRepo()}/contents/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${ghToken()}`, Accept: "application/vnd.github+json", "User-Agent": "dighaz-engineering", ...(init.headers ?? {}) },
  });

let running = false;
/** Reads every table, packs it into one compressed file, stores it, and tidies old copies. */
export async function runBackup(kind: "auto" | "manual"): Promise<{ id: number; offsite: string; note: string }> {
  if (running) throw new Error("A backup is already running.");
  running = true;
  try {
    await ensureTable();
    const tl = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('backups','admin_logins') ORDER BY tablename");
    const tables: Record<string, unknown[]> = {};
    let rowCount = 0;
    // Pictures, scans and Word files are big. Copying them moves gigabytes and fills the free database, so they are left out:
    // every binary column, the report pictures table, the receipt photos and the saved ID/KRA/land scans.
    const bin = await pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND data_type='bytea'");
    const heavy: Record<string, string[]> = { payments: ["receipt_img"], client_docs: ["data"] };
    for (const b of bin.rows as { table_name: string; column_name: string }[]) (heavy[b.table_name] ??= []).push(b.column_name);
    for (const { tablename } of tl.rows as { tablename: string }[]) {
      if (!/^[a-z0-9_]+$/i.test(tablename) || tablename === "hydro_files") continue;
      const drop = (heavy[tablename] ?? []).filter((c) => /^[a-z0-9_]+$/i.test(c));
      const r = await pool.query(`SELECT to_jsonb(t) - $1::text[] AS row FROM "${tablename}" t`, [drop]);
      tables[tablename] = r.rows.map((x) => x.row);
      rowCount += r.rows.length;
    }
    const createdAt = new Date().toISOString();
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify({ app: "Dighaz Engineering Limited", createdAt, tables })));

    let offsite = "", note = "";
    if (ghRepo() && ghToken()) {
      try {
        const stamp = createdAt.slice(0, 16).replace(/[:T]/g, "-");
        const path = `backups/backup-${stamp}.json.gz`;
        const put = await gh(path, { method: "PUT", body: JSON.stringify({ message: `Backup ${stamp}`, content: gz.toString("base64") }) });
        if (put.ok) {
          offsite = path;
          const list = await gh("backups").then((x) => (x.ok ? x.json() : [])).catch(() => []);
          const files = (Array.isArray(list) ? list : []).filter((f: { name: string }) => /^backup-.*\.json\.gz$/.test(f.name)).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
          for (const old of files.slice(0, Math.max(0, files.length - 8)) as { path: string; sha: string }[]) {
            await gh(old.path, { method: "DELETE", body: JSON.stringify({ message: "Remove old backup", sha: old.sha }) }).catch(() => {});
          }
        } else note = `Could not save to GitHub (${put.status}). Check BACKUP_GITHUB_REPO and the token.`;
      } catch { note = "Could not reach GitHub."; }
    } else note = "Saved in the database only. Set BACKUP_GITHUB_REPO (a private repo) to also keep copies off the server.";

    const ins = await pool.query(
      "INSERT INTO backups (kind, bytes, table_count, row_count, offsite, note, data) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [kind, gz.length, Object.keys(tables).length, rowCount, offsite, note, gz]);
    await pool.query("UPDATE backups SET data = NULL WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT 4)");
    await pool.query("DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT 40)");
    return { id: ins.rows[0].id, offsite, note };
  } finally { running = false; }
}

router.get("/admin/backups", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTable();
    const r = await pool.query(`SELECT id, kind, bytes, table_count AS "tableCount", row_count AS "rowCount", offsite, note, (data IS NOT NULL) AS downloadable, created_at AS "createdAt" FROM backups ORDER BY id DESC LIMIT 20`);
    res.json({ offsiteOn: !!(ghRepo() && ghToken()), backups: r.rows });
  } catch { res.json({ offsiteOn: false, backups: [] }); }
});

router.post("/admin/backups", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try { res.json({ ok: true, ...(await runBackup("manual")) }); }
  catch (e) { res.status(500).json({ error: (e as Error).message || "Backup failed." }); }
});

router.get("/admin/backups/:id/download", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTable();
    const r = await pool.query("SELECT data, created_at FROM backups WHERE id=$1", [Number(req.params.id) || 0]);
    if (!r.rows[0]?.data) { res.status(404).json({ error: "That copy is no longer stored here. Older ones are in your backup repo." }); return; }
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="backup-${new Date(r.rows[0].created_at).toISOString().slice(0, 10)}.json.gz"`);
    res.send(r.rows[0].data);
  } catch { res.status(500).json({ error: "Could not download." }); }
});

// On Vercel there is no always-on process, so a daily schedule calls this instead (vercel.json "crons"). Vercel sends
// "Authorization: Bearer <CRON_SECRET>" itself once CRON_SECRET is set; without that secret nobody can call it.
router.get("/cron/backup", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.header("authorization") !== `Bearer ${secret}`) { res.status(403).json({ error: "Not allowed" }); return; }
  await weekly();
  res.json({ ok: true });
});

// Weekly timer: checks every 6 hours, and 2 minutes after the server starts (it may have been asleep).
async function weekly() {
  try {
    await ensureTable();
    const r = await pool.query("SELECT MAX(created_at) AS last FROM backups");
    const last = r.rows[0]?.last ? new Date(r.rows[0].last).getTime() : 0;
    if (Date.now() - last > 7 * 86_400_000) {
      const b = await runBackup("auto");
      if (b.note && /Could not/.test(b.note)) smsOwner(`Dighaz backup: the weekly backup was made but ${b.note}`);
    }
  } catch { /* try again at the next check */ }
}
if (process.env.DATABASE_URL && process.env.NODE_ENV !== "test") {
  setTimeout(() => void weekly(), 120_000).unref();
  setInterval(() => void weekly(), 6 * 3_600_000).unref();
}

export default router;
