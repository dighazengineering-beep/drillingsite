import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// On Vercel many copies of the server can run at once, so each keeps only a few database connections and lets idle ones go.
// Aiven (and any host with its own certificate authority): keep SSL on but do not verify the certificate chain.
// Aiven's free plan also allows only 20 connections, so the pool stays small.
const relaxed = /aivencloud\.com/i.test(process.env.DATABASE_URL) || process.env.DB_SSL === "relaxed";
const dbUrl = relaxed ? process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*&?/i, "$1").replace(/[?&]$/, "") : process.env.DATABASE_URL;
export const pool = new Pool({
  connectionString: dbUrl,
  ...(relaxed ? { ssl: { rejectUnauthorized: false }, max: 6, idleTimeoutMillis: 20_000, connectionTimeoutMillis: 20_000 } : {}),
  ...(process.env.VERCEL ? { max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 15_000 } : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./ensure";
