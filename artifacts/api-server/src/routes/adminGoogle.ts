import { Router } from "express";
import { adminEmails, mintAdminToken } from "../lib/adminAuth";
import { recordAdminSignIn } from "./security";

// Sign in to the admin area with Google. The browser sends the Google ID token; Google confirms who it belongs to,
// and only addresses on the admin list (ADMIN_EMAILS) are let in. The result works wherever the admin password works.
const router = Router();

const tries = new Map<string, number[]>();
function limited(ip: string, max = 20, windowMs = 600_000) {
  const now = Date.now();
  const list = (tries.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) { tries.set(ip, list); return true; }
  list.push(now); tries.set(ip, list);
  return false;
}

router.post("/auth/admin-google", async (req, res) => {
  if (limited(req.ip ?? "x")) { res.status(429).json({ error: "Too many attempts. Try again in a few minutes." }); return; }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const credential = typeof req.body?.credential === "string" ? req.body.credential.slice(0, 4000) : "";
  if (!clientId) { res.status(503).json({ error: "Google sign-in is not switched on yet." }); return; }
  if (!credential) { res.status(400).json({ error: "Missing Google sign-in." }); return; }
  try {
    const g = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    const info: any = await g.json();
    if (!g.ok || info.aud !== clientId || !(info.email_verified === true || info.email_verified === "true") || !info.email) {
      res.status(401).json({ error: "Google sign-in could not be verified." }); return;
    }
    const email = String(info.email).toLowerCase();
    if (!adminEmails().includes(email)) { res.status(403).json({ error: `${email} is not an admin account.` }); return; }
    await recordAdminSignIn(req, `Signed in with Google (${email})`, "remove that address from ADMIN_EMAILS on Render");
    res.json({ adminKey: mintAdminToken(email), email });
  } catch {
    res.status(500).json({ error: "Google sign-in failed. Try again." });
  }
});

export default router;
