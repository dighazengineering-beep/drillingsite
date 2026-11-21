import crypto from "node:crypto";

/**
 * Who counts as admin.
 *  1. Anyone who sends the ADMIN_KEY set on the server (the admin password), as before.
 *  2. Anyone who sends an admin session token. The server hands one out only after Google itself has confirmed that the
 *     person owns one of the ADMIN_EMAILS addresses (see routes/adminGoogle.ts). The email list is checked again on every
 *     request, so removing an address from it ends that person's access straight away.
 * ADMIN_EMAILS is a comma-separated list on the server; if it is not set, the company address below is used.
 */
const DEFAULT_ADMIN_EMAILS = "dighazengineeringltd@gmail.com,dighazengineering@gmail.com";
export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? DEFAULT_ADMIN_EMAILS).split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

const SECRET = `adm:${process.env.MEMBER_SECRET || process.env.ADMIN_KEY || crypto.randomBytes(32).toString("hex")}`;
const PREFIX = "gadm.";
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (data: string) => crypto.createHmac("sha256", SECRET).update(data).digest("base64url");

export function mintAdminToken(email: string): string {
  const body = b64(JSON.stringify({ e: email.toLowerCase(), exp: Date.now() + 30 * 24 * 3600 * 1000 }));
  return `${PREFIX}${body}.${sign(body)}`;
}

export function isAdminKey(key: unknown): boolean {
  if (typeof key !== "string" || !key) return false;
  const k = process.env.ADMIN_KEY;
  if (k && key === k) return true;
  if (!key.startsWith(PREFIX)) return false;
  const [body, sig] = key.slice(PREFIX.length).split(".");
  if (!body || !sig) return false;
  const good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof p.e === "string" && p.exp > Date.now() && adminEmails().includes(p.e);
  } catch {
    return false;
  }
}
