import { Router } from "express";
import { db, productsTable, servicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Admin editing of products and services (prices, details, stock). All routes need the ADMIN_KEY header.
const router = Router();

const isAdmin = (key: unknown) => {
  const k = process.env.ADMIN_KEY;
  return !!k && typeof key === "string" && key === k;
};
router.use("/admin", (req, res, next) => {
  if (!isAdmin(req.header("x-admin-key"))) { res.status(403).json({ error: "Admin only" }); return; }
  next();
});

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const optStr = (v: unknown, max: number) => str(v, max) || null;
const money = (v: unknown): string | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : null;
};
const int = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const lines = (v: unknown): string[] => (Array.isArray(v) ? v : String(v ?? "").split("\n")).map((x) => String(x).trim()).filter(Boolean).slice(0, 30);
const specsFrom = (v: unknown): Record<string, string> => {
  if (v && typeof v === "object" && !Array.isArray(v)) return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, String(x)]));
  const out: Record<string, string> = {};
  String(v ?? "").split("\n").forEach((l) => { const i = l.indexOf(":"); if (i > 0) out[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  return out;
};
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

/* ---------- products ---------- */
function productPatch(b: Record<string, unknown>, creating: boolean) {
  const p: Partial<typeof productsTable.$inferInsert> = {};
  if (creating || "name" in b) p.name = str(b.name, 120);
  if (creating || "category" in b) p.category = str(b.category, 80);
  if (creating || "description" in b) p.description = str(b.description, 3000);
  if (creating || "price" in b) { const m = money(b.price); if (m === null) throw new Error("Enter a valid price"); p.price = m; }
  if ("comparePrice" in b) p.comparePrice = money(b.comparePrice);
  if ("brand" in b) p.brand = optStr(b.brand, 80);
  if ("inStock" in b) p.inStock = !!b.inStock;
  if ("stockQty" in b) p.stockQty = int(b.stockQty);
  if ("imageUrl" in b) p.imageUrl = optStr(b.imageUrl, 500);
  if ("specifications" in b) p.specifications = specsFrom(b.specifications);
  if ("deliveryAvailable" in b) p.deliveryAvailable = !!b.deliveryAvailable;
  if ("deliveryDays" in b) p.deliveryDays = int(b.deliveryDays);
  if ("whatsappOrderEnabled" in b) p.whatsappOrderEnabled = !!b.whatsappOrderEnabled;
  if ("featured" in b) p.featured = !!b.featured;
  if (creating && (!p.name || !p.category || !p.description)) throw new Error("Name, category and description are required");
  return p;
}

router.get("/admin/products", async (_req, res) => {
  const rows = await db.select().from(productsTable);
  res.json(rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
});
router.patch("/admin/products/:id", async (req, res) => {
  try {
    const patch = productPatch(req.body ?? {}, false);
    delete patch.name; // photos are matched by product name, so renaming is not allowed here
    if (Object.keys(patch).length === 0) { res.status(400).json({ error: "Nothing to change" }); return; }
    const [row] = await db.update(productsTable).set(patch).where(eq(productsTable.id, Number(req.params.id) || 0)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Invalid input" }); }
});
router.post("/admin/products", async (req, res) => {
  try {
    const p = productPatch(req.body ?? {}, true);
    let slug = slugify(p.name!) || "product";
    const taken = (await db.select({ s: productsTable.slug }).from(productsTable)).map((r) => r.s);
    for (let i = 2; taken.includes(slug); i++) slug = `${slugify(p.name!)}-${i}`;
    const [row] = await db.insert(productsTable).values({ ...p, slug } as typeof productsTable.$inferInsert).returning();
    res.status(201).json(row);
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Invalid input" }); }
});
router.delete("/admin/products/:id", async (req, res) => {
  await db.delete(productsTable).where(eq(productsTable.id, Number(req.params.id) || 0));
  res.json({ ok: true });
});

/* ---------- services ---------- */
function servicePatch(b: Record<string, unknown>, creating: boolean) {
  const p: Partial<typeof servicesTable.$inferInsert> = {};
  if (creating || "name" in b) p.name = str(b.name, 120);
  if (creating || "category" in b) p.category = str(b.category, 80);
  if (creating || "shortDescription" in b) p.shortDescription = str(b.shortDescription, 300);
  if (creating || "description" in b) p.description = str(b.description, 4000);
  if ("priceFrom" in b) p.priceFrom = money(b.priceFrom);
  if ("priceUnit" in b) p.priceUnit = optStr(b.priceUnit, 60);
  if ("duration" in b) p.duration = optStr(b.duration, 60);
  if ("imageUrl" in b) p.imageUrl = optStr(b.imageUrl, 500);
  if ("featured" in b) p.featured = !!b.featured;
  if ("highlights" in b) p.highlights = lines(b.highlights);
  if ("coverageAreas" in b) p.coverageAreas = lines(b.coverageAreas);
  if (creating && (!p.name || !p.category || !p.shortDescription || !p.description)) throw new Error("Name, category and descriptions are required");
  return p;
}

router.get("/admin/services", async (_req, res) => {
  const rows = await db.select().from(servicesTable);
  res.json(rows.sort((a, b) => a.name.localeCompare(b.name)));
});
router.patch("/admin/services/:id", async (req, res) => {
  try {
    const patch = servicePatch(req.body ?? {}, false);
    if (Object.keys(patch).length === 0) { res.status(400).json({ error: "Nothing to change" }); return; }
    const [row] = await db.update(servicesTable).set(patch).where(eq(servicesTable.id, Number(req.params.id) || 0)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Invalid input" }); }
});
router.post("/admin/services", async (req, res) => {
  try {
    const p = servicePatch(req.body ?? {}, true);
    let slug = slugify(p.name!) || "service";
    const taken = (await db.select({ s: servicesTable.slug }).from(servicesTable)).map((r) => r.s);
    for (let i = 2; taken.includes(slug); i++) slug = `${slugify(p.name!)}-${i}`;
    const [row] = await db.insert(servicesTable).values({ ...p, slug } as typeof servicesTable.$inferInsert).returning();
    res.status(201).json(row);
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Invalid input" }); }
});
router.delete("/admin/services/:id", async (req, res) => {
  await db.delete(servicesTable).where(eq(servicesTable.id, Number(req.params.id) || 0));
  res.json({ ok: true });
});

export default router;
