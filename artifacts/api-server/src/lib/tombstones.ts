import { pool } from "@workspace/db";

/** Remembers what the admin deleted, so startup seeding does not bring it back. */
let ready: Promise<unknown> | null = null;
const ensure = () => (ready ??= pool.query(`CREATE TABLE IF NOT EXISTS deleted_items (kind TEXT NOT NULL, slug TEXT NOT NULL, PRIMARY KEY (kind, slug))`).catch((e) => { ready = null; throw e; }));

export async function markDeleted(kind: "product" | "service" | "project", slug: string) {
  try { await ensure(); await pool.query("INSERT INTO deleted_items (kind, slug) VALUES ($1,$2) ON CONFLICT DO NOTHING", [kind, slug]); } catch { /* best effort */ }
}
export async function deletedSlugs(kind: "product" | "service" | "project"): Promise<Set<string>> {
  try { await ensure(); const r = await pool.query("SELECT slug FROM deleted_items WHERE kind=$1", [kind]); return new Set(r.rows.map((x) => x.slug)); } catch { return new Set(); }
}
