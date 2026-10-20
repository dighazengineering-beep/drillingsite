import { Router } from "express";
import { db, productsTable } from "@workspace/db";
import { eq, ilike, and, gte, lte, or, sql } from "drizzle-orm";
import {
  GetProductParams,
  ListProductsQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/products/categories", async (_req, res) => {
  const results = await db.select().from(productsTable);
  const counts: Record<string, number> = {};
  for (const p of results) {
    counts[p.category] = (counts[p.category] ?? 0) + 1;
  }
  const categories = Object.entries(counts).map(([name, count]) => ({
    name,
    count,
    imageUrl: null,
  }));
  res.json(categories);
});

router.get("/products/featured", async (_req, res) => {
  const results = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.featured, true))
    .limit(12);
  res.json(results.map(serializeProduct));
});

router.get("/products", async (req, res) => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};

  const page = params.page ?? 1;
  const limit = params.limit ?? 24;
  const offset = (page - 1) * limit;

  let allProducts = await db.select().from(productsTable);

  if (params.category) {
    allProducts = allProducts.filter(p =>
      p.category.toLowerCase().includes(params.category!.toLowerCase())
    );
  }
  if (params.inStock !== undefined) {
    allProducts = allProducts.filter(p => p.inStock === params.inStock);
  }
  if (params.search) {
    const term = params.search.toLowerCase();
    allProducts = allProducts.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.description.toLowerCase().includes(term) ||
      (p.brand ?? "").toLowerCase().includes(term)
    );
  }
  if (params.minPrice !== undefined) {
    allProducts = allProducts.filter(p => parseFloat(p.price) >= params.minPrice!);
  }
  if (params.maxPrice !== undefined) {
    allProducts = allProducts.filter(p => parseFloat(p.price) <= params.maxPrice!);
  }

  const total = allProducts.length;
  const items = allProducts.slice(offset, offset + limit).map(serializeProduct);

  res.json({ items, total, page, limit });
});

router.get("/products/:id", async (req, res) => {
  const parsed = GetProductParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, parsed.data.id));
  if (!product) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeProduct(product));
});

function serializeProduct(p: typeof productsTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    category: p.category,
    brand: p.brand ?? null,
    description: p.description,
    price: parseFloat(p.price),
    comparePrice: p.comparePrice !== null ? parseFloat(p.comparePrice) : null,
    inStock: p.inStock,
    stockQty: p.stockQty ?? null,
    imageUrl: p.imageUrl ?? null,
    specifications: (p.specifications as Record<string, string>) ?? {},
    deliveryAvailable: p.deliveryAvailable,
    deliveryDays: p.deliveryDays ?? null,
    whatsappOrderEnabled: p.whatsappOrderEnabled,
  };
}

export default router;
