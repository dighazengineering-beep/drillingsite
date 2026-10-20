import { db, productsTable, servicesTable, projectsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { NEW_PROJECTS, PROJECT_UPDATES } from "./projectsData";
import { MORE_PROJECTS } from "./projectsMore";
import { PROJECT_STORIES, PROJECT_RENAMES } from "./projectStories";
import { logger } from "./logger";

// Idempotent catalog corrections applied on startup (runs against the live database).
export async function applyCatalogFixes() {
  try {
    await db
      .update(productsTable)
      .set({
        name: "Borehole Screen & Steel Casing 6 inch",
        price: "17500.00",
        description:
          "Slotted borehole screen and plain steel casing for water intake and borehole lining. Prevents sand ingress while maximising yield. Supplied in 6 m lengths.",
        specifications: { Diameter: "6 inch", Length: "6 m each", "Slot Size": "0.5mm" },
      })
      .where(and(eq(productsTable.slug, "stainless-steel-borehole-screen-6inch"), eq(productsTable.price, "8500.00")));
    await db
      .update(productsTable)
      .set({ price: "5500.00" })
      .where(and(eq(productsTable.slug, "upvc-borehole-casing-6inch"), eq(productsTable.price, "3500.00")));
    await db
      .update(productsTable)
      .set({ price: "680000.00", comparePrice: null })
      .where(and(eq(productsTable.slug, "reverse-osmosis-500lph"), eq(productsTable.price, "380000.00")));
    // New product: JA Solar Panel 550W (inserted once if missing)
    const existing = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.slug, "ja-solar-panel-550w"));
    if (existing.length === 0) {
      await db.insert(productsTable).values({
        name: "JA Solar Panel 550W",
        slug: "ja-solar-panel-550w",
        category: "Solar Panels",
        brand: "JA Solar",
        description: "550W mono half-cell solar panel for solar pumping and power systems. Efficient, durable and suited to Kenyan sunshine.",
        price: "30000.00",
        comparePrice: null,
        inStock: true,
        stockQty: 100,
        imageUrl: null,
        specifications: { Power: "550W", Type: "Mono half-cell", Brand: "JA Solar" },
        deliveryAvailable: true,
        deliveryDays: 2,
        whatsappOrderEnabled: true,
        featured: false,
      });
    }
    // New service: Borehole Inspection (inserted once if missing)
    const svc = await db
      .select({ id: servicesTable.id })
      .from(servicesTable)
      .where(eq(servicesTable.slug, "borehole-inspection"));
    if (svc.length === 0) {
      await db.insert(servicesTable).values({
        name: "Borehole Inspection",
        slug: "borehole-inspection",
        category: "Inspection",
        shortDescription: "Camera inspection of your borehole to check casing, screens, depth and water entry points.",
        description:
          "We lower a high-resolution borehole camera down your borehole and watch the live video on a monitor. It shows the condition of the casing and screens, any blockage, silt or damage, the true depth, and where water enters.\n\nUseful for older boreholes with falling yield, before installing or replacing a pump, and for checking new work. A video recording of the inspection can be provided.\n\nInspection cost: Ksh. 25,000",
        imageUrl: null,
        featured: false,
        priceFrom: "25000.00",
        priceUnit: "per borehole",
        duration: "Half day",
        highlights: [
          "Live camera view of casing and screens",
          "Finds blockages, damage and water entry points",
          "Video recording available",
        ],
        coverageAreas: [],
      });
    }
  } catch (err) {
    logger.warn({ err }, "Catalog fixes failed");
  }
  await applyProjectFixes();
}

// Project categories, realistic depths and extra projects. Safe to run on every start.
async function applyProjectFixes() {
  try {
    for (const u of PROJECT_UPDATES) {
      const [row] = await db.select().from(projectsTable).where(eq(projectsTable.slug, u.slug));
      if (!row) continue;
      // Only change a project that still has its old depth, so later manual edits are kept.
      if (row.depth !== u.oldDepth) continue;
      const patch: Partial<typeof row> = { depth: u.depth, serviceType: u.serviceType };
      for (const [field, pair] of Object.entries(u.replace ?? {})) {
        const key = field as "description" | "challenge" | "solution" | "outcome";
        const current = row[key];
        if (pair && current) patch[key] = current.replace(pair[0], pair[1]);
      }
      await db.update(projectsTable).set(patch).where(eq(projectsTable.slug, u.slug));
    }
    for (const p of [...NEW_PROJECTS, ...MORE_PROJECTS]) {
      await db.insert(projectsTable).values(p).onConflictDoNothing({ target: projectsTable.slug });
    }
    // Real stories. Skip a project once its description has been rewritten (stories have paragraph breaks).
    for (const [slug, s] of Object.entries(PROJECT_STORIES)) {
      const [row] = await db.select().from(projectsTable).where(eq(projectsTable.slug, slug));
      if (!row || row.description.includes("\n\n")) continue;
      const patch: Partial<typeof row> = { ...s };
      if (PROJECT_RENAMES[slug]) patch.title = PROJECT_RENAMES[slug];
      await db.update(projectsTable).set(patch).where(eq(projectsTable.slug, slug));
    }
  } catch (err) {
    logger.warn({ err }, "Project fixes failed");
  }
}
