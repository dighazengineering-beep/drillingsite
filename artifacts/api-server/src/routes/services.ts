import { Router } from "express";
import { db, servicesTable } from "@workspace/db";
import { eq, ilike } from "drizzle-orm";
import { GetServiceParams, ListServicesQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/services", async (req, res) => {
  const parsed = ListServicesQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};

  let query = db.select().from(servicesTable);

  if (params.category) {
    const results = await db
      .select()
      .from(servicesTable)
      .where(ilike(servicesTable.category, `%${params.category}%`));
    const featured = typeof params.featured === "boolean"
      ? results.filter(s => s.featured === params.featured)
      : results;
    res.json(featured.map(serializeService));
    return;
  }

  const results = await db.select().from(servicesTable);
  const filtered = typeof params.featured === "boolean"
    ? results.filter(s => s.featured === params.featured)
    : results;
  res.json(filtered.map(serializeService));
});

router.get("/services/:id", async (req, res) => {
  const parsed = GetServiceParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [service] = await db
    .select()
    .from(servicesTable)
    .where(eq(servicesTable.id, parsed.data.id));
  if (!service) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeService(service));
});

function serializeService(s: typeof servicesTable.$inferSelect) {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    category: s.category,
    shortDescription: s.shortDescription,
    description: s.description,
    imageUrl: s.imageUrl ?? null,
    featured: s.featured,
    priceFrom: s.priceFrom !== null ? parseFloat(s.priceFrom) : null,
    priceUnit: s.priceUnit ?? null,
    duration: s.duration ?? null,
    highlights: Array.isArray(s.highlights) ? s.highlights : [],
    coverageAreas: Array.isArray(s.coverageAreas) ? s.coverageAreas : [],
  };
}

export default router;
