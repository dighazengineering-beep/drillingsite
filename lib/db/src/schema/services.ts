import { pgTable, serial, text, boolean, numeric, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const servicesTable = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull(),
  shortDescription: text("short_description").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url"),
  featured: boolean("featured").notNull().default(false),
  priceFrom: numeric("price_from", { precision: 12, scale: 2 }),
  priceUnit: text("price_unit"),
  duration: text("duration"),
  highlights: jsonb("highlights").$type<string[]>().notNull().default([]),
  coverageAreas: jsonb("coverage_areas").$type<string[]>().notNull().default([]),
});

export const insertServiceSchema = createInsertSchema(servicesTable).omit({ id: true });
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof servicesTable.$inferSelect;
