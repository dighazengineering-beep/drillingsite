import { Router } from "express";
import { pool } from "@workspace/db";
import { keyOk } from "./payments";
import { phoneOf } from "./reportOrders";

/** A client's saved documents (ID front/back, KRA PIN, land ownership). Optional. Kept so the same client doesn't upload them again for the next report or permit. Only the client's own link (phone + key) opens them. */
const router = Router();
export const DOC_KINDS = ["id_front", "id_back", "kra", "land"] as const;
export const DOC_LABELS: Record<string, string> = { id_front: "National ID (front)", id_back: "National ID (back)", kra: "KRA PIN certificate", land: "Land ownership document" };

let ready: Promise<void> | null = null;
export const ensureDocs = () => (ready ??= pool.query(`CREATE TABLE IF NOT EXISTS client_docs (
  phone TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (phone, kind))`).then(() => {}).catch((e) => { ready = null; throw e; }));

/** Saved documents of a client, as data URLs, for the report appendix and permit forms. */
export async function savedDocs(phone: string, kinds: readonly string[] = DOC_KINDS): Promise<Record<string, string>> {
  await ensureDocs();
  const r = await pool.query("SELECT kind, data FROM client_docs WHERE phone=$1 AND kind = ANY($2)", [phone, kinds as string[]]);
  return Object.fromEntries(r.rows.map((x) => [x.kind as string, x.data as string]));
}

const who = (req: any, res: any): string | null => {
  const phone = phoneOf(req.query.phone ?? req.body?.phone);
  if (!phone || !keyOk(phone, String(req.query.key ?? req.body?.key ?? ""))) { res.status(401).json({ error: "Open the link we sent you first." }); return null; }
  return phone;
};
const okKind = (k: string) => (DOC_KINDS as readonly string[]).includes(k);

router.get("/my-docs", async (req, res) => {
  try {
    const phone = who(req, res); if (!phone) return;
    await ensureDocs();
    const r = await pool.query("SELECT kind, data FROM client_docs WHERE phone=$1", [phone]);
    res.json(Object.fromEntries(r.rows.map((x) => [x.kind, x.data])));
  } catch { res.status(500).json({ error: "Could not load your documents." }); }
});

router.put("/my-docs/:kind", async (req, res) => {
  try {
    const phone = who(req, res); if (!phone) return;
    const kind = String(req.params.kind), data = String(req.body?.data ?? "");
    if (!okKind(kind)) return void res.status(400).json({ error: "Unknown document." });
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 1_800_000) return void res.status(400).json({ error: "Use a photo or scan (JPG or PNG)." });
    await ensureDocs();
    await pool.query("INSERT INTO client_docs (phone, kind, data) VALUES ($1,$2,$3) ON CONFLICT (phone, kind) DO UPDATE SET data=EXCLUDED.data, updated_at=now()", [phone, kind, data]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not save the document." }); }
});

router.delete("/my-docs/:kind", async (req, res) => {
  try {
    const phone = who(req, res); if (!phone) return;
    if (!okKind(String(req.params.kind))) return void res.status(400).json({ error: "Unknown document." });
    await ensureDocs();
    await pool.query("DELETE FROM client_docs WHERE phone=$1 AND kind=$2", [phone, String(req.params.kind)]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not remove the document." }); }
});

export default router;
