import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();
/** Only the host name (no password) so we can see which database the server is really using. */
const dbHost = () => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return "unreadable"; } };

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// touches the database so a free host (Supabase, Aiven...) counts the project as active
router.get("/db-ping", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ok", db: "up", host: dbHost() }); }
  catch (e) { console.error("db-ping failed", e); res.status(503).json({ status: "error", db: "down", host: dbHost(), reason: String((e as Error)?.message ?? e).slice(0, 120) }); }
});

export default router;
