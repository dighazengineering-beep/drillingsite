import { pgTable, serial, text, boolean, numeric, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  county: text("county").notNull(),
  town: text("town").notNull(),
  region: text("region").notNull(),
  clientType: text("client_type").notNull(),
  serviceType: text("service_type").notNull(),
  depth: integer("depth"),
  yield: text("yield"),
  duration: text("duration"),
  completionYear: integer("completion_year").notNull(),
  description: text("description").notNull(),
  challenge: text("challenge"),
  solution: text("solution"),
  outcome: text("outcome"),
  imageUrl: text("image_url"),
  featured: boolean("featured").notNull().default(false),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
