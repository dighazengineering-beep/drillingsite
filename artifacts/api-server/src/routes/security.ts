import { Router, type Request, type Response, type NextFunction } from "express";
import { isAdminKey } from "../lib/adminAuth";
import { pool } from "@workspace/db";
import { smsOwner } from "./payments";

// Admin sign-in protection: a log of every sign-in, a text to the owner, and a temporary block after repeated wrong passwords.
const router = Router();
const isAdmin = (req: Request) => isAdminKey(req.header("x-admin-key"));

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS admin_logins (
      id SERIAL PRIMARY KEY,
      ok BOOLEAN NOT NULL,
      ip TEXT NOT NULL DEFAULT '',
      device TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS admin_logins_at_idx ON admin_logins (created_at DESC)`).then(() => undefined).catch((e) => { ready = null; throw e; });
  return ready;
}

/** "Chrome on Android" style label from a browser's user-agent text. */
export function deviceOf(ua: string): string {
  const os = /android/i.test(ua) ? "Android" : /iphone|ipad|ios/i.test(ua) ? "iPhone/iPad" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "Mac" : /linux/i.test(ua) ? "Linux" : "Unknown device";
  const br = /edg\//i.test(ua) ? "Edge" : /opr\/|opera/i.test(ua) ? "Opera" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}

const MAX_FAILS = 8, WINDOW_MS = 10 * 60_000, BLOCK_MS = 15 * 60_000;
const fails = new Map<string, number[]>();
const blockedUntil = new Map<string, number>();
const ipOf = (req: Request) => String(req.ip ?? "x");
const recentFails = (ip: string) => {
  const now = Date.now();
  const list = (fails.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  fails.set(ip, list);
  return list;
};
async function log(ok: boolean, req: Request, note = "") {
  try {
    await ensureTable();
    await pool.query("INSERT INTO admin_logins (ok, ip, device, note) VALUES ($1,$2,$3,$4)", [ok, ipOf(req).slice(0, 64), String(req.header("user-agent") ?? "").slice(0, 300), note]);
  } catch { /* logging must never block anything */ }
}

// Runs before every route: anyone sending a wrong admin password too many times is blocked for a while.
export function adminGuard(req: Request, res: Response, next: NextFunction) {
  const sent = req.header("x-admin-key");
  if (typeof sent !== "string" || !sent) { next(); return; }
  const ip = ipOf(req);
  const until = blockedUntil.get(ip) ?? 0;
  if (until > Date.now()) { res.status(429).json({ error: "Too many wrong attempts. Try again in a few minutes." }); return; }
  if (isAdmin(req)) { next(); return; }
  const list = recentFails(ip);
  list.push(Date.now());
  if (list.length >= MAX_FAILS) {
    blockedUntil.set(ip, Date.now() + BLOCK_MS); fails.delete(ip);
    void log(false, req, "Blocked for 15 minutes after repeated wrong passwords");
    smsOwner(`Dighaz admin alert: ${MAX_FAILS} wrong admin passwords from one device (${deviceOf(String(req.header("user-agent") ?? ""))}). It is blocked for 15 minutes.`);
  } else void log(false, req, "Wrong password");
  next(); // the route itself still answers "not admin"
}
router.use(adminGuard);

/** Logs a correct admin sign-in and texts the owner when it comes from a device not seen in the last 30 minutes. */
export async function recordAdminSignIn(req: Request, how = "Signed in", changeHint = "change ADMIN_KEY on Render") {
  const device = deviceOf(String(req.header("user-agent") ?? ""));
  try {
    await ensureTable();
    const same = await pool.query(
      "SELECT 1 FROM admin_logins WHERE ok AND ip=$1 AND device=$2 AND created_at > now() - interval '30 minutes' LIMIT 1", [ipOf(req).slice(0, 64), String(req.header("user-agent") ?? "").slice(0, 300)]);
    await log(true, req, how);
    if (!same.rows.length) smsOwner(`Dighaz admin: someone signed in to the admin panel (${device}). If it was not you, ${changeHint}.`);
  } catch { /* never block a real sign-in */ }
}

// The admin sign-in form calls this. A correct password is logged and the owner is told.
router.post("/admin/login", async (req, res) => {
  if (!isAdmin(req)) { res.json({ admin: false }); return; }
  await recordAdminSignIn(req);
  res.json({ admin: true });
});

router.get("/admin/security", async (req, res) => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureTable();
    const r = await pool.query(`SELECT id, ok, ip, device, note, created_at AS "createdAt" FROM admin_logins ORDER BY id DESC LIMIT 100`);
    res.json(r.rows.map((x) => ({ ...x, deviceLabel: deviceOf(x.device) })));
  } catch { res.json([]); }
});

export default router;
