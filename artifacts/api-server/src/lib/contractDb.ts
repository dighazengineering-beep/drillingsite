import { pool } from "@workspace/db";
import type { Stage } from "./contractRules";

let ready: Promise<void> | null = null;
/** The contracts table, and the two columns that tie a payment to a contract step. Safe to call many times. */
export function ensureContractTables(): Promise<void> {
  ready ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contracts (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        quote_token TEXT NOT NULL,
        quote_id INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        item TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'other',
        casing TEXT NOT NULL DEFAULT '',
        depth NUMERIC NOT NULL DEFAULT 0,
        quote_rate NUMERIC NOT NULL DEFAULT 0,
        agreed_rate NUMERIC NOT NULL DEFAULT 0,
        quote_total NUMERIC NOT NULL,
        agreed_total NUMERIC NOT NULL,
        mobilization NUMERIC NOT NULL DEFAULT 0,
        onsite_pct INTEGER NOT NULL DEFAULT 0,
        stages JSONB NOT NULL DEFAULT '[]',
        location TEXT NOT NULL DEFAULT '',
        lines JSONB,
        footer TEXT NOT NULL DEFAULT '',
        terms TEXT NOT NULL DEFAULT '',
        signed_name TEXT NOT NULL DEFAULT '',
        signed_at TIMESTAMPTZ,
        signed_ip TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signature TEXT NOT NULL DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS client_stamp TEXT NOT NULL DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS client_id_no TEXT NOT NULL DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS client_address TEXT NOT NULL DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS client_email TEXT NOT NULL DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS witness_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS witness_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS witness_sig TEXT NOT NULL DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS pay_mode TEXT NOT NULL DEFAULT 'mpesa';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS site_day TEXT NOT NULL DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS id_match TEXT NOT NULL DEFAULT '';
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS id_source TEXT NOT NULL DEFAULT '';
      CREATE TABLE IF NOT EXISTS contract_ids (
        id SERIAL PRIMARY KEY, contract_token TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (contract_token, kind)
      );
      CREATE TABLE IF NOT EXISTS contract_signers (
        id SERIAL PRIMARY KEY, contract_token TEXT NOT NULL, role TEXT NOT NULL, name TEXT NOT NULL, id_no TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
        token TEXT NOT NULL UNIQUE, signature TEXT NOT NULL DEFAULT '', stamp TEXT NOT NULL DEFAULT '', signed_at TIMESTAMPTZ, signed_ip TEXT NOT NULL DEFAULT '', signed_device TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE contract_signers ADD COLUMN IF NOT EXISTS relation TEXT NOT NULL DEFAULT '';
      ALTER TABLE contract_signers ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS contract_signers_ct ON contract_signers (contract_token);
      CREATE TABLE IF NOT EXISTS contract_events (
        id SERIAL PRIMARY KEY, contract_token TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now(), actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS contract_events_ct ON contract_events (contract_token);
      CREATE INDEX IF NOT EXISTS contracts_quote_idx ON contracts (quote_token);
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY, phone TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'service', item TEXT NOT NULL,
        pay_type TEXT NOT NULL DEFAULT 'full', amount NUMERIC NOT NULL, agreed_total NUMERIC NOT NULL, method TEXT NOT NULL DEFAULT 'mpesa', status TEXT NOT NULL DEFAULT 'pending',
        checkout_id TEXT, receipt TEXT NOT NULL DEFAULT '', bank_ref TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS contract_token TEXT;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS stage TEXT;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_no INTEGER;
      CREATE UNIQUE INDEX IF NOT EXISTS payments_contract_stage_live ON payments (contract_token, stage) WHERE contract_token IS NOT NULL AND status IN ('pending','paid')`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

export const contractNo = (id: number) => `CT-${String(id).padStart(5, "0")}`;
/** The name a contract's payments are filed under, so every payment shows the contract it belongs to. */
export const contractItem = (c: { id: number; item: string }) => `${c.item} (Contract ${contractNo(c.id)})`.slice(0, 140);

export interface StageView extends Stage { status: "paid" | "pending" | "open"; paidId?: number }
export interface ContractView {
  token: string; no: string; quoteId: number; name: string; phone: string; item: string; kind: string; casing: string; depth: number; location: string;
  quoteRate: number; agreedRate: number; quoteTotal: number; agreedTotal: number; discount: number; mobilization: number; onsitePct: number;
  stages: StageView[]; paid: number; pending: number; remaining: number; signed: boolean; signedName: string; signedAt: string | null; signature: string; stamp: string; witnessName: string; witnessId: string; witnessSig: string; payMode: string; siteDay: string;
  lines: unknown; footer: string; terms: string; createdAt: string;
  idNo: string; address: string; email: string; quoteToken: string;
}

/** A contract with each step's real payment state. Paid and remaining come only from confirmed payments, so they always add up to the agreed price. */
export async function loadContract(token: string): Promise<ContractView | null> {
  await ensureContractTables();
  const r = await pool.query("SELECT * FROM contracts WHERE token=$1", [String(token).slice(0, 40)]);
  const c = r.rows[0];
  if (!c) return null;
  const pays = (await pool.query("SELECT id, stage, status, amount FROM payments WHERE contract_token=$1 AND status IN ('pending','paid') ORDER BY id", [c.token])).rows;
  const whole = pays.find((x) => x.stage === "all");   // one payment of the full balance covers every step that was still unpaid
  const stages = (c.stages as Stage[]).map((s): StageView => {
    const p = pays.find((x) => x.stage === s.id && x.status === "paid") ?? pays.find((x) => x.stage === s.id) ?? whole;
    return { ...s, status: p ? (p.status === "paid" ? "paid" : "pending") : "open", paidId: p?.status === "paid" ? p.id : undefined };
  });
  const paid = stages.filter((s) => s.status === "paid").reduce((a, s) => a + s.amount, 0);
  const pending = stages.filter((s) => s.status === "pending").reduce((a, s) => a + s.amount, 0);
  const agreedTotal = Math.round(Number(c.agreed_total)), quoteTotal = Math.round(Number(c.quote_total));
  return {
    token: c.token, no: contractNo(c.id), quoteId: c.quote_id, name: c.name, phone: c.phone, item: c.item, kind: c.kind, casing: c.casing, depth: Number(c.depth), location: c.location,
    quoteRate: Number(c.quote_rate), agreedRate: Number(c.agreed_rate), quoteTotal, agreedTotal, discount: quoteTotal - agreedTotal, mobilization: Number(c.mobilization), onsitePct: c.onsite_pct,
    stages, paid, pending, remaining: agreedTotal - paid, signed: !!c.signed_at, signedName: c.signed_name, signedAt: c.signed_at ? new Date(c.signed_at).toISOString() : null, signature: c.signature ?? "", stamp: c.client_stamp ?? "", witnessName: c.witness_name ?? "", witnessId: c.witness_id ?? "", witnessSig: c.witness_sig ?? "", payMode: c.pay_mode ?? "mpesa", siteDay: c.site_day ?? "",
    lines: c.lines, footer: c.footer, terms: c.terms, createdAt: new Date(c.created_at).toISOString(),
    idNo: c.client_id_no ?? "", address: c.client_address ?? "", email: c.client_email ?? "", quoteToken: c.quote_token,
  };
}
