// The ONE place that turns a quote template into line items. Used by the instant quote, the admin builder, the web page and the PDF.
//
// Rules (all in whole shillings, plain integer arithmetic, no floating point, no guessing):
//  1. The quote TOTAL is decided outside (the site price, or the admin's own price). The lines are only a breakdown of it.
//  2. Quantities follow the depth (see QtyRule). Every template rate is scaled by total / template-total, then rounded to a whole shilling.
//  3. Whatever is left over after rounding goes on the LARGEST LUMP-SUM line (quantity 1), by changing its rate. That keeps
//     Quantity x Rate = Amount exact on every line. (A metre line cannot take an odd shilling without breaking that rule.)
//  4. The lines are checked before they are returned: if they do not add up to the total exactly, an error is thrown instead.
//
// This file has no imports on purpose, so it can be tested directly.

export type QtyRule =
  | { mode: "fixed"; n: number }              // always n
  | { mode: "first"; n: number }              // the first n metres of depth (or all of it when shallower)
  | { mode: "rest"; n: number }               // the metres below n (hidden when the depth is n or less)
  | { mode: "share"; n: number; d: number }   // n/d of the depth, rounded to a whole metre
  | { mode: "restshare"; n: number; d: number } // the depth minus its n/d share (so the two always add up to the depth)
  | { mode: "per"; n: number }                // depth / n rounded, at least 1
  | { mode: "blank" };                        // no quantity

export interface TemplateLine {
  kind: "line" | "section" | "mob";   // "mob" = the rig mobilization shown in its own small table above the numbered items (not a numbered line, not added into the total)
  description: string; // may contain {depth}, {qty} (this line's own quantity), {casing} (PVC or steel) and {size} (the size the client picked)
  unit: string;
  qty: QtyRule;
  rate: number;        // template rate in whole shillings
  rateOnly?: boolean;  // shown as "Rate only" (or `label`) and NOT added into the total
  label?: string;      // for a rate-only line: the word shown instead of an amount, for example "Included". For a "mob" line: the note beside the amount
  fixedRate?: boolean; // the rate is printed as it is and is never scaled to the quote total (for example drilling per metre)
  balance?: boolean;   // the AUTO-BALANCING lump sum (Labor): its amount is whatever makes the numbered items add up exactly to the total
}
/** A size (or package) the client can pick for services sold in sizes, with the price for it. A price of 0 means "not set yet", so it cannot be chosen. */
export interface QuoteOption { label: string; price: number }
export interface QuoteTemplate { id: string; name: string; needsDepth: boolean; lines: TemplateLine[]; footer: string; options?: QuoteOption[] }

export interface BuiltLine {
  kind: "line" | "section" | "mob" | "sum";   // "mob" and "sum" are table rows that are NOT numbered items and are never added into the total
  sn: number | null;
  description: string;
  unit: string;
  qty: number | null;
  rate: number | null;
  amount: number | null;
  rateOnly: boolean;
  label?: string;
}
export interface BuiltQuote { lines: BuiltLine[]; total: number; templateTotal: number; footer: string }

/* ------------------------------------------------------------- integer helpers (BigInt, so nothing is ever rounded by floating point) */
const B = (n: number) => BigInt(n);
/** a / b rounded half up, for whole numbers a >= 0, b > 0. */
export const roundDiv = (a: number, b: number): number => Number((B(2) * B(a) + B(b)) / (B(2) * B(b)));
/** The deposit: pct % of the total, rounded to a whole shilling (half up). */
export const depositOf = (total: number, pct: number): number => roundDiv(total * pct, 100);
/** Per-metre price: depth x rate. */
export const perMetreTotal = (depth: number, rate: number): number => Number(B(depth) * B(rate));

function qtyOf(rule: QtyRule, depth: number): number | null {
  switch (rule.mode) {
    case "fixed": return rule.n;
    case "first": return Math.min(depth, rule.n);
    case "rest": return Math.max(0, depth - rule.n);
    case "share": return roundDiv(depth * rule.n, rule.d);
    case "restshare": return Math.max(0, depth - roundDiv(depth * rule.n, rule.d));
    case "per": return depth > 0 ? Math.max(1, roundDiv(depth, Math.max(1, rule.n))) : 0;
    case "blank": return null;
  }
}

const fill = (text: string, depth: number, qty: number | null, casing: string, size = "") =>
  text.replace(/\{size\}/g, size).replace(/\{depth\}/g, String(depth)).replace(/\{qty\}/g, String(qty ?? "")).replace(/\{casing\}/g, casing).replace(/[ \t]{2,}/g, " ").replace(/ *\n */g, "\n").trim();

/**
 * Build the line items for a quote.
 * @param depth  metres (0 for services that are not per metre)
 * @param casing "pvc" | "steel" | "" (only changes the wording of the casing lines)
 * @param total  the quote total in whole shillings (the site price, or the admin's own price)
 * Returns null when the template has nothing to add up, or the total is too small to split into these lines (the caller then shows the single-line quote).
 */
/** The least Labor may be when a template has an auto-balancing line: below this the other lines are scaled down so Labor stays sensible. */
export const MIN_BALANCE_LINE = 10_000;
/** The mobilization printed in the small top table, used when the quote is built for a contract with its own mobilization. */
export function withMobilization(lines: BuiltLine[], mobilization: number, total: number): BuiltLine[] {
  if (!lines.some((l) => l.kind === "mob")) return lines;
  return lines.map((l) => {
    if (l.kind === "mob") return { ...l, amount: mobilization };
    if (l.kind === "sum") return /^less/i.test(l.description) ? { ...l, amount: -mobilization } : /^balance/i.test(l.description) ? { ...l, amount: total - mobilization } : l;
    return l;
  });
}

/** Template with a fixed-rate drilling line and an auto-balancing Labor line (the drilling quote). Everything in whole shillings. */
function buildBalanced(t: QuoteTemplate, depth: number, casing: string, total: number, size: string): BuiltQuote | null {
  const word = casing === "steel" ? "steel" : casing === "pvc" ? "PVC" : "";
  type Row = { kind: "line" | "section" | "mob"; description: string; unit: string; qty: number | null; rate: number; rateOnly: boolean; label: string; fixed: boolean; balance: boolean };
  const rows: Row[] = [];
  for (const l of t.lines) {
    if (l.kind === "section") { rows.push({ kind: "section", description: fill(l.description, depth, null, word, size), unit: "", qty: null, rate: 0, rateOnly: false, label: "", fixed: false, balance: false }); continue; }
    if (l.kind === "mob") { rows.push({ kind: "mob", description: fill(l.description, depth, null, word, size), unit: "", qty: null, rate: l.rate, rateOnly: false, label: l.label ?? "", fixed: true, balance: false }); continue; }
    const q = qtyOf(l.qty, depth);
    if (q === 0) continue;
    rows.push({ kind: "line", description: fill(l.description, depth, q, word, size), unit: l.unit, qty: q, rate: l.rate, rateOnly: !!l.rateOnly || q === null, label: l.label ?? "", fixed: !!l.fixedRate, balance: !!l.balance });
  }
  const mob = rows.find((r) => r.kind === "mob");
  const items = rows.filter((r) => r.kind === "line");
  const counted = items.filter((r) => !r.rateOnly);
  const bal = counted.find((r) => r.balance);
  if (!bal || !counted.length) return null;
  const fixedSum = counted.filter((r) => r.fixed && !r.balance).reduce((a, r) => a + r.qty! * r.rate, 0);   // drilling: metres x the fixed rate
  const flex = counted.filter((r) => !r.fixed && !r.balance);                                              // the lines that may be scaled down
  const flexSum = flex.reduce((a, r) => a + r.qty! * r.rate, 0);
  const room = total - fixedSum;                                                                          // what is left for everything except drilling
  if (room < MIN_BALANCE_LINE + flex.length) return null;                                                 // the total is too small to carry these lines: the caller shows the single-line quote
  // the other lines keep their template rates; only if they leave too little for Labor are they scaled down together
  const factorNum = Math.min(flexSum, room - MIN_BALANCE_LINE), factorDen = flexSum;
  const scaleRate = (rate: number) => factorNum >= factorDen ? rate : Math.max(1, roundDiv(rate * factorNum, factorDen));
  const out = rows.map((r) => (r.kind === "line" && !r.rateOnly && !r.fixed && !r.balance ? { ...r, rate: scaleRate(r.rate) } : r));
  const flexNow = out.filter((r) => r.kind === "line" && !r.rateOnly && !r.fixed && !r.balance).reduce((a, r) => a + r.qty! * r.rate, 0);
  const labor = total - fixedSum - flexNow;
  if (labor < 1) return null;
  const tail: Row = { ...bal, rate: labor, qty: 1 };
  let sn = 0;
  const lines: BuiltLine[] = [];
  if (mob) lines.push({ kind: "mob", sn: null, description: mob.description, unit: "", qty: null, rate: null, amount: mob.rate, rateOnly: false, ...(mob.label ? { label: mob.label } : {}) });
  for (const r of out) {
    if (r.kind === "mob") continue;
    if (r.kind === "section") { lines.push({ kind: "section", sn: null, description: r.description, unit: "", qty: null, rate: null, amount: null, rateOnly: false }); continue; }
    const row = r.balance ? tail : r;
    lines.push({ kind: "line", sn: ++sn, description: row.description, unit: row.unit, qty: row.qty, rate: row.rateOnly && row.label && row.rate === 0 ? null : row.rate, amount: row.rateOnly ? null : row.qty! * row.rate, rateOnly: row.rateOnly, ...(row.label ? { label: row.label } : {}) });
  }
  if (mob) {
    lines.push({ kind: "sum", sn: null, description: "TOTAL DRILLING COST", unit: "", qty: null, rate: null, amount: total, rateOnly: false });
    lines.push({ kind: "sum", sn: null, description: "Less: rig mobilization (paid first)", unit: "", qty: null, rate: null, amount: -mob.rate, rateOnly: false });
    lines.push({ kind: "sum", sn: null, description: "BALANCE AFTER MOBILIZATION", unit: "", qty: null, rate: null, amount: total - mob.rate, rateOnly: false });
  }
  const added = lines.filter((l) => l.kind === "line").reduce((a, l) => a + (l.amount ?? 0), 0);
  if (added !== total) throw new Error(`Quote lines add up to ${added}, not ${total}`);
  for (const l of lines) if (l.kind === "line" && !l.rateOnly && l.qty! * l.rate! !== l.amount) throw new Error("A quote line does not multiply out");
  return { lines, total, templateTotal: total, footer: t.footer };
}

export function buildLines(t: QuoteTemplate, depth: number, casing: string, total: number, size = ""): BuiltQuote | null {
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(depth) || depth < 0) return null;
  if (t.lines.some((l) => l.kind === "line" && l.balance)) return buildBalanced(t, depth, casing, total, size);
  const word = casing === "steel" ? "steel" : casing === "pvc" ? "PVC" : "";

  type Row = { kind: "line" | "section"; description: string; unit: string; qty: number | null; rate: number; rateOnly: boolean; label: string };
  const rows: Row[] = [];
  for (const l of t.lines) {
    if (l.kind === "section") { rows.push({ kind: "section", description: fill(l.description, depth, null, word, size), unit: "", qty: null, rate: 0, rateOnly: false, label: "" }); continue; }
    const q = qtyOf(l.qty, depth);
    if (q === 0) continue; // a line with no quantity at this depth is left out (for example the second drilling line when the hole is 100 m or less)
    rows.push({ kind: "line", description: fill(l.description, depth, q, word, size), unit: l.unit, qty: q, rate: l.rate, rateOnly: !!l.rateOnly || q === null, label: l.label ?? "" });
  }
  // a section heading with nothing under it is dropped
  const kept = rows.filter((r, i) => r.kind === "line" || (rows[i + 1] && rows[i + 1]!.kind === "line"));

  const counted = kept.filter((r) => r.kind === "line" && !r.rateOnly);
  let templateTotal = 0;
  for (const r of counted) templateTotal += r.qty! * r.rate;
  if (!counted.length || templateTotal < 1) return null;

  // scale every rate to the quote total, to a whole shilling (never below 1 shilling for a line that has a rate)
  const scaled = kept.map((r) => ({ ...r, rate: r.kind === "line" && r.rate > 0 ? Math.max(1, roundDiv(r.rate * total, templateTotal)) : r.rate }));
  const sum = () => scaled.filter((r) => r.kind === "line" && !r.rateOnly).reduce((a, r) => a + r.qty! * r.rate, 0);

  // whatever is left after rounding goes on the largest lump-sum line (quantity 1), through its rate
  const diff = total - sum();
  let adjustment: Row | null = null;
  if (diff !== 0) {
    let best = -1;
    scaled.forEach((r, i) => { if (r.kind === "line" && !r.rateOnly && r.qty === 1 && (best < 0 || r.rate > scaled[best]!.rate)) best = i; });
    if (best >= 0 && scaled[best]!.rate + diff >= 1) scaled[best]!.rate += diff;
    else if (Math.abs(diff) * 100 <= total) adjustment = { kind: "line", description: "Rounding adjustment", unit: "Ls", qty: 1, rate: diff, rateOnly: false, label: "" }; // last resort (a template with no lump-sum line), so the quote is still exact
    else return null; // the total is too small to be split into these lines sensibly: the caller shows the single-line quote instead
  }
  if (adjustment) scaled.push(adjustment);

  let sn = 0;
  const lines: BuiltLine[] = scaled.map((r) => r.kind === "section"
    ? { kind: "section", sn: null, description: r.description, unit: "", qty: null, rate: null, amount: null, rateOnly: false }
    : { kind: "line", sn: ++sn, description: r.description, unit: r.unit, qty: r.qty, rate: r.rateOnly && r.label && r.rate === 0 ? null : r.rate, amount: r.rateOnly ? null : r.qty! * r.rate, rateOnly: r.rateOnly, ...(r.label ? { label: r.label } : {}) });

  // never hand back a quote that does not add up
  const added = lines.reduce((a, l) => a + (l.amount ?? 0), 0);
  if (added !== total) throw new Error(`Quote lines add up to ${added}, not ${total}`);
  for (const l of lines) if (l.kind === "line" && !l.rateOnly && l.qty! * l.rate! !== l.amount) throw new Error("A quote line does not multiply out");
  return { lines, total, templateTotal, footer: t.footer };
}

/** Plain-language problems to show the admin while editing a template. */
export function templateProblems(t: QuoteTemplate, built: BuiltQuote | null): string[] {
  const p: string[] = [];
  const real = t.lines.filter((l) => l.kind === "line");
  if (!real.length) p.push("The template has no lines yet.");
  else if (!built) p.push("Nothing here adds up: give at least one line a quantity and a rate above 0, or this quote will stay a single line.");
  real.forEach((l, i) => {
    const n = i + 1;
    if (!l.description.trim()) p.push(`Line ${n} has no description.`);
    if (l.rate <= 0 && !l.rateOnly) p.push(`Line ${n} has a rate of 0, so it adds nothing.`);
    if (l.qty.mode === "blank" && !l.rateOnly) p.push(`Line ${n} has no quantity. It will be shown as "Rate only" and left out of the total.`);
  });
  if (t.needsDepth && !real.some((l) => ["first", "rest", "share", "restshare", "per"].includes(l.qty.mode))) p.push("This template needs a depth, but no line uses the depth.");
  return p;
}

/* ------------------------------------------------------------- checking a template that comes from the admin screen */
const int = (v: unknown, min: number, max: number): number | null => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; };
const text = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, max);

export function cleanTemplate(input: unknown, id: string): { ok: true; template: QuoteTemplate } | { ok: false; error: string } {
  const b = (input ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.lines)) return { ok: false, error: "The template needs a list of lines." };
  if (b.lines.length > 80) return { ok: false, error: "A template can have at most 80 lines." };
  const lines: TemplateLine[] = [];
  for (let i = 0; i < b.lines.length; i++) {
    const l = (b.lines[i] ?? {}) as Record<string, unknown>;
    const at = `Line ${i + 1}`;
    const kind = l.kind === "section" ? "section" : l.kind === "mob" ? "mob" : "line";
    const description = text(l.description, 700);
    if (kind === "section") { lines.push({ kind, description, unit: "", qty: { mode: "blank" }, rate: 0 }); continue; }
    if (kind === "mob") {
      const rate = int(l.rate, 0, 100_000_000);
      if (rate === null) return { ok: false, error: `${at}: the mobilization must be a whole number of shillings.` };
      lines.push({ kind, description, unit: "", qty: { mode: "blank" }, rate, ...(text(l.label, 80) ? { label: text(l.label, 80) } : {}) }); continue;
    }
    const rate = int(l.rate, 0, 100_000_000);
    if (rate === null) return { ok: false, error: `${at}: the rate must be a whole number of shillings.` };
    const q = (l.qty ?? {}) as Record<string, unknown>;
    let qty: QtyRule;
    switch (q.mode) {
      case "fixed": case "first": case "rest": case "per": {
        const n = int(q.n, q.mode === "per" ? 1 : 0, 1_000_000);
        if (n === null) return { ok: false, error: `${at}: the quantity number must be a whole number.` };
        qty = { mode: q.mode, n }; break;
      }
      case "share": case "restshare": {
        const n = int(q.n, 0, 10_000), d = int(q.d, 1, 10_000);
        if (n === null || d === null) return { ok: false, error: `${at}: the share must be two whole numbers (for example 2 and 3).` };
        qty = { mode: q.mode, n, d }; break;
      }
      case "blank": qty = { mode: "blank" }; break;
      default: return { ok: false, error: `${at}: choose how the quantity is worked out.` };
    }
    const label = text(l.label, 20);
    lines.push({ kind, description, unit: text(l.unit, 12), qty, rate, ...(l.rateOnly || qty.mode === "blank" ? { rateOnly: true } : {}), ...((l.rateOnly || qty.mode === "blank") && label ? { label } : {}), ...(l.fixedRate ? { fixedRate: true } : {}), ...(l.balance ? { balance: true } : {}) });
  }
  const options: QuoteOption[] = [];
  if (b.options !== undefined && !Array.isArray(b.options)) return { ok: false, error: "The sizes must be a list." };
  for (const o of (b.options as unknown[] | undefined) ?? []) {
    const r = (o ?? {}) as Record<string, unknown>;
    const label = text(r.label, 40), price = int(r.price, 0, 100_000_000);
    if (!label) continue;
    if (price === null) return { ok: false, error: `Size "${label}": the price must be a whole number of shillings.` };
    if (options.some((x) => x.label.toLowerCase() === label.toLowerCase())) return { ok: false, error: `The size "${label}" is listed twice.` };
    options.push({ label, price });
  }
  if (options.length > 12) return { ok: false, error: "At most 12 sizes." };
  return { ok: true, template: { id, name: text(b.name, 60) || id, needsDepth: !!b.needsDepth, lines, footer: text(b.footer, 800), ...(options.length ? { options } : {}) } };
}

/* ------------------------------------------------------------- the two templates from the real quotations (edit them in the admin) */
/** The drilling quote's fixed numbers (owner's figures). DRILLING_TRANSPORT is a PLACEHOLDER (about KSh 50,000 at 200 m): to confirm with the owner. */
export const DRILLING_RATE_PER_METRE = 3850;
export const DRILLING_MOBILIZATION = 150_000;   // the usual mobilization shown on the quote (the client can choose another amount in the contract)
export const SURFACE_CASING_RATE = 7500;
export const DRILLING_TRANSPORT = 50_000;

export const DEFAULT_TEMPLATES: QuoteTemplate[] = [
  {
    id: "survey",
    name: "Hydro-geological survey",
    needsDepth: false,
    footer: "WRMA statutory fees and permit processing are not included in this quotation.",
    lines: [
      { kind: "line", description: "Reconnaissance surveys. This is inclusive of a comprehensive desk study on the project site.", unit: "Item", qty: { mode: "fixed", n: 1 }, rate: 10000 },
      { kind: "line", description: "Mobilize to the site of works and carry out comprehensive mapping using resistivity methods. (Hydro geological / Geophysical Borehole site investment).", unit: "Ls", qty: { mode: "fixed", n: 1 }, rate: 35000 },
      { kind: "line", description: "Compile detailed – survey report on the survey findings", unit: "Ls", qty: { mode: "fixed", n: 1 }, rate: 10000 },
    ],
  },
  {
    id: "drilling",
    name: "Borehole drilling",
    needsDepth: true,
    footer: "",
    // Drilling is a fixed KSh 3,850 per metre at every depth and price. Labor balances the numbered items to the total. Mobilization sits in its own small table above the items and is deducted from the total.
    lines: [
      { kind: "mob", description: "Rig mobilization and demobilization to project area", unit: "", qty: { mode: "blank" }, rate: DRILLING_MOBILIZATION, label: "(Will be deducted from the total cost)" },
      { kind: "line", description: "Borehole drilling, 8\" dia from ground to {depth} m", unit: "M", qty: { mode: "rest", n: 0 }, rate: DRILLING_RATE_PER_METRE, fixedRate: true },
      { kind: "line", description: "Install plain {casing} casing 6\"", unit: "M", qty: { mode: "share", n: 2, d: 3 }, rate: 1500 },
      { kind: "line", description: "Install slotted {casing} casing 6\"", unit: "M", qty: { mode: "restshare", n: 2, d: 3 }, rate: 1800 },
      { kind: "line", description: "Supply gravel pack", unit: "ton", qty: { mode: "per", n: 20 }, rate: 7000 },
      { kind: "line", description: "Well development by air", unit: "Hrs", qty: { mode: "fixed", n: 5 }, rate: 4000 },
      { kind: "line", description: "Well development by chemical", unit: "Hrs", qty: { mode: "fixed", n: 5 }, rate: 5000 },
      { kind: "line", description: "Logging", unit: "No", qty: { mode: "per", n: 2 }, rate: 200 },
      { kind: "line", description: "Construct well head", unit: "Ls", qty: { mode: "fixed", n: 1 }, rate: 1500 },
      { kind: "line", description: "Transport", unit: "Ls", qty: { mode: "fixed", n: 1 }, rate: DRILLING_TRANSPORT },
      { kind: "line", description: "Labor", unit: "Ls", qty: { mode: "fixed", n: 1 }, rate: 20000, balance: true },
      { kind: "line", description: "Permanent surface casing, only if needed (per metre)", unit: "M", qty: { mode: "blank" }, rate: SURFACE_CASING_RATE, rateOnly: true, fixedRate: true },
    ],
  },
  {
    id: "inspection",
    name: "Borehole inspection",
    needsDepth: false,
    footer: "",
    lines: [
      { kind: "line", description: "Mobilization & Demobilization", unit: "Lot", qty: { mode: "fixed", n: 1 }, rate: 5000 },
      { kind: "line", description: "Submersible Pump Labor (Pulling & Lowering)", unit: "Lot", qty: { mode: "fixed", n: 1 }, rate: 10000 },
      { kind: "line", description: "Borehole Camera Inspection & Logging", unit: "Session", qty: { mode: "fixed", n: 1 }, rate: 17000 },
      { kind: "line", description: "Technical Reporting & Deliverables", unit: "Lot", qty: { mode: "fixed", n: 1 }, rate: 0, rateOnly: true, label: "Included" },
    ],
  },
  {
    id: "testpump",
    name: "Test pumping",
    needsDepth: false,
    footer: "",
    lines: [
      { kind: "line", description: "Mobilization & Demobilization\n- Transport of the test pumping unit, heavy-duty submersible test pump, layout pipes, and technical crew to and from the site.\n- Mobilization of a high-capacity support generator to power the testing rig.", unit: "Lot", qty: { mode: "fixed", n: 1 }, rate: 15000 },
      { kind: "line", description: "Rigging & Installation Labor\n- Labor for lowering the temporary test pump string, rising mains, and water level monitoring dip meters into the borehole.\n- Safe retrieval/pulling of all testing equipment upon completion of the cycle.", unit: "Lot", qty: { mode: "fixed", n: 1 }, rate: 15000 },
      { kind: "line", description: "Multi-Stage Aquifer Testing (24-Hour Cycle)\n- Step-Drawdown Test: Pumping at progressive discharge rates to evaluate well performance.\n- Constant Discharge Test: Continuous pumping at a fixed rate to assess aquifer stability.\n- Recovery Test: Hourly monitoring of water level recharge data immediately after pump shutoff.", unit: "Session", qty: { mode: "fixed", n: 1 }, rate: 35000 },
      { kind: "line", description: "Data Analysis & Certified Reporting\n- Mathematical processing of drawdown curves, transmissivity, and specific capacity coefficients.\n- Compilation of the official Test Pumping Report with recommendations on permanent pump specifications (head/flow rate) and safe daily abstraction limits.", unit: "Lot", qty: { mode: "fixed", n: 1 }, rate: 10000 },
    ],
  },
  {
    id: "opendrill",
    name: "Open borehole drilling",
    needsDepth: true,
    footer: "",
    lines: [
      { kind: "line", description: "Rig mobilization and demobilization to project area", unit: "Ls", qty: { mode: "fixed", n: 1 }, rate: 65500 },
      { kind: "section", description: "Drilling and flushing (for about {depth} metres)", unit: "", qty: { mode: "blank" }, rate: 0 },
      { kind: "line", description: "8\" dia open drilling from ground to {qty}m", unit: "M", qty: { mode: "first", n: 100 }, rate: 3400 },
      { kind: "line", description: "8\" Ditto but upto to {depth}m", unit: "M", qty: { mode: "rest", n: 100 }, rate: 3400 },
      { kind: "line", description: "Supply drilling water", unit: "Ls", qty: { mode: "fixed", n: 1 }, rate: 10000 },
      { kind: "line", description: "Borehole flushing by air", unit: "Hrs", qty: { mode: "fixed", n: 5 }, rate: 4000 },
    ],
  },
  {
    id: "flushing",
    name: "Borehole flushing",
    needsDepth: false,   // the price is KSh 2,300 per metre; the four items below are split in the proportions of the owner's sample (150,000 / 35,000 / 25,000 / 20,000 for 100 m)
    footer: "",
    lines: [
      { kind: "line", description: "Borehole Flushing\n- High-pressure compressor injection to clear mud, silt and sand debris.", unit: "Ls", qty: { mode: "fixed", n: 1 }, rate: 150000 },
      { kind: "line", description: "Labour & Rig Operations\n- Crew for pump retrieval, cleaning impellers, re-installation and testing.", unit: "Ls", qty: { mode: "fixed", n: 1 }, rate: 35000 },
      { kind: "line", description: "Chemical Treatment\n- Food-grade chemicals used to dissolve iron oxide, bacteria and mineral scaling.", unit: "Ls", qty: { mode: "fixed", n: 1 }, rate: 25000 },
      { kind: "line", description: "Mobilization & Logistics\n- Fuel and transport to bring the heavy machinery to your site.", unit: "Ls", qty: { mode: "fixed", n: 1 }, rate: 20000 },
    ],
  },
  {
    id: "purification",
    name: "Water purification (reverse osmosis)",
    needsDepth: false,
    footer: "",
    // sizes: the client picks one. 1,000 L/hr is the price on the real quotation (1,290,000). The other two are ESTIMATES worked out from it
    // (price grows about with capacity to the power 0.6, rounded to the nearest 5,000) so the service can be used straight away. The admin should set the real prices.
    options: [{ label: "250 L/hr", price: 560000 }, { label: "500 L/hr", price: 850000 }, { label: "1,000 L/hr", price: 1290000 }],
    lines: [
      { kind: "line", description: "Slim 20\" Sediment Filtration Housing", unit: "No", qty: { mode: "fixed", n: 2 }, rate: 16840 },
      { kind: "line", description: "Slim 20\" Sediment Filters - 20 Micron", unit: "No", qty: { mode: "fixed", n: 1 }, rate: 2800 },
      { kind: "line", description: "Slim 20\" Activated Carbon Block Cartridge", unit: "No", qty: { mode: "fixed", n: 2 }, rate: 8930 },
      { kind: "line", description: "Slim 20\" Sediment Filtration Housing", unit: "No", qty: { mode: "fixed", n: 2 }, rate: 16840 },
      { kind: "line", description: "Slim 20\" Sediment Filters - 10 & 5 Micron", unit: "No", qty: { mode: "fixed", n: 2 }, rate: 2800 },
      { kind: "line", description: "pH Adjustment System with Dozing Pump", unit: "No", qty: { mode: "fixed", n: 1 }, rate: 64300 },
      { kind: "line", description: "Reverse Osmosis (R.O.) System, {size}", unit: "No", qty: { mode: "fixed", n: 1 }, rate: 982100 },
      { kind: "line", description: "Ultra Violet Disinfection System, {size}", unit: "No", qty: { mode: "fixed", n: 1 }, rate: 76210 },
      { kind: "line", description: "Food Grade (Stainless Steel Impeller) Booster Pump", unit: "No", qty: { mode: "fixed", n: 1 }, rate: 28220 },
      { kind: "line", description: "Food Grade Pump Fittings and Accessories", unit: "No", qty: { mode: "fixed", n: 1 }, rate: 9970 },
      { kind: "line", description: "Plumbing Fittings and Accessories", unit: "No", qty: { mode: "fixed", n: 1 }, rate: 32100 },
      { kind: "line", description: "Electrical Fittings and Accessories", unit: "No", qty: { mode: "fixed", n: 1 }, rate: 18610 },
      { kind: "line", description: "Installation, Testing and Commissioning", unit: "Days", qty: { mode: "fixed", n: 3 }, rate: 16320 },
    ],
  },
];
