import { pgTable, serial, text, boolean, numeric, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull(),
  brand: text("brand"),
  description: text("description").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  comparePrice: numeric("compare_price", { precision: 12, scale: 2 }),
  inStock: boolean("in_stock").notNull().default(true),
  stockQty: integer("stock_qty"),
  imageUrl: text("image_url"),
  specifications: jsonb("specifications").$type<Record<string, string>>().notNull().default({}),
  deliveryAvailable: boolean("delivery_available").notNull().default(true),
  deliveryDays: integer("delivery_days"),
  whatsappOrderEnabled: boolean("whatsapp_order_enabled").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
