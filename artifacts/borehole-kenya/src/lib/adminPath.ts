/** The secret address of the admin panel. It is NOT /admin. To use another one, set VITE_ADMIN_PATH on Vercel (for example /office-k7x2q9). */
const raw = String(import.meta.env.VITE_ADMIN_PATH ?? "").trim().replace(/[^A-Za-z0-9\-_/]/g, "").replace(/\/+$/, "");
export const ADMIN_PATH = raw.length >= 4 ? (raw.startsWith("/") ? raw : `/${raw}`) : "/dighaz-hq-3a91c7e2b5d8";
