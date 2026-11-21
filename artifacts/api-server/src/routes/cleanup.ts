import { Router } from "express";
import { pool } from "@workspace/db";
import { isAdminKey } from "../lib/adminAuth";
import { runBackup } from "./backups";

// "Start fresh": the owner clears the test records before running ads. Nothing is deleted until a full backup has been saved first,
// and only the chosen groups are cleared. The website itself (services, products, projects, videos) is never touched here.
const router = Router();

const GROUPS: Record<string, { label: string; tables: string[] }> = {
  quotes: { label: "Quotes", tables: ["quotes"] },
  contracts: { label: "Contracts", tables: ["contracts"] },
  payments: { label: "Payments and receipts", tables: ["payments"] },
  jobs: { label: "Job progress", tables: ["job_status", "job_events"] },
  notifications: { label: "Client messages (notifications)", tables: ["notifications"] },
  inquiries: { label: "Contact-form messages", tables: ["inquiries"] },
  subscribers: { label: "Email list", tables: ["subscribers"] },
  carts: { label: "Shopping carts", tables: ["cart_items"] },
  accounts: { label: "Client accounts and referrals", tables: ["referrals", "member_settings", "members"] },
};

const exists = async (t: string) => (await pool.query("SELECT to_regclass($1) AS r", [`public.${t}`])).rows[0].r !== null;
const count = async (t: string) => ((await exists(t)) ? Number((await pool.query(`SELECT COUNT(*)::int AS n FROM "${t}"`)).rows[0].n) : 0);

router.get("/admin/cleanup", async (req, res) => {
  if (!isAdminKey(req.header("x-admin-key"))) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    const out = [];
    for (const [key, g] of Object.entries(GROUPS)) { let n = 0; for (const t of g.tables) n += await count(t); out.push({ key, label: g.label, count: n }); }
    res.json(out);
  } catch { res.status(500).json({ error: "Could not load." }); }
});

router.post("/admin/cleanup", async (req, res) => {
  if (!isAdminKey(req.header("x-admin-key"))) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    const keys = (Array.isArray(req.body?.groups) ? req.body.groups : []).map(String).filter((k: string) => GROUPS[k]);
    if (!keys.length) { res.status(400).json({ error: "Choose what to clear." }); return; }
    if (req.body?.confirm !== "DELETE") { res.status(400).json({ error: "Type DELETE to confirm." }); return; }
    // the safety copy comes first: if it cannot be made, nothing is deleted
    let backupId = 0;
    try { backupId = (await runBackup("manual")).id; } catch (e) { res.status(500).json({ error: `Nothing was deleted: the safety backup could not be made (${(e as Error).message}).` }); return; }
    const done: Record<string, number> = {};
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      for (const k of keys as string[]) {
        for (const t of GROUPS[k].tables) {
          if (!(await exists(t))) continue;
          const r = await c.query(`DELETE FROM "${t}"`);
          done[GROUPS[k].label] = (done[GROUPS[k].label] ?? 0) + (r.rowCount ?? 0);
          // numbering starts again from 1 (QT-00001, CT-00001) once the table is empty
          const hasId = (await c.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='id'", [t])).rows.length > 0;
          const seq = hasId ? (await c.query("SELECT pg_get_serial_sequence($1, 'id') AS s", [`public."${t}"`])).rows[0]?.s : null;
          if (seq) await c.query("SELECT setval($1, 1, false)", [seq]);
        }
      }
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
    res.json({ ok: true, backupId, cleared: done });
  } catch { res.status(500).json({ error: "Could not clear. Nothing was changed." }); }
});

export default router;
