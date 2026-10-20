import { Router } from "express";
import { db, servicesTable, productsTable } from "@workspace/db";

const router = Router();

router.get("/catalog/summary", async (_req, res) => {
  const services = await db.select().from(servicesTable);
  const products = await db.select().from(productsTable);

  const serviceCategories = new Set(services.map(s => s.category)).size;
  const productCategories = new Set(products.map(p => p.category)).size;

  res.json({
    totalServices: services.length,
    totalProducts: products.length,
    productCategories,
    serviceCategories,
    countiesServed: 47,
    yearsExperience: 15,
    projectsCompleted: 2400,
  });
});

router.get("/catalog/service-categories", async (_req, res) => {
  const services = await db.select().from(servicesTable);
  const counts: Record<string, number> = {};
  for (const s of services) {
    counts[s.category] = (counts[s.category] ?? 0) + 1;
  }
  const categories = Object.entries(counts).map(([name, count]) => ({
    name,
    count,
    imageUrl: null,
  }));
  res.json(categories);
});

export default router;
