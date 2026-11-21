import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const relaxed = /aivencloud\.com/i.test(process.env.DATABASE_URL) || process.env.DB_SSL === "relaxed";
const u = new URL(process.env.DATABASE_URL);

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: relaxed
    ? { host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), ssl: { rejectUnauthorized: false } }
    : { url: process.env.DATABASE_URL },
});
