import { pool } from "./index";

let done: Promise<void> | null = null;

/** Creates the catalogue tables (products, projects, services, inquiries, cart) when a database is new and empty. Safe to run every time. */
export function ensureCatalogTables(): Promise<void> {
  done ??= pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, category TEXT NOT NULL, brand TEXT, description TEXT NOT NULL,
      price NUMERIC(12,2) NOT NULL, compare_price NUMERIC(12,2), in_stock BOOLEAN NOT NULL DEFAULT true, stock_qty INTEGER, image_url TEXT,
      specifications JSONB NOT NULL DEFAULT '{}', delivery_available BOOLEAN NOT NULL DEFAULT true, delivery_days INTEGER,
      whatsapp_order_enabled BOOLEAN NOT NULL DEFAULT true, featured BOOLEAN NOT NULL DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, county TEXT NOT NULL, town TEXT NOT NULL, region TEXT NOT NULL,
      client_type TEXT NOT NULL, service_type TEXT NOT NULL, depth INTEGER, yield TEXT, duration TEXT, completion_year INTEGER NOT NULL,
      description TEXT NOT NULL, challenge TEXT, solution TEXT, outcome TEXT, image_url TEXT, featured BOOLEAN NOT NULL DEFAULT false,
      latitude NUMERIC(10,7), longitude NUMERIC(10,7), created_at TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, category TEXT NOT NULL, short_description TEXT NOT NULL,
      description TEXT NOT NULL, image_url TEXT, featured BOOLEAN NOT NULL DEFAULT false, price_from NUMERIC(12,2), price_unit TEXT, duration TEXT,
      highlights JSONB NOT NULL DEFAULT '[]', coverage_areas JSONB NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS inquiries (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, county TEXT, inquiry_type TEXT NOT NULL, service_id INTEGER,
      message TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS cart_items (
      id SERIAL PRIMARY KEY, session_id TEXT NOT NULL, product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `).then(() => undefined).catch((e) => { done = null; throw e; });
  return done;
}
