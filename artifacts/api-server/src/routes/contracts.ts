import { shareButtons } from "../lib/shareButtons";
import { Router } from "express";
import crypto from "node:crypto";
import qrcode from "qrcode-generator";
import { pool } from "@workspace/db";
import { isAdminKey } from "../lib/adminAuth";
import { companyInfo } from "../lib/company";
import { LOGO_PNG_B64 } from "../lib/logoData";
import { stampSvg, stampDate } from "../lib/companyStamp";
import { smsOwner, bankAccounts, contractReceiptHtmls } from "./payments";
import { emailClient, siteUrl as mailSite } from "../lib/mailer";
import { itemsTable, linesOf, itemise } from "./quotes";
import { checkPrice, buildSchedule, kindOfService } from "../lib/contractRules";
import { OFFICE } from "../lib/receiptPage";
import { termsFor } from "../lib/contractTerms";
import { ensureContractTables, loadContract, contractNo } from "../lib/contractDb";
import { withMobilization, DRILLING_MOBILIZATION, type BuiltLine } from "../lib/quoteLines";

// Contracts: a quote plus the price the client and we agreed, the payment steps and the terms. The client's details are printed on it; both parties then sign and stamp the printed copy.
// The client fills in the quote form, then the agreed price. The server checks the price against secret floors (../lib/contractRules.ts).
const router = Router();

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const kes = (n: number) => `KSh ${Math.round(n).toLocaleString("en-KE")}`;
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "long" }) : "");

// Rate limit: at most `max` requests a minute from one address for one kind of request (stops guessing of private links and repeated signing tries).
const hits = new Map<string, number[]>();
function tooMany(req: { ip?: string }, kind: string, max: number): boolean {
  const k = `${kind}:${req.ip ?? ""}`, now = Date.now();
  const recent = (hits.get(k) ?? []).filter((t) => now - t < 60_000); recent.push(now); hits.set(k, recent);
  if (hits.size > 5000) for (const [key, v] of hits) if (!v.some((t) => now - t < 60_000)) hits.delete(key);
  return recent.length > max;
}
const slow = (res: { status(n: number): { json(b: unknown): void } }) => res.status(429).json({ error: "Too many tries. Please wait a minute and try again." });
const newSignerToken = () => crypto.randomBytes(12).toString("hex");
const deviceOf = (req: { ip?: string; header(n: string): string | undefined }) => `${String(req.ip ?? "").slice(0, 45)} · ${String(req.header("user-agent") ?? "").slice(0, 110)}`;
async function logEvent(token: string, actor: string, action: string, detail = "") {
  try { await pool.query("INSERT INTO contract_events (contract_token, actor, action, detail) VALUES ($1,$2,$3,$4)", [token, actor, action, detail.slice(0, 300)]); } catch { /* history is best-effort */ }
}
const isLocked = async (token: string) => (await pool.query("SELECT 1 FROM payments WHERE contract_token=$1 AND status='paid' LIMIT 1", [token])).rows.length > 0;
const okPng = (v: string, max = 250_000) => /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= max && v.length >= 1000;

router.post("/contracts", async (req, res) => {
  try {
    await ensureContractTables();
    const b = req.body ?? {};
    const qr = await pool.query("SELECT id, token, name, phone, kind, item, casing, depth::float AS depth, rate::float AS rate, total::float AS total, deposit_pct AS dep, location, lines, footer, agreed_total::float AS best FROM quotes WHERE token=$1", [str(b.quoteToken, 40)]);
    const q = qr.rows[0];
    if (!q) { res.status(404).json({ error: "Quote not found. Please fill in the form again." }); return; }
    if (q.kind !== "service" || / \+ /.test(q.item)) { res.status(400).json({ error: "A contract covers one service. Please make a separate contract for each service." }); return; }
    // "Change my details": the client went back and made the contract again, so the earlier one (not signed, nothing paid) is removed instead of left behind
    const replaceTok = str(b.replaceToken, 40);
    if (replaceTok) {
      const prev = (await pool.query("SELECT id, signed_at FROM contracts WHERE token=$1 AND phone=$2", [replaceTok, q.phone])).rows[0];
      if (prev && !prev.signed_at && !(await pool.query("SELECT 1 FROM payments WHERE contract_token=$1 AND status IN ('pending','paid') LIMIT 1", [replaceTok])).rows.length) await pool.query("DELETE FROM contracts WHERE id=$1", [prev.id]);
    }
    const kind = kindOfService(q.item, q.depth, q.rate);
    const noInput = (v: unknown) => v === undefined || v === null || v === "";
    const price = Number(q.best) > 0 && Number(q.best) < Number(q.total) && noInput(b.agreedRate) && noInput(b.agreedTotal) && q.depth > 0 === (kind === "drill" || kind === "opendrill")
      ? { ok: true as const, agreedTotal: Math.round(q.best), agreedRate: q.depth > 0 ? Math.round(q.best / q.depth) : 0 } // the price the owner agreed on the quote
      : checkPrice(kind, q, { rate: b.agreedRate, total: b.agreedTotal });
    if (!price.ok) { res.status(400).json({ error: price.error }); return; }
    // the client's details are printed on the contract, so only the signature and stamp are left to do by hand
    const idNo = str(b.idNo, 20), address = str(b.address, 120), email = str(b.email, 80);
    if (!/^[A-Za-z0-9][A-Za-z0-9 \/.-]{4,19}$/.test(idNo)) { res.status(400).json({ error: "Enter your ID or passport number." }); return; }
    const witnessName = str(b.witnessName, 80), witnessId = str(b.witnessId, 20);   // optional: the witness box is only printed when a witness is named
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: "Enter your email address. We send you the contract and every payment update there." }); return; }
    const payMode = ["mpesa", "bank", "cheque", "cash"].includes(String(b.payMode)) ? String(b.payMode) : "mpesa";
    // the day the Client wants the rig on site (not in the past, within a year); printed in the timeline clause
    let siteDay = "", siteDayText = "";
    if (b.siteDay) {
      const d = new Date(`${String(b.siteDay).slice(0, 10)}T12:00:00+03:00`);
      const today = Date.now() - 24 * 3600_000, limit = Date.now() + 366 * 24 * 3600_000;
      if (!Number.isFinite(d.getTime()) || d.getTime() < today || d.getTime() > limit) { res.status(400).json({ error: "Choose a site day from today onwards (within a year)." }); return; }
      siteDay = d.toISOString().slice(0, 10);
      siteDayText = d.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }
    const sched = buildSchedule(kind, price.agreedTotal, { mobilization: b.mobilization, onsitePct: b.onsitePct, depositPct: Number(q.dep) || 70, plan: b.payPlan, steps: b.payPlan === "full" ? undefined : b.steps });
    if (!sched.ok) { res.status(400).json({ error: sched.error }); return; }
    const co = companyInfo();
    const lastStage = sched.stages[sched.stages.length - 1]!;
    const terms = termsFor(kind, co.legalName, sched.stages.length === 1, { finalPct: Math.round((lastStage.amount * 100) / price.agreedTotal), siteDay: siteDayText });
    // drilling: the quotation table is built again at the AGREED price, so its TOTAL DRILLING COST is the contract price (the stored quote keeps its own lines)
    let contractLines: unknown = q.lines;
    if (kind === "drill") {
      const again = await itemise(q.item, true, Math.round(q.depth), q.casing, price.agreedTotal);
      if (again) contractLines = withMobilization(again.lines, sched.mobilization > 0 ? sched.mobilization : DRILLING_MOBILIZATION, price.agreedTotal);
    }
    const old = (await pool.query("SELECT id, token, signed_at FROM contracts WHERE quote_token=$1", [q.token])).rows[0];
    if (old) {
      const paidAny = (await pool.query("SELECT 1 FROM payments WHERE contract_token=$1 AND status IN ('pending','paid') LIMIT 1", [old.token])).rows.length > 0;
      if (old.signed_at || paidAny) { res.json({ token: old.token, existing: true }); return; }   // never change a contract that is signed or has a payment
      await pool.query("DELETE FROM contracts WHERE id=$1", [old.id]);
    }
    const token = crypto.randomBytes(12).toString("hex");
    // the quote also shows the price the client agreed
    if (price.agreedTotal < Math.round(q.total)) await pool.query("UPDATE quotes SET agreed_total=$1 WHERE id=$2", [price.agreedTotal, q.id]).catch(() => {});
    const ins = await pool.query(
      `INSERT INTO contracts (token,quote_token,quote_id,name,phone,item,kind,casing,depth,quote_rate,agreed_rate,quote_total,agreed_total,mobilization,onsite_pct,stages,location,lines,footer,terms,client_id_no,client_address,client_email,witness_name,witness_id,pay_mode,site_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING id`,
      [token, q.token, q.id, q.name, q.phone, q.item, kind, q.casing, q.depth, q.rate, price.agreedRate, Math.round(q.total), price.agreedTotal, sched.mobilization, sched.onsitePct,
        JSON.stringify(sched.stages), q.location ?? "", contractLines ? JSON.stringify(contractLines) : null, q.footer ?? "", terms, idNo, address, email, witnessName, witnessId, payMode, siteDay]);
    await logEvent(token, "Client", "Contract created", `${q.item}, ${kes(price.agreedTotal)}`);
    const idMatch = ["strong", "weak", "unverified"].includes(String(b.idMatch)) ? String(b.idMatch) : "";
    await pool.query("UPDATE contracts SET id_match=$2, id_source=$3 WHERE token=$1", [token, idMatch, b.idSource === "photo" ? "photo" : "scan"]);
    if (idMatch) await logEvent(token, "Client", "Scanned ID", `${idMatch === "strong" ? "names and ID number match" : idMatch === "weak" ? "partly matched" : "not matched"}${b.idSource === "photo" ? " (photo)" : ""}`);
    const signerLinks: { role: string; name: string; link: string }[] = [];   // the private links are shown to the client ONCE, in this answer: nobody can read them again from the main link
    for (const [role, n, i, ph, rel] of [["witness", witnessName, witnessId, str(b.witnessPhone, 20), str(b.witnessRelation, 40)], ["lawyer", str(b.lawyerName, 80), str(b.lawyerId, 20), str(b.lawyerPhone, 20), ""]] as const) {
      if (n.length >= 2) { const st = newSignerToken(); await pool.query("INSERT INTO contract_signers (contract_token, role, name, id_no, phone, relation, token) VALUES ($1,$2,$3,$4,$5,$6,$7)", [token, role, n, i, ph, rel, st]); await logEvent(token, "Client", `Added ${role}`, n); signerLinks.push({ role, name: n, link: `${mailSite()}/sign/${st}` }); }
    }
    smsOwner(`New contract ${contractNo(ins.rows[0].id)}: ${q.item}, agreed ${kes(price.agreedTotal)}${price.agreedTotal < Math.round(q.total) ? ` (quoted ${kes(q.total)})` : ""} for ${q.name} (${q.phone}).`);
    if (email) emailClient(email, `Your contract ${contractNo(ins.rows[0].id)}: ${q.item}`,
      `Hello ${q.name},\n\nYour contract for ${q.item} is ready. The agreed price is ${kes(price.agreedTotal)}.\n\nOpen it to read it, print it, sign and stamp it, and pay each step when it is due. Keep this email: the link brings the contract back any time.`,
      { text: "Open my contract", url: `${mailSite()}/contract/${token}` });
    res.json({ token, signerLinks });
  } catch { res.status(500).json({ error: "Could not make the contract. Please try again." }); }
});

// The client's view. It carries no secret numbers (the floors are never sent).
router.get("/contracts/:token", async (req, res) => {
  try {
    const c = await loadContract(String(req.params.token));
    if (!c) { res.status(404).json({ error: "Contract not found" }); return; }
    res.json({ ...c, signature: undefined, witnessSig: undefined, hasSignature: !!c.signature, hasWitnessSig: !!c.witnessSig });   // the drawn signature itself is only printed on the contract page
  } catch { res.status(500).json({ error: "Could not load the contract." }); }
});

// Sign online: the client draws their signature on the contract page. The picture, the time and the device address are kept with the contract.
router.post("/contracts/:token/sign", async (req, res) => {
  if (tooMany(req, "sign", 10)) { slow(res); return; }
  try {
    const c = await loadContract(String(req.params.token));
    if (!c) { res.status(404).json({ error: "Contract not found" }); return; }
    if (c.signed) { res.status(409).json({ error: "This contract is already signed." }); return; }
    const sig = String(req.body?.signature ?? "");
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 250_000 || sig.length < 1500) { res.status(400).json({ error: "Please draw your signature in the box." }); return; }
    if (req.body?.agree !== true) { res.status(400).json({ error: "Please tick the box to confirm you have read the contract." }); return; }
    const cst = String(req.body?.stamp ?? "");
    if (cst && !okPng(cst, 300_000)) { res.status(400).json({ error: "That stamp picture is not accepted. Try another photo." }); return; }
    await pool.query("UPDATE contracts SET signature=$2, client_stamp=$4, signed_name=name, signed_at=now(), signed_ip=$3 WHERE token=$1 AND signed_at IS NULL", [c.token, sig, String(req.ip ?? "").slice(0, 60), cst]);
    await logEvent(c.token, "Client", "Signed the contract", deviceOf(req));
    smsOwner(`Contract ${c.no} signed online by ${c.name} (${c.phone}): ${c.item}, ${kes(c.agreedTotal)}.`);
    if (c.email) emailClient(c.email, `Contract ${c.no} signed`, `Hello ${c.name},\n\nThank you. You signed contract ${c.no} for ${c.item} on ${day(new Date().toISOString())}. Keep this email: the link opens your signed contract any time, and you can print or save it as a PDF.`, { text: "Open my signed contract", url: `${mailSite()}/contract/${c.token}` });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not save the signature. Please try again." }); }
});

// The client deletes their own signature (a wrong one) and signs again: only until the first payment is confirmed, and always written to the history.
router.delete("/contracts/:token/signature", async (req, res) => {
  if (tooMany(req, "unsign", 10)) { slow(res); return; }
  try {
    const t = String(req.params.token);
    const c = await loadContract(t); if (!c) { res.status(404).json({ error: "Contract not found" }); return; }
    if (await isLocked(t)) { res.status(409).json({ error: "The first payment is confirmed, so the contract is locked." }); return; }
    if (!c.signed) { res.status(409).json({ error: "There is no signature to delete." }); return; }
    await pool.query("UPDATE contracts SET signature='', signed_name='', signed_at=NULL, signed_ip='' WHERE token=$1", [t]);
    await logEvent(t, "Client", "Deleted their signature", deviceOf(req));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not delete the signature." }); }
});

// The client's people on this contract: witness and lawyer, each with their own private signing link (the main link can never sign for them).
router.get("/contracts/:token/signers", async (req, res) => {
  if (tooMany(req, "signers-read", 60)) { slow(res); return; }
  try {
    await ensureContractTables();
    const t = String(req.params.token);
    const c = await loadContract(t); if (!c) { res.status(404).json({ error: "Contract not found" }); return; }
    const sg = await pool.query("SELECT id, role, name, id_no, phone, relation, address, token, signed_at, (signature<>'') AS has_sig FROM contract_signers WHERE contract_token=$1 ORDER BY id", [t]);
    const ev = await pool.query("SELECT at, actor, action, detail FROM contract_events WHERE contract_token=$1 ORDER BY id DESC LIMIT 100", [t]);
    res.json({ locked: await isLocked(t), signers: sg.rows.map((x) => ({ id: x.id, role: x.role, name: x.name, idNo: x.id_no, phone: x.phone, relation: x.relation, address: x.address, signed: !!x.signed_at, signedAt: x.signed_at })), history: ev.rows });
  } catch { res.status(500).json({ error: "Could not load." }); }
});
router.post("/contracts/:token/signers", async (req, res) => {
  if (tooMany(req, "signers", 20)) { slow(res); return; }
  try {
    const t = String(req.params.token);
    const c = await loadContract(t); if (!c) { res.status(404).json({ error: "Contract not found" }); return; }
    if (await isLocked(t)) { res.status(409).json({ error: "The first payment is confirmed, so the contract is locked." }); return; }
    const role = req.body?.role === "lawyer" ? "lawyer" : "witness", name = str(req.body?.name, 80);
    if (name.length < 2) { res.status(400).json({ error: "Enter the full name." }); return; }
    const have = Number((await pool.query("SELECT COUNT(*)::int AS n FROM contract_signers WHERE contract_token=$1 AND role=$2", [t, role])).rows[0].n);
    if (role === "lawyer" ? have >= 1 : have >= 3) { res.status(409).json({ error: role === "lawyer" ? "A lawyer is already added. Remove them first." : "You can add up to 3 witnesses. Remove one first." }); return; }
    const st = newSignerToken();
    await pool.query("INSERT INTO contract_signers (contract_token, role, name, id_no, phone, relation, token) VALUES ($1,$2,$3,$4,$5,$6,$7)", [t, role, name, str(req.body?.idNo, 20), str(req.body?.phone, 20), str(req.body?.relation, 40), st]);
    await logEvent(t, "Client", `Added ${role}`, name);
    res.json({ ok: true, link: `${mailSite()}/sign/${st}` });   // shown once
  } catch { res.status(500).json({ error: "Could not add." }); }
});
// A lost link: the old one stops working and a new private link is shown once (written to the history). Only while the person has not signed, or until the contract is locked.
router.post("/contracts/:token/signers/:id/newlink", async (req, res) => {
  if (tooMany(req, "newlink", 10)) { slow(res); return; }
  try {
    const t = String(req.params.token), id = Number(req.params.id) || 0;
    const x = (await pool.query("SELECT role, name, signed_at FROM contract_signers WHERE id=$1 AND contract_token=$2", [id, t])).rows[0];
    if (!x) { res.status(404).json({ error: "Not found." }); return; }
    if (x.signed_at && (await isLocked(t))) { res.status(409).json({ error: "The first payment is confirmed, so the contract is locked." }); return; }
    const st = newSignerToken();
    await pool.query("UPDATE contract_signers SET token=$2 WHERE id=$1", [id, st]);
    await logEvent(t, "Client", `New private link made for the ${x.role}`, x.name);
    res.json({ ok: true, link: `${mailSite()}/sign/${st}` });
  } catch { res.status(500).json({ error: "Could not make a new link." }); }
});
router.delete("/contracts/:token/signers/:id", async (req, res) => {
  if (tooMany(req, "signers", 20)) { slow(res); return; }
  try {
    const t = String(req.params.token);
    if (await isLocked(t)) { res.status(409).json({ error: "The first payment is confirmed, so the contract is locked." }); return; }
    const d = await pool.query("DELETE FROM contract_signers WHERE id=$1 AND contract_token=$2 RETURNING role, name", [Number(req.params.id) || 0, t]);
    if (d.rows[0]) await logEvent(t, "Client", `Removed ${d.rows[0].role}`, d.rows[0].name);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not remove." }); }
});
// The witness / lawyer opens their own link.
router.get("/signing/:st", async (req, res) => {
  if (tooMany(req, "signing-read", 60)) { slow(res); return; }
  try {
    await ensureContractTables();
    const x = (await pool.query("SELECT s.role, s.name, s.id_no, s.phone, s.relation, s.address, s.signed_at, (s.signature<>'') AS has_sig, s.contract_token FROM contract_signers s WHERE s.token=$1", [String(req.params.st)])).rows[0];
    if (!x) { res.status(404).json({ error: "This link is not valid." }); return; }
    const c = await loadContract(x.contract_token); if (!c) { res.status(404).json({ error: "Contract not found" }); return; }
    res.json({ role: x.role, name: x.name, idNo: x.id_no, phone: x.phone, relation: x.relation, address: x.address, signed: !!x.signed_at, signedAt: x.signed_at, locked: await isLocked(x.contract_token), contractNo: c.no, clientName: c.name, item: c.item, agreedTotal: c.agreedTotal, pageUrl: `/api/signing/${String(req.params.st)}/page` });
  } catch { res.status(500).json({ error: "Could not load." }); }
});
router.post("/signing/:st/sign", async (req, res) => {
  if (tooMany(req, "signing-sign", 10)) { slow(res); return; }
  try {
    const x = (await pool.query("SELECT id, role, name, contract_token, signed_at FROM contract_signers WHERE token=$1", [String(req.params.st)])).rows[0];
    if (!x) { res.status(404).json({ error: "This link is not valid." }); return; }
    if (x.signed_at) { res.status(409).json({ error: "Already signed. Delete your signature first to sign again." }); return; }
    const sig = String(req.body?.signature ?? ""), stamp = String(req.body?.stamp ?? "");
    // the witness fills in their own details here (ID and address are required; the client may have typed some already)
    const dId = str(req.body?.idNo, 20), dAddr = str(req.body?.address, 120), dPhone = str(req.body?.phone, 20);
    if (!/^[A-Za-z0-9][A-Za-z0-9 \/.-]{3,19}$/.test(dId)) { res.status(400).json({ error: "Enter your ID number first." }); return; }
    if (!okPng(sig)) { res.status(400).json({ error: "Please draw your signature in the box." }); return; }
    if (req.body?.agree !== true) { res.status(400).json({ error: "Please tick the box to confirm you have read the contract." }); return; }
    if (stamp && (x.role !== "lawyer" || !okPng(stamp, 600_000))) { res.status(400).json({ error: "That stamp picture is not accepted. Use a small PNG or JPG." }); return; }
    await pool.query("UPDATE contract_signers SET signature=$2, stamp=$3, signed_at=now(), signed_ip=$4, signed_device=$5, id_no=CASE WHEN $6<>'' THEN $6 ELSE id_no END, address=CASE WHEN $7<>'' THEN $7 ELSE address END, phone=CASE WHEN $8<>'' THEN $8 ELSE phone END, name=CASE WHEN length($9)>=2 THEN $9 ELSE name END WHERE id=$1", [x.id, sig, stamp, String(req.ip ?? "").slice(0, 60), deviceOf(req), dId, dAddr, dPhone, str(req.body?.name, 80)]);
    await logEvent(x.contract_token, x.role === "lawyer" ? "Lawyer" : "Witness", `${x.name} signed${stamp ? " and stamped" : ""}`, deviceOf(req));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not save." }); }
});
router.delete("/signing/:st/signature", async (req, res) => {
  if (tooMany(req, "signing-del", 10)) { slow(res); return; }
  try {
    const x = (await pool.query("SELECT id, role, name, contract_token FROM contract_signers WHERE token=$1", [String(req.params.st)])).rows[0];
    if (!x) { res.status(404).json({ error: "This link is not valid." }); return; }
    if (await isLocked(x.contract_token)) { res.status(409).json({ error: "The first payment is confirmed, so the contract is locked." }); return; }
    await pool.query("UPDATE contract_signers SET signature='', stamp='', signed_at=NULL WHERE id=$1", [x.id]);
    await logEvent(x.contract_token, x.role === "lawyer" ? "Lawyer" : "Witness", `${x.name} deleted their signature`);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not delete." }); }
});
router.get("/admin/contracts/:token/history", async (req, res) => {
  if (!isAdminKey(req.header("x-admin-key"))) { res.status(403).json({ error: "Admin only" }); return; }
  const ev = await pool.query("SELECT at, actor, action, detail FROM contract_events WHERE contract_token=$1 ORDER BY id DESC LIMIT 200", [String(req.params.token)]);
  res.json(ev.rows);
});

// The client's ID, scanned on the contract form. Private: only the admin can look at it.
router.post("/contracts/:token/id", async (req, res) => {
  try {
    await ensureContractTables();
    const t = String(req.params.token), kind = String(req.body?.kind ?? ""), data = String(req.body?.data ?? "");
    if (kind !== "id_front" && kind !== "id_back") { res.status(400).json({ error: "Unknown document." }); return; }
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 1_300_000) { res.status(400).json({ error: "Scan the ID again." }); return; }
    if (!(await pool.query("SELECT 1 FROM contracts WHERE token=$1", [t])).rows.length) { res.status(404).json({ error: "Contract not found" }); return; }
    if (await isLocked(t)) { res.status(409).json({ error: "The contract is locked." }); return; }
    await pool.query("INSERT INTO contract_ids (contract_token, kind, data) VALUES ($1,$2,$3) ON CONFLICT (contract_token, kind) DO UPDATE SET data=EXCLUDED.data, created_at=now()", [t, kind, data]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not save the ID." }); }
});
router.get("/admin/contracts/:token/id/:kind", async (req, res) => {
  if (!isAdminKey(req.header("x-admin-key"))) { res.status(403).json({ error: "Admin only" }); return; }
  const r = (await pool.query("SELECT data FROM contract_ids WHERE contract_token=$1 AND kind=$2", [String(req.params.token), String(req.params.kind)])).rows[0];
  const m = r && /^data:(image\/[a-z]+);base64,(.*)$/.exec(r.data as string);
  if (!m) { res.status(404).end(); return; }
  res.setHeader("Cache-Control", "private, no-store"); res.type(m[1]).send(Buffer.from(m[2], "base64"));
});

router.get("/admin/contracts", async (req, res) => {
  if (!isAdminKey(req.header("x-admin-key"))) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await ensureContractTables();
    const r = await pool.query(`SELECT c.token, c.id, c.name, c.phone, c.item, c.agreed_total::float AS total, c.quote_total::float AS quoted, c.signed_at, c.created_at, c.id_match, ARRAY(SELECT kind FROM contract_ids i WHERE i.contract_token=c.token) AS id_kinds,
      COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.contract_token=c.token AND p.status='paid'),0)::float AS paid FROM contracts c ORDER BY c.id DESC LIMIT 200`);
    res.json(r.rows.map((x) => ({ token: x.token, no: contractNo(x.id), name: x.name, phone: x.phone, item: x.item, agreedTotal: x.total, quotedTotal: x.quoted, paid: x.paid, signed: !!x.signed_at, idMatch: x.id_match, idKinds: x.id_kinds, createdAt: x.created_at })));
  } catch { res.status(500).json({ error: "Could not load contracts." }); }
});

// The printable contract: quote on top (the quoted price crossed out when a lower price was agreed), then the agreement, schedule, terms and acceptance.
router.get("/contracts/:token/pdf", (req, res) => {
  res.redirect(302, `/api/contracts/${encodeURIComponent(String(req.params.token))}/page?pdf=1`);
});
router.get(["/contracts/:token/page", "/signing/:st/page"], async (req, res) => {
  try {
    const viewer = req.params.st ? String(req.params.st) : "";
    const mainTok = viewer ? String((await pool.query("SELECT contract_token FROM contract_signers WHERE token=$1", [viewer])).rows[0]?.contract_token ?? "") : String(req.params.token);
    const c = await loadContract(mainTok);
    if (!c) { res.status(404).type("text/plain").send("Contract not found."); return; }
    const co = companyInfo();
    const isSurvey = /survey/i.test(c.item);
    const isDrill = kindOfService(c.item, c.depth, c.agreedRate) === "drill";
    const docTitle = isSurvey ? "HYDROGEOLOGICAL SURVEY AGREEMENT" : isDrill ? "BOREHOLE DRILLING CONTRACT" : "SERVICE CONTRACT";
    // the printable page is served by the API host, which has no website pages, so the "Sign & pay online" button needs the full website address
    const okUrl = (v: unknown) => (typeof v === "string" && /^https?:\/\/[^\s"'<>\\]+$/.test(v.trim()) ? v.trim().replace(/[\/.\s]+$/, "") : "");
    const siteUrl = okUrl(process.env.SITE_URL) || co.website || "https://www.dighazengineering.com";
    // every printed page carries this link and QR code, so a paper copy can always be traced back to the contract on our website
    const verifyUrl = viewer ? `${siteUrl}/sign/${viewer}` : `${siteUrl}/contract/${c.token}`;   // a witness or lawyer page never shows the main contract link
    const qr = qrcode(0, "M"); qr.addData(verifyUrl); qr.make();
    const qrSvg = qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
    const quoteNo = `QT-${String(c.quoteId).padStart(5, "0")}`;
    const lines = linesOf({ lines: c.lines, total: c.quoteTotal });
    const detail = c.depth > 0 && c.agreedRate > 0 ? `${c.casing ? `${c.casing.toUpperCase()} casing, ` : ""}${c.depth} m` : "";
    const rich = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");   // **text** is shown bold
    const fit = (t: string, base = 11.5) => { const n = String(t ?? "").length; return `${n > 28 ? 7.5 : n > 22 ? 8.5 : n > 17 ? 9.5 : n > 14 ? 10.5 : base}px`; };   // long values get a smaller font so nothing wraps
    // if the client has paid us to apply for their permits (matched by phone), the "have the permits" line is dropped from the contract
    let termsText = c.terms;
    try {
      const tail = String(c.phone ?? "").replace(/\D/g, "").slice(-9);
      if (tail.length === 9) {
        const pr = await pool.query(`SELECT 1 FROM permit_apps a WHERE a.mode='apply' AND (right(regexp_replace(a.phone,'\\D','','g'),9)=$1 OR right(regexp_replace(a.phone2,'\\D','','g'),9)=$1)
          AND COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.item = 'Permit fees PR' || LPAD(a.id::text,4,'0') AND p.status='paid'),0) > 0 LIMIT 1`, [tail]);
        if (pr.rows.length) termsText = termsText.replace(/\n?- Have the permits \(NEMA and WARMA\), or ask us to help\./, "");
      }
    } catch { /* no permit table yet: the line stays */ }
    const cards = termsText.split("\n\n").map((t) => {
      const [h, ...rest] = t.split("\n");
      const m = /^(\d+)\.\s*(.*)$/.exec(h);
      const num = m ? m[1] : "", title = m ? m[2] : h;
      const nb = rest.filter((l) => l.startsWith("- ")).length, bullets = nb >= 3;
      const len = rest.join(" ").length;
      let body = "", list: string[] = [];
      const flush = () => { if (list.length) { body += `<ul>${list.join("")}</ul>`; list = []; } };
      for (const l of rest) { if (l.startsWith("- ")) list.push(`<li>${rich(l.slice(2))}</li>`); else { flush(); body += `<p>${rich(l)}</p>`; } }
      flush();
      return { w: len > 420 || bullets, wide: len > 420 || bullets, l: Math.max(60, len + title.length), inner: `<div class="ch"><span class="cn">${esc(num)}</span><b>${esc(title)}</b></div>${body}` };
    });
    // two columns: long clauses take the full row; a clause left alone on the last row also takes the full row
    // two to a row only when the two clauses are about the same length; otherwise each takes the full row, so there is never an empty half-row or a card with a big hollow
    const cardsHtml = (g: typeof cards) => { let i = 0; while (i < g.length) { const k = g[i], n = g[i + 1]; if (k.wide) { i++; continue; } if (n && !n.wide) { const r = n.l / k.l; if (r >= 0.55 && r <= 1.8) { i += 2; continue; } } k.wide = true; i++; } return g.map((k) => `<div class="cl${k.wide ? " wide" : ""}" data-w="${k.w ? 1 : 0}" data-l="${k.l}">${k.inner}</div>`).join(""); };
    // with an itemised quotation, page 1 is full and all terms go on page 2; otherwise the terms are shared between the two pages
    const cut = lines ? 0 : Math.ceil(cards.length / 2);
    const termsA = cut ? cardsHtml(cards.slice(0, cut)) : "";
    const termsB = cardsHtml(cards.slice(cut));
    // the payment schedule as a clean table: step, when, amount, running total and status
    let run = 0;
    const schedRows = c.stages.map((st, i) => { run += st.amount; return `<tr><td class="c1">${i + 1}</td><td class="d">${esc(st.label)}</td><td class="n">${esc(kes(st.amount))}</td><td class="n">${esc(kes(run))} <span>${Math.round((run * 100) / Math.max(1, c.agreedTotal))}%</span></td><td class="s ${st.status}">${st.status === "paid" ? "Paid" : st.status === "pending" ? "Being confirmed" : "Due"}</td></tr>`; }).join("");
    const schedule = `<div class="tw"><table class="items sch"><thead><tr><th class="c1">Step</th><th>When</th><th class="n">Amount (KSh)</th><th class="n">Running total</th><th>Status</th></tr></thead><tbody>${schedRows}</tbody></table></div>`;
    const banks = bankAccounts();
    const bankLines = banks.map((b) => `<div>${esc(b.bankName)} &middot; ${esc(b.accountName)} &middot; <b>${esc(b.accountNumber)}</b>${b.paybill ? ` &middot; Paybill ${esc(b.paybill)}` : ""}</div>`).join("");
    const modeTxt = c.payMode === "bank" ? `<div><b>Bank transfer.</b> Pay into:</div>${bankLines}`
      : c.payMode === "cheque" ? `<div><b>Cheque.</b> Cheques are paid into the Company's bank accounts:</div>${bankLines}`
      : c.payMode === "cash" ? `<div><b>Cash.</b> Pay at our office (${esc(OFFICE())}) and receive an official receipt. Cash is paid only against an official receipt.</div>`
      : `<div><b>M-Pesa.</b> Use the Pay button on the live contract page. Bank accounts, if you prefer them:</div>${bankLines}`;
    const payBox = `<div class="paybox"><b>Payment details</b>${modeTxt}</div>`;
    const pctPaid = Math.min(100, Math.round((c.paid * 100) / Math.max(1, c.agreedTotal)));
    const prog = `<div class="prog"><div class="pbar"><i style="width:${pctPaid}%"></i></div><b>${pctPaid >= 100 ? "100% PAID" : pctPaid + "% paid"}</b></div>`;
    const sg = (await pool.query("SELECT role, name, id_no, phone, relation, address, signature, stamp, signed_at, signed_device FROM contract_signers WHERE contract_token=$1 ORDER BY id", [c.token])).rows;
    const sgList = sg.length ? sg : c.witnessName ? [{ role: "witness", name: c.witnessName, id_no: c.witnessId, phone: "", signature: c.witnessSig, stamp: "", signed_at: null, signed_device: "" }] : [];
    // the witness and the lawyer each get a full block like the client's: name, ID, address, phone, a real signature space and the date
    const sgBlock = (w: any) => {
      const lawyer = w.role === "lawyer", ln = (lab: string, v: string, big = false, wrap = false) => `<div class="fl${big ? " big" : ""}"><span>${lab}</span><b${wrap ? ' style="white-space:normal;font-size:10.5px"' : ""}>${v}</b></div>`;
      const sig = w.signature ? `<img class="esig" src="${w.signature}" alt="Signature">` : "";
      return `<div class="sp x${lawyer ? " st" : ""}"><h3>${lawyer ? "Client's lawyer" : "Client's witness"}</h3><div class="sf">${ln("Full name", esc(w.name))}${ln("ID no.", esc(w.id_no ?? ""))}${ln("Tel", esc(w.phone ?? ""))}${ln("Signature", sig, true)}${ln("Date", w.signed_at ? esc(day(new Date(w.signed_at).toISOString())) : "")}</div>${lawyer ? (w.stamp ? `<div class="sm box"><img class="esig" src="${w.stamp}" alt="Stamp"></div>` : `<div class="sm box">Stamp<br>(optional)</div>`) : ""}</div>`;
    };
    const extraHtml = Array.from({ length: Math.ceil(sgList.length / 2) }, (_, i) => `<div class="sig x">${sgList.slice(i * 2, i * 2 + 2).map(sgBlock).join("")}</div>`).join("");
    const stepCards = c.stages.map((st, i) => `<div class="step ${st.status}"><div class="sn">${i + 1}</div><div class="sl">${esc(st.label)}</div><div class="sa">${esc(kes(st.amount))}</div><div class="ss">${st.status === "paid" ? "Paid" : st.status === "pending" ? "Being confirmed" : "Due"}</div></div>`).join("");
    // Every confirmed payment is attached as its full official receipt, on new pages after the appendix (3 per page).
    const rcps = await contractReceiptHtmls(c.token);
    // Everything attached goes under ONE "Appendices" heading, numbered: 1 Quotation, 2 Client ID card, 3 Receipts. Never shown to the witness or lawyer: the ID.
    let apxRest = "", apxN = 1;
    if (!viewer) {
      const ids = (await pool.query("SELECT kind, data FROM contract_ids WHERE contract_token=$1 AND kind IN ('id_front','id_back')", [c.token]).catch(() => ({ rows: [] as { kind: string; data: string }[] }))).rows;
      const safeImg = (k: string) => { const d = ids.find((x) => x.kind === k)?.data ?? ""; return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(d) ? d : ""; };
      const fr = safeImg("id_front"), bk = safeImg("id_back");
      if (fr || bk) {
        const cell = (src: string, lab: string) => `<div style="flex:1;text-align:center"><div style="font:700 11px sans-serif;color:#64748b;margin-bottom:6px">${lab}</div>${src ? `<img src="${src}" alt="${lab}" style="width:100%;border:1px solid #dbe3ee;border-radius:6px">` : `<div style="border:1px dashed #dbe3ee;padding:40px 0;color:#94a3b8;font:12px sans-serif">Not provided</div>`}</div>`;
        apxN++;
        apxRest += `<div class="ax"><h3 class="axh"><b>${apxN}.</b> Client Identity Card</h3><div class="ap"><div class="svc"><b>${esc(c.name)}</b> <span>&middot; ID no. ${esc(c.idNo)}</span></div><div style="display:flex;gap:14px;margin-top:10px">${cell(fr, "Front")}${cell(bk, "Back")}</div></div></div>`;
      }
    }
    if (rcps.length) {
      apxN++;
      apxRest += rcps.map((h, i) => `<div class="ax axrc">${i === 0 ? `<h3 class="axh"><b>${apxN}.</b> Receipts of payments</h3>` : ""}<div class="rcell"><iframe class="rc" scrolling="no" srcdoc="${esc(h)}"></iframe></div></div>`).join("");
    }
    const apxTitle = apxN > 1 ? "Appendices" : "Appendix";
    res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contract ${esc(c.no)}</title><style>
:root{--navy:#0b1d3a;--blue:#0a4fb3;--gold:#f59e0b;--ink:#0f172a;--mut:#64748b;--line:#dbe3ee;--soft:#f4f7fb}
*{box-sizing:border-box}body{margin:0;background:#e9eef5;font-family:"Segoe UI",Inter,system-ui,-apple-system,Arial,sans-serif;color:var(--ink);padding:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
.prog{display:flex;align-items:center;gap:10px;margin:8px 0}.pbar{flex:1;height:10px;background:#e2e8f0;border-radius:6px;overflow:hidden}.pbar i{display:block;height:100%;background:#16a34a}.prog b{font-size:12px;color:#15803d}
[hidden]{display:none!important}.paper{width:794px;max-width:100%;min-height:1123px;border:solid var(--navy);border-width:15px 38px;padding:23px;margin:0 auto 20px;background:#fff;border-radius:4px;box-shadow:0 12px 34px rgba(15,23,42,.18);display:flex;flex-direction:column}.paper>.page{flex:1}
.pf{display:flex;justify-content:space-between;gap:10px;padding:8px 2px 0;border-top:1px solid var(--line);font-size:8px;color:var(--mut)}.pf span{white-space:nowrap}.pf span:first-child{min-width:0;overflow:hidden}.pf span:last-child{flex:none;font-weight:700;color:var(--navy)}
.rh{display:flex;align-items:center;gap:10px;padding:10px 18px;border-radius:10px 10px 0 0;background:linear-gradient(120deg,var(--navy),#0a3a80);border-bottom:3px solid var(--gold);color:#fff;font-size:11px}.rh img{width:26px;height:26px;object-fit:contain}.rh b{font:700 13px Georgia,serif}.rh span{flex:1;color:var(--gold);font-size:9px;letter-spacing:.2em;text-transform:uppercase;font-weight:700}.rh em{font-style:normal;color:#cbd5e1}
h2 .cont{font-weight:400;text-transform:none;letter-spacing:0;color:var(--mut)}
.top{background:linear-gradient(120deg,var(--navy),#0a3a80 70%,#14407f);color:#fff;padding:12px 18px;border-radius:10px 10px 0 0;border-bottom:4px solid var(--gold);display:flex;align-items:center;gap:14px}
.top img{width:50px;height:50px;flex:none;object-fit:contain}.top .t{flex:1}.top h1{margin:0;font:700 19px/1.2 Georgia,"Times New Roman",serif;letter-spacing:.2px}.top .k{margin:2px 0 0;font-size:10px;letter-spacing:.22em;color:var(--gold);font-weight:700}
.top .no{text-align:right;font-size:11px;line-height:1.4;color:#cbd5e1}.top .no b{display:block;font:700 17px/1.2 Georgia,serif;color:#fff}
.page{padding:6px 0 4px}h2{margin:12px 0 5px;font:700 10px/1.3 "Segoe UI",Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--blue);display:flex;align-items:center;gap:8px}h2:after{content:"";flex:1;height:1px;background:var(--line)}h2 i{font-style:normal;color:var(--gold)}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px}.box{background:var(--soft);border-radius:10px;padding:8px 12px;border-left:3px solid var(--gold);font-size:11.5px;line-height:1.5}.box small{display:block;font-size:8.5px;letter-spacing:.12em;color:var(--mut);font-weight:700;text-transform:uppercase}.box .v{font:700 13px/1.4 Georgia,serif}
.svc{font-size:12px;line-height:1.5}.svc b{font:700 13px Georgia,serif}.svc span{color:var(--mut)}
.tw{margin-top:5px;border-radius:9px;border:1px solid var(--line);overflow:hidden}table.items{width:100%;border-collapse:collapse;font-size:9.5px;line-height:1.35}
table.items th{background:var(--navy);color:#fff;font-size:8px;padding:5px 6px;text-align:left;text-transform:uppercase;letter-spacing:.06em}table.items td{border-top:1px solid #e7edf5;padding:3px 6px;vertical-align:top}table.items .n{text-align:right;white-space:nowrap}table.items td.d{white-space:pre-line}
table.items tr.sec td{background:#e3ecfb;color:var(--navy);font-weight:700}table.items tr.tot td{background:#fff4d6;font-weight:700;border-top:1.5px solid var(--gold)}table.items tr.alt td{background:#fafcff}.ro{color:var(--mut)}.mobw{margin-bottom:5px}.mobt .note{display:block;color:#1d4ed8;font-size:8.5px;font-weight:500}table.items tr.less td{background:#fff;font-weight:600;color:#334155}
table.sch td{padding:4px 6px}table.sch td.c1,table.sch th.c1{width:34px;text-align:center}table.sch td span{color:var(--mut);font-size:8.5px}table.sch td.s{font-size:8.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);white-space:nowrap}table.sch td.s.paid{color:#15803d}table.sch td.s.pending{color:#b45309}
.paybox{margin-top:5px;border:1px solid var(--line);border-left:3px solid var(--blue);border-radius:9px;background:#fff;padding:5px 10px;font-size:9.5px;line-height:1.45;color:#334155}.paybox b:first-child{display:block;font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.price{display:flex;align-items:stretch;gap:10px;margin-top:4px}.price .p{flex:1;border-radius:10px;padding:8px 12px;background:var(--soft)}.price .p small{display:block;font-size:8.5px;letter-spacing:.12em;color:var(--mut);font-weight:700;text-transform:uppercase}.price .p b{display:block;font:700 17px/1.3 Georgia,serif}
.price .p{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 10px;padding:5px 12px}.price .p small{display:inline}.price .p em{margin-left:auto}
.price .p.was b{color:var(--mut);text-decoration:line-through;text-decoration-thickness:1.5px}.price .p.now{background:linear-gradient(120deg,#fff4d6,#ffe9a8);border:1px solid var(--gold)}.price .p.now b{color:var(--blue);font-size:17px}.price .p em{font-style:normal;font-size:10.5px;color:#475569}
.steps{display:grid;grid-template-columns:repeat(${Math.min(c.stages.length, 3)},1fr);gap:8px}.step{position:relative;border:1px solid var(--line);border-radius:10px;padding:8px 10px 8px 34px;background:#fff;font-size:11px;line-height:1.4}
.step .sn{position:absolute;left:8px;top:9px;width:19px;height:19px;border-radius:50%;background:var(--navy);color:#fff;font:700 10px/19px sans-serif;text-align:center}.step .sl{color:#334155}.step .sa{font:700 14px/1.4 Georgia,serif;color:var(--navy)}.step .ss{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.step.paid{background:#ecfdf3;border-color:#86efac}.step.paid .ss{color:#15803d}.step.pending .ss{color:#b45309}
.tot3{display:flex;gap:10px;margin-top:5px;font-size:11px}.tot3 div{flex:1;background:var(--soft);border-radius:8px;padding:5px 10px;display:flex;justify-content:space-between}
.terms{display:grid;grid-template-columns:1fr 1fr;gap:7px;align-items:stretch;font-size:10.5px;line-height:1.5}.cl{background:var(--soft);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:10px;padding:6px 10px;break-inside:avoid}.cl.wide{grid-column:1/-1}
.ch{display:flex;align-items:center;gap:8px;margin-bottom:3px}.cn{flex:none;width:19px;height:19px;border-radius:50%;background:var(--navy);color:#fff;font:700 10px/19px sans-serif;text-align:center}.ch b{font:700 11.5px/1.3 Georgia,serif;color:var(--navy)}
.cl p{margin:0 0 2px;color:#1e293b}.cl ul{margin:2px 0 0;padding:0;list-style:none}.cl li{position:relative;margin:0 0 2px;padding-left:14px;color:#1e293b}.cl li:before{content:"";position:absolute;left:2px;top:.55em;width:5px;height:5px;border-radius:50%;background:var(--gold)}
.esig{display:block;height:auto;max-height:52px;max-width:100%;width:auto;margin:0 auto -1px;position:relative}.esig.w{display:inline-block;max-height:30px;margin:0 0 -6px 6px;vertical-align:bottom}.wit span b{font:700 10.5px Georgia,serif;color:var(--ink)}.fl.big b{display:flex;align-items:flex-end;overflow:visible}.sig,.wit,#acc{break-inside:avoid}h2{break-after:avoid}.sig{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}
.sp{border:1px solid var(--line);border-top:3px solid var(--navy);border-radius:10px;background:#fff;padding:6px 12px 8px}.sp h3{margin:0 0 2px;font:700 12px/1.4 Georgia,serif;color:var(--navy)}
.fl{display:flex;align-items:flex-end;gap:8px;min-height:24px;font-size:8.5px;color:var(--mut);white-space:nowrap}.fl span{flex:none;text-transform:uppercase;letter-spacing:.06em;font-weight:700;padding-bottom:2px}.fl b{flex:1;min-width:0;min-height:15px;overflow:hidden;border-bottom:1px solid #94a3b8;font:700 11.5px/1.3 Georgia,serif;color:var(--ink);padding-bottom:1px;white-space:nowrap}.fl.big{min-height:44px}.fl.nl b{border-bottom:0;min-height:0;font-size:11px}.box.co{display:flex;align-items:center;justify-content:space-between;gap:8px}.box.co .v{white-space:nowrap;font-size:11.5px}.box.co .ln{white-space:nowrap;line-height:1.45}.box.co svg{width:106px;height:auto;display:block;flex:none}
.sp{display:grid;grid-template-columns:1fr 76px;column-gap:10px}.sp:first-child{grid-template-columns:1fr 126px}.sp h3{grid-column:1/-1}.sm{display:flex;flex-direction:column;align-items:center;justify-content:center;align-self:stretch}.sm small{font-size:7.5px;letter-spacing:.14em;text-transform:uppercase;color:#64748b;font-weight:700;margin-top:-2px}.sm svg{width:100%;max-width:126px;height:auto;display:block;margin:0;mix-blend-mode:multiply;transform:rotate(-5deg)}.sm.box{border:1px dashed #cbd5e1;border-radius:8px;font-size:7.5px;line-height:1.5;letter-spacing:.1em;text-transform:uppercase;color:#a3b1c2;font-weight:700;text-align:center}
.top .qr{flex:none;width:54px;background:#fff;border-radius:6px;padding:4px 4px 2px;text-align:center}.top .qr svg{display:block;width:100%;height:auto}.top .qr small{display:block;font-size:6.5px;letter-spacing:.04em;color:#334155;font-weight:700;margin-top:1px}
a.tr{margin-left:auto;font-weight:400;text-transform:none;letter-spacing:0;font-size:9px;color:var(--mut);text-decoration:underline;order:3}
.foot{margin-top:10px;text-align:center;font-size:9.5px;color:var(--mut)}
.sp.x{grid-template-columns:1fr}.sp.x.st{grid-template-columns:1fr 76px}.sig.x{margin-top:10px}.sp.x .esig{max-height:44px}.sm.box .esig{max-height:60px;max-width:70px}.wit{margin-top:10px}.wit div{border:1px dashed #94a3b8;border-radius:10px;padding:6px 12px 8px;font-size:9.5px;color:var(--mut);display:flex;flex-wrap:wrap;gap:0 14px}.wit em{flex-basis:100%;font-style:normal;font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:8.5px}.wit span{flex:1;display:block;margin-top:14px;white-space:nowrap;overflow:hidden}
.btns{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.go{flex:1.3;display:flex;align-items:center;justify-content:center;text-decoration:none;background:linear-gradient(120deg,var(--blue),#0a3a80);color:#fff;font-weight:700;border-radius:12px;font-size:14px;padding:11px;box-shadow:0 6px 16px rgba(10,79,179,.3)}button{flex:1;border:1.5px solid var(--blue);background:#fff;color:var(--blue);font-weight:700;padding:11px;border-radius:12px;font-size:14px;cursor:pointer}
@media(max-width:820px){.paper{border-width:6px 8px;padding:12px}}
.cap .paper{height:1123px!important;overflow:hidden;box-shadow:none!important;margin:0!important}
.measure .paper{width:794px!important;max-width:none!important;border-width:15px 38px!important;padding:23px!important;min-height:1123px}
@media(max-width:560px){body:not(.measure){padding:8px}body:not(.measure) .paper{min-height:0}body:not(.measure) .rh span{display:none}body:not(.measure) .rh em{margin-left:auto}body:not(.measure) .page{padding:12px 2px}body:not(.measure) .meta,body:not(.measure) .sig,body:not(.measure) .terms{grid-template-columns:1fr}body:not(.measure) .cl.wide{grid-column:auto}body:not(.measure) .steps{grid-template-columns:1fr}body:not(.measure) .price{flex-direction:column}body:not(.measure) .tw{overflow-x:auto}body:not(.measure) table.items{font-size:8.5px}body:not(.measure) table.items th{padding:4px 3px;font-size:7px;letter-spacing:0}body:not(.measure) table.items td{padding:3px}body:not(.measure) .top{padding:14px}body:not(.measure) .top .no{display:none}}
@page{size:A4;margin:0}
.apxp{background:radial-gradient(ellipse at 22% 12%,#a9b9cf 0,#7389a6 52%,#5a6e8d 100%)!important}.apxp h2{color:#fff}.apxp h2:after{background:rgba(255,255,255,.4)}.apxp h2 i,.apxp .axh b{color:#fcd34d}.apxp .axh{color:#fff}.apxp .pf{border-top-color:rgba(255,255,255,.4);color:#e2e8f0}.apxp .pf span:last-child{color:#fff}
.apxp .ap{background:#fff;border-radius:3px;box-shadow:0 6px 22px rgba(15,23,42,.4);padding:14px 16px;margin:0 20px 6px}@media(max-width:560px){body:not(.measure) .apxp .ap{margin:0;padding:10px}}
.ax{margin:0 0 12px}.axh{margin:14px 0 8px;font:700 13px Georgia,serif;color:var(--navy);display:flex;gap:6px;align-items:baseline}.axh b{color:var(--gold)}.axh .cont{font:400 11px sans-serif}
iframe.rc,img.rc{display:block;border:0;width:760px;height:348px;zoom:.8;margin:0;background:#fff}.rp{display:flex;flex-direction:column}.rcw{flex:1;display:flex;flex-direction:column}.rcell{display:flex;justify-content:center}
@media print{body{background:#fff;padding:0}.paper{box-shadow:none;border-radius:0;width:210mm!important;max-width:none!important;border-width:4mm 10mm!important;padding:6mm!important;min-height:296mm;margin:0}.paper+.paper{break-before:page}a.tr{display:none}.btns{display:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.wit{margin-top:6px}}
</style></head><body><div class="paper" id="p1"><div class="top"><img src="data:image/png;base64,${LOGO_PNG_B64}" alt=""><div class="t"><h1>${esc(co.legalName)}</h1><p class="k">${docTitle}</p></div><div class="qr" title="Scan to check this contract online">${qrSvg}<small>Scan to verify</small></div><div class="no">Contract no.<b>${esc(c.no)}</b>${esc(day(c.createdAt))}</div></div>
<div class="page"><div class="meta"><div class="box"><small>Client</small><div class="v">${esc(c.name)}</div>${c.idNo ? `ID / passport no. ${esc(c.idNo)}<br>` : ""}${c.phone ? `Tel +${esc(String(c.phone).replace(/^\+/, ""))}` : ""}${c.email ? ` &middot; ${esc(c.email)}` : ""}${c.address ? `<br>${esc(c.address)}` : ""}${c.location ? `<br>Site: ${esc(c.location)}` : ""}</div>
<div class="box co"><div><small>Contractor</small><div class="v">${esc(co.legalName)}</div>${[`Reg. No. ${co.regNo}`, co.email, co.website.replace(/^https?:\/\//, "").replace(/\/$/, "")].filter((x) => x && x !== "Reg. No. ").map((x) => `<div class="ln" style="font-size:${x.length > 30 ? 8.5 : x.length > 26 ? 9 : 9.5}px">${esc(x)}</div>`).join("")}</div>${stampSvg(stampDate(c.createdAt))}</div></div>
<div class="svc"><b>${esc(c.item)}</b>${detail ? ` <span>&middot; ${esc(detail)}</span>` : ""} <span>&middot; Quotation ${quoteNo} is attached as the Appendix</span>${viewer ? "" : ` <a class="tr" href="/api/quotes/${esc(c.quoteToken)}/page">view the original</a>`}</div>
<h2><i>1</i> Agreed price</h2><div class="price">${c.discount > 0
      ? `<div class="p was"><small>Quoted price</small><b>${esc(kes(c.quoteTotal))}</b>${c.agreedRate > 0 ? `<em>${esc(kes(c.quoteRate))} per metre</em>` : ""}</div><div class="p now"><small>Agreed contract price</small><b>${esc(kes(c.agreedTotal))}</b>${c.agreedRate > 0 ? `<em>${esc(kes(c.agreedRate))} per metre &times; ${c.depth} m</em>` : ""}</div>`
      : `<div class="p now"><small>Contract price</small><b>${esc(kes(c.agreedTotal))}</b>${c.agreedRate > 0 ? `<em>${esc(kes(c.agreedRate))} per metre &times; ${c.depth} m</em>` : ""}</div>`}</div>
<h2><i>2</i> Payment schedule</h2>${schedule}${prog}<div class="tot3"><div><span>Paid so far</span><b>${esc(kes(c.paid))}</b></div><div><span>Still to pay</span><b>${esc(kes(c.remaining))}</b></div></div>${payBox}<div id="tb1"${termsA ? "" : " hidden"}><h2><i>3</i> Terms</h2><div class="terms" id="t1">${termsA}</div></div></div><div class="pf"><span>${esc(c.no)} &middot; ${esc(co.legalName)} &middot; verify: ${esc(verifyUrl)}</span><span>Page 1 of 2</span></div></div>
<div class="paper" id="p2"><div class="rh"><img src="data:image/png;base64,${LOGO_PNG_B64}" alt=""><b>${esc(co.legalName)}</b><span>${docTitle}</span><em>${esc(c.no)}</em></div>
<div class="page pb"><h2><i>3</i> Terms <span class="cont" id="cont"${termsA ? "" : " hidden"}>(continued)</span></h2><div class="terms" id="t2">${termsB}</div>
<div id="acc"><h2><i>4</i> Acceptance</h2><div class="sig">
<div class="sp"><h3>For ${esc(co.legalName)}</h3><div class="sf"><div class="fl"><span>Name</span><b style="font-size:${fit(co.signatoryName)}">${esc(co.signatoryName)}</b></div><div class="fl"><span>Position</span><b style="font-size:${fit("Company "+co.signatoryTitle, 10.5)}">Company ${esc(co.signatoryTitle)}</b></div>${co.phone ? `<div class="fl"><span>Tel</span><b style="font-size:10.5px">${esc(co.phone)}</b></div>` : ""}<div class="fl"><span>Date</span><b style="font-size:${fit(day(c.createdAt), 10.5)}">${esc(day(c.createdAt))}</b></div></div><div class="sm">${stampSvg(stampDate(c.createdAt))}<small>Signature &amp; stamp</small></div></div>
<div class="sp"><h3>Client</h3><div class="sf"><div class="fl"><span>Full name</span><b style="font-size:${fit(c.name)}">${esc(c.name)}</b></div><div class="fl"><span>ID no.</span><b style="font-size:${fit(c.idNo)}">${esc(c.idNo)}</b></div><div class="fl"><span>Tel</span><b style="font-size:10.5px">${c.phone ? "+" + esc(String(c.phone).replace(/^\+/, "")) : ""}</b></div><div class="fl big"><span>Signature</span><b>${c.signature ? `<img class="esig" src="${c.signature}" alt="Signature">` : ""}</b></div><div class="fl"><span>Date</span><b style="font-size:${fit(day(c.signedAt), 10.5)}">${c.signedAt ? esc(day(c.signedAt)) : ""}</b></div></div><div class="sm box">${c.stamp && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/=]+$/.test(c.stamp) ? `<img class="esig" src="${c.stamp}" alt="Stamp">` : "Stamp<br>(optional)"}</div></div>
</div></div><div id="xs">${extraHtml}</div></div><div class="pf"><span>${esc(c.no)} &middot; ${esc(co.legalName)} &middot; verify: ${esc(verifyUrl)}</span><span>Page 2 of 2</span></div></div>
<div class="paper apxp" id="pa"><div class="rh"><img src="data:image/png;base64,${LOGO_PNG_B64}" alt=""><b>${esc(co.legalName)}</b><span>${docTitle}</span><em>${esc(c.no)}</em></div>
<div class="page pb"><h2 id="apxh">${apxTitle}</h2><div class="ax" id="appx"><h3 class="axh"><b>1.</b> Quotation ${quoteNo} <span class="cont">(${esc(day(c.createdAt))})</span></h3><div class="ap"><div class="svc"><b>${esc(c.item)}</b>${detail ? ` <span>&middot; ${esc(detail)}</span>` : ""} <span>&middot; for ${esc(c.name)}</span></div>${lines ? itemsTable(lines as BuiltLine[], c.quoteTotal) : `<div class="tw"><table class="items"><thead><tr><th>Description</th><th class="n">Amount (KSh)</th></tr></thead><tbody><tr><td>${esc(c.item)}${detail ? ` &middot; ${esc(detail)}` : ""}</td><td class="n">${esc(Math.round(c.quoteTotal).toLocaleString("en-KE"))}</td></tr><tr class="tot"><td>TOTAL</td><td class="n">${esc(Math.round(c.quoteTotal).toLocaleString("en-KE"))}</td></tr></tbody></table></div>`}</div></div>${apxRest}</div><div class="pf"><span>${esc(c.no)} &middot; ${esc(co.legalName)} &middot; verify: ${esc(verifyUrl)}</span><span>Page 3 of 3</span></div></div>
<div class="btns">${viewer ? "" : `<a class="go" href="${esc(siteUrl)}/contract/${esc(c.token)}">${c.signed ? (c.remaining > 0 ? "Pay online" : "View online") : "Sign &amp; pay online"}</a>`}<button id="dlpdf" type="button">Download PDF</button>${viewer ? "" : shareButtons([{ label: "Copy link", url: `${siteUrl}/contract/${c.token}` }, { label: "Copy PDF link", url: `${siteUrl}/api/contracts/${c.token}/pdf` }], `Contract ${c.no}`)}</div><script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" defer></script><script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" defer></script><script>
// Trim the empty space round every drawn signature (also older ones), so it sits right on its line like a pen signature in a book.
document.querySelectorAll("img.esig").forEach(function(im){var go=function(){try{var w=im.naturalWidth,h=im.naturalHeight;if(!w||!h||im.dataset.t)return;var c=document.createElement("canvas");c.width=w;c.height=h;var x=c.getContext("2d");x.drawImage(im,0,0);var d=x.getImageData(0,0,w,h).data,x0=w,y0=h,x1=-1,y1=-1,i,j;for(j=0;j<h;j++)for(i=0;i<w;i++)if(d[(j*w+i)*4+3]>8){if(i<x0)x0=i;if(i>x1)x1=i;if(j<y0)y0=j;if(j>y1)y1=j}if(x1<0)return;var sw=x1-x0+1,sh=y1-y0+1,o=document.createElement("canvas");o.width=sw;o.height=sh;o.getContext("2d").drawImage(c,x0,y0,sw,sh,0,0,sw,sh);im.dataset.t="1";im.src=o.toDataURL("image/png")}catch(e){}};if(im.complete)go();else im.onload=go});
// Receipts: shrink to the sheet width on small screens (print keeps the A4 size).
(function(){function z(){document.querySelectorAll("iframe.rc").forEach(function(f){var w=f.parentNode.clientWidth;f.style.zoom=w?Math.min(.8,w/760):""});}z();addEventListener("resize",z);addEventListener("beforeprint",function(){document.querySelectorAll("iframe.rc").forEach(function(f){f.style.zoom=""})});addEventListener("afterprint",z);})();
// Fills page 1 with as many clauses as really fit (measured), the rest continue on page 2.
(function(){
  var A4=1123,SAFE=6;
  function fix(box){var kids=[].slice.call(box.children),i=0;while(i<kids.length){var k=kids[i],n=kids[i+1];k.classList.remove("wide");if(n)n.classList.remove("wide");if(k.getAttribute("data-w")==="1"){k.classList.add("wide");i++;continue;}if(n&&n.getAttribute("data-w")!=="1"){var r=(+n.getAttribute("data-l"))/(+k.getAttribute("data-l"));if(r>=.55&&r<=1.8){i+=2;continue;}}k.classList.add("wide");i++;}}
  function flow(){document.body.classList.add("measure");document.querySelectorAll("iframe.rc").forEach(function(f){f.style.zoom=".8"});try{flow2();}finally{document.body.classList.remove("measure");window.dispatchEvent(new Event("resize"));}}
  function flow2(){
    var p1=document.getElementById("p1"),t1=document.getElementById("t1"),t2=document.getElementById("t2"),tb1=document.getElementById("tb1"),cont=document.getElementById("cont");
    if(!p1||!t1||!t2||!tb1||!cont)return;
    var cards=[].slice.call(t1.children).concat([].slice.call(t2.children));
    t1.innerHTML="";t2.innerHTML="";cards.forEach(function(k){t2.appendChild(k);});fix(t2);
    var keep=p1.style.minHeight;p1.style.minHeight="0";tb1.hidden=false;var moved=0;
    while(t2.firstChild){var k=t2.firstChild;t1.appendChild(k);fix(t1);if(p1.getBoundingClientRect().height>A4-SAFE){t2.insertBefore(k,t2.firstChild);fix(t1);break;}moved++;}
    p1.style.minHeight=keep;fix(t2);tb1.hidden=moved===0;cont.hidden=moved===0;
    // witness and lawyer blocks: taken out while the main pages are measured, put back after the client's block afterwards
    var xs=window._xs||(window._xs=document.getElementById("xs"));
    if(xs){[].slice.call(document.querySelectorAll(".paper.xc")).forEach(function(sh){[].slice.call(sh.querySelectorAll(".sig.x")).forEach(function(r){xs.appendChild(r)});sh.parentNode.removeChild(sh);});if(xs.parentNode)xs.parentNode.removeChild(xs);}
    var over=function(sh){var m=sh.style.minHeight;sh.style.minHeight="0";var o=sh.getBoundingClientRect().height>A4-SAFE;sh.style.minHeight=m;return o;};
    // if page 2 is too full for the signatures, they go on their own sheet
    var p2=document.getElementById("p2"),acc=document.getElementById("acc");
    if(p2&&acc&&!document.getElementById("p3")){
      var k2=p2.style.minHeight;p2.style.minHeight="0";
      if(p2.getBoundingClientRect().height>A4-SAFE){
        var p3=p2.cloneNode(false);p3.id="p3";p3.style.minHeight="";
        var pg=document.createElement("div");pg.className="page pb";
        // the closing clauses travel with the signatures
        var t3=document.createElement("div");t3.className="terms";t3.id="t3";var kids=[].slice.call(t2.children);
        if(kids.length>=4){kids.slice(-2).forEach(function(k){t3.appendChild(k);});fix(t2);fix(t3);
          var hh=document.createElement("h2");hh.innerHTML='<i>3</i> Terms <span class="cont">(continued)</span>';pg.appendChild(hh);pg.appendChild(t3);}
        pg.appendChild(acc);
        p3.appendChild(p2.querySelector(".rh").cloneNode(true));p3.appendChild(pg);p3.appendChild(p2.querySelector(".pf").cloneNode(true));
        p2.parentNode.insertBefore(p3,p2.nextSibling);
      }
      p2.style.minHeight=k2;
    }
    if(xs&&acc){
      acc.parentNode.insertBefore(xs,acc.nextSibling);
      var xr=[].slice.call(xs.querySelectorAll(".sig.x")),xsh=acc.closest(".paper"),xt=xs,xn=0;
      xr.forEach(function(r){xs.removeChild(r)});
      xr.forEach(function(r){
        xt.appendChild(r);xn++;
        if(over(xsh)&&xn>1||over(xsh)&&xt===xs){
          xt.removeChild(r);
          var nx=document.createElement("div");nx.className="paper xc";
          nx.appendChild(xsh.querySelector(".rh").cloneNode(true));
          var np=document.createElement("div");np.className="page pb";var h=document.createElement("h2");h.innerHTML='<i>4</i> Acceptance <span class="cont">(continued)</span>';np.appendChild(h);
          var nc=document.createElement("div");nc.appendChild(r);np.appendChild(nc);nx.appendChild(np);nx.appendChild(xsh.querySelector(".pf").cloneNode(true));
          xsh.parentNode.insertBefore(nx,xsh.nextSibling);xsh=nx;xt=nc;xn=1;
        }
      });
    }
    // the appendices always start on a new page; the numbered items follow one another and carry over to more pages only when they run out of room
    [].slice.call(document.querySelectorAll("iframe.rc")).forEach(function(f){try{var e=f.contentDocument.getElementById("sh");if(e&&e.offsetHeight>100)f.style.height=e.offsetHeight+"px";}catch(x){}});
    var pa=document.getElementById("pa");
    if(pa){
      var pg0=pa.querySelector(".page");
      [].slice.call(document.querySelectorAll(".paper.apc")).forEach(function(sh){[].slice.call(sh.querySelectorAll(".ax")).forEach(function(b){pg0.appendChild(b)});sh.parentNode.removeChild(sh);});
      var bl=[].slice.call(pg0.querySelectorAll(".ax")),ttl=pg0.querySelector("#apxh"),cur=pa,curPg=pg0,k0=pa.style.minHeight;
      bl.forEach(function(b){b.parentNode.removeChild(b)});
      bl.forEach(function(b){
        curPg.appendChild(b);
        if(over(cur)&&curPg.querySelectorAll(".ax").length>1){
          curPg.removeChild(b);
          var nx=document.createElement("div");nx.className="paper apc apxp";
          nx.appendChild(pa.querySelector(".rh").cloneNode(true));
          var np=document.createElement("div");np.className="page pb";var h=document.createElement("h2");h.innerHTML=ttl.textContent+' <span class="cont">(continued)</span>';np.appendChild(h);np.appendChild(b);nx.appendChild(np);
          nx.appendChild(pa.querySelector(".pf").cloneNode(true));
          cur.parentNode.insertBefore(nx,cur.nextSibling);cur=nx;curPg=np;
        }
      });
      pa.style.minHeight=k0;
    }
    var sheets=document.querySelectorAll(".paper");
    [].forEach.call(sheets,function(e,i){var l=e.querySelector(".pf span:last-child");if(l)l.textContent="Page "+(i+1)+" of "+sheets.length;});
  }
  window.addEventListener("load",function(){flow();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(flow);});
})();
// Download PDF: every sheet is drawn at exact A4 size (blue frame 10 mm sides, 4 mm top and bottom), so the phone's print settings can never change the margins.
(function(){var b=document.getElementById("dlpdf");if(!b)return;
async function make(){if(!window.html2canvas||!window.jspdf){alert("The PDF tool is still loading. Wait a moment and try again.");return;}
b.disabled=true;var t=b.textContent;b.textContent="Making PDF…";var bd=document.body;bd.classList.add("measure","cap");
var swaps=[];try{
// the receipts sit in small frames, which the page capture leaves blank: photograph each receipt on its own and swap in the picture while the PDF is made
var fr=[].slice.call(document.querySelectorAll("iframe.rc"));
for(var k=0;k<fr.length;k++){var f=fr[k],d=f.contentDocument;if(!d||!d.body)continue;
var el=d.getElementById("sh")||d.body,ew=el.offsetWidth,eh=el.offsetHeight;var rc=await window.html2canvas(el,{scale:4,backgroundColor:"#ffffff",useCORS:true,logging:false,windowWidth:Math.max(760,ew)});
f.style.zoom=".8";var im=document.createElement("img");im.className="rc";im.style.cssText=f.style.cssText;im.style.width=ew+"px";im.style.height=eh+"px";im.src=rc.toDataURL("image/jpeg",0.97);f.parentNode.insertBefore(im,f);f.style.display="none";swaps.push([f,im]);im.style.boxShadow="0 6px 22px rgba(15,23,42,.38)";im._c=rc;}
var bgd=[],cards=[];
/* the quotation and the ID card are photographed on their own too, at high sharpness, and placed in again over the page */
var cl=[].slice.call(document.querySelectorAll(".apxp .ap"));
for(var u=0;u<cl.length;u++){try{var cc=await window.html2canvas(cl[u],{scale:4,backgroundColor:"#ffffff",useCORS:true,logging:false});cards.push([cl[u],cc.toDataURL("image/jpeg",0.97)]);}catch(x){}}
var sh=[].slice.call(document.querySelectorAll(".paper")).filter(function(p){return p.offsetHeight>0});var pdf=new window.jspdf.jsPDF({unit:"mm",format:"a4",compress:true});
for(var i=0;i<sh.length;i++){var c=await window.html2canvas(sh[i],{scale:3,backgroundColor:"#ffffff",useCORS:true,logging:false,windowWidth:1000,width:794,height:1123});if(i)pdf.addPage();pdf.addImage(c.toDataURL("image/jpeg",0.96),"JPEG",0,0,210,297);
/* each receipt goes in again as its own full-quality picture, so it stays sharp when zoomed in */
var shr=sh[i].getBoundingClientRect(),mm=210/shr.width;
cards.forEach(function(w){if(!sh[i].contains(w[0]))return;var cr=w[0].getBoundingClientRect();pdf.addImage(w[1],"JPEG",(cr.left-shr.left)*mm,(cr.top-shr.top)*mm,cr.width*mm,cr.height*mm);});
swaps.forEach(function(w){var im=w[1];if(!sh[i].contains(im)||!im._c)return;var cr=im.getBoundingClientRect();pdf.addImage(im.src,"JPEG",(cr.left-shr.left)*mm,(cr.top-shr.top)*mm,cr.width*mm,cr.height*mm);});}
pdf.save("Contract-${esc(c.no)}.pdf");}catch(e){alert("Could not make the PDF. Please try again.");}
bgd.forEach(function(b){b[0].style.backgroundImage=b[1];b[0]._bg=0;});swaps.forEach(function(w){w[1].remove();w[0].style.display="";});window.dispatchEvent(new Event("resize"));
bd.classList.remove("measure","cap");b.disabled=false;b.textContent=t;}
b.onclick=make;${req.query.pdf ? `window.addEventListener("load",function(){setTimeout(function(){make()},1800)});` : ""}})();
</script></body></html>`);
  } catch { res.status(500).type("text/plain").send("Could not load the contract."); }
});

export default router;
