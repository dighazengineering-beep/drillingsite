import { Router } from "express";
import { db, projectsTable } from "@workspace/db";
import { eq, ilike, and, SQL } from "drizzle-orm";

const router = Router();

router.get("/projects", async (req, res) => {
  const { county, serviceType, clientType, featured, page = "1", limit = "12" } = req.query as Record<string, string>;

  const conditions: SQL[] = [];
  if (county) conditions.push(ilike(projectsTable.county, `%${county}%`));
  if (serviceType) conditions.push(ilike(projectsTable.serviceType, `%${serviceType}%`));
  if (clientType) conditions.push(ilike(projectsTable.clientType, `%${clientType}%`));
  if (featured === "true") conditions.push(eq(projectsTable.featured, true));

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 12));
  const offset = (pageNum - 1) * limitNum;

  const all = conditions.length > 0
    ? await db.select().from(projectsTable).where(and(...conditions)).orderBy(projectsTable.completionYear)
    : await db.select().from(projectsTable).orderBy(projectsTable.completionYear);

  const total = all.length;
  const items = all.slice(offset, offset + limitNum).map(serializeProject);

  res.json({ items, total, page: pageNum, limit: limitNum });
});

router.get("/projects/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeProject(project));
});

function serializeProject(p: typeof projectsTable.$inferSelect) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    county: p.county,
    town: p.town,
    region: p.region,
    clientType: p.clientType,
    serviceType: p.serviceType,
    depth: p.depth ?? null,
    yield: p.yield ?? null,
    duration: p.duration ?? null,
    completionYear: p.completionYear,
    description: p.description,
    challenge: p.challenge ?? null,
    solution: p.solution ?? null,
    outcome: p.outcome ?? null,
    imageUrl: p.imageUrl ?? null,
    featured: p.featured,
    latitude: p.latitude !== null ? parseFloat(p.latitude) : null,
    longitude: p.longitude !== null ? parseFloat(p.longitude) : null,
  };
}

export default router;
