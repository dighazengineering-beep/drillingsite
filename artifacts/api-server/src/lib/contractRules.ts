// Contract rules. ONE place for every number the owner can change. The "floors" are secret: the site never shows them to a client,
// it only refuses a price that is too low and asks the client to call.

export type ContractKind = "drill" | "opendrill" | "survey" | "other";

/** Lowest price a client may agree, per kind. A client can type any price from this up to the quoted price. */
export const FLOOR_PVC_PER_METRE = 5000;     // drilling with PVC casing, KSh per metre
export const SURVEY_DEPOSIT = 5000;           // the usual survey deposit, KSh
export const FLOOR_SURVEY_TOTAL = 15000;     // survey, KSh total
// Steel casing, open drilling and every other service: no discount is allowed online (the floor is the quoted price).
// The owner has not said whether open drilling may go lower. To allow it, set a number here: KSh per metre.
export const FLOOR_OPENDRILL_PER_METRE: number | null = null;

// Mobilization (KSh). Drilling: from 80,000 up (no upper limit, as long as it fits the price), 150,000 unless the client chooses another amount.
// Open drilling is unchanged: 80,000 to 100,000, 90,000 unless chosen.
export const MOB_MIN = 80000, MOB_DEFAULT = 150000, OPEN_MOB_MAX = 100000, OPEN_MOB_DEFAULT = 90000;
const mobMax = (kind: ContractKind) => (kind === "opendrill" ? OPEN_MOB_MAX : Infinity);
const mobRange = (kind: ContractKind) => (kind === "opendrill" ? `between KSh ${MOB_MIN.toLocaleString("en-KE")} and KSh ${OPEN_MOB_MAX.toLocaleString("en-KE")}` : `at least KSh ${MOB_MIN.toLocaleString("en-KE")}`);
export const ONSITE_PCT_MIN = 50, ONSITE_PCT_MAX = 90, ONSITE_PCT_DEFAULT = 75;   // share of the total paid by the time the rig reaches the site (includes mobilization)

export function kindOfService(name: string, depth: number, rate: number): ContractKind {
  if (/survey/i.test(name)) return "survey";
  if (/open\s+(borehole\s+)?drill/i.test(name)) return "opendrill";
  if (/flush/i.test(name)) return "other";
  if (/drill/i.test(name) && depth > 0 && rate > 0) return "drill";
  return "other";
}

export interface Stage { id: string; label: string; amount: number }

export type PriceResult = { ok: true; agreedTotal: number; agreedRate: number } | { ok: false; error: string };

const TOO_LOW = "That price is too low to agree online. Please call us to agree it.";
const TOO_HIGH = "The agreed price cannot be more than the quoted price.";

/** The agreed price, checked against the secret floors. All whole shillings. */
export function checkPrice(kind: ContractKind, q: { casing: string; depth: number; rate: number; total: number }, input: { rate?: unknown; total?: unknown }): PriceResult {
  const blank = (v: unknown) => v === undefined || v === null || v === "";
  const whole = (v: unknown) => Math.round(Number(v));
  if (kind === "drill" || kind === "opendrill") {
    if (blank(input.rate)) return { ok: true, agreedTotal: Math.round(q.total), agreedRate: Math.round(q.rate) };
    const r = whole(input.rate);
    if (!(r > 0) || !Number.isFinite(r)) return { ok: false, error: "Enter the agreed price per metre." };
    if (r > q.rate) return { ok: false, error: TOO_HIGH };
    const floor = kind === "opendrill" ? (FLOOR_OPENDRILL_PER_METRE ?? q.rate) : q.casing === "steel" ? q.rate : FLOOR_PVC_PER_METRE;
    if (r < Math.min(floor, q.rate)) return { ok: false, error: TOO_LOW };
    return { ok: true, agreedRate: r, agreedTotal: r * Math.round(q.depth) };
  }
  if (blank(input.total)) return { ok: true, agreedTotal: Math.round(q.total), agreedRate: 0 };
  const t = whole(input.total);
  if (!(t > 0) || !Number.isFinite(t)) return { ok: false, error: "Enter the agreed price." };
  if (t > q.total) return { ok: false, error: TOO_HIGH };
  const floor = kind === "survey" ? FLOOR_SURVEY_TOTAL : q.total;
  if (t < Math.min(floor, q.total)) return { ok: false, error: TOO_LOW };
  return { ok: true, agreedTotal: t, agreedRate: 0 };
}

export type ScheduleResult = { ok: true; stages: Stage[]; mobilization: number; onsitePct: number } | { ok: false; error: string };

/** The payment steps. Drilling: mobilization, then top up to the on-site share, then the balance. Anything else: deposit, then balance. */
export function buildSchedule(kind: ContractKind, total: number, input: { mobilization?: unknown; onsitePct?: unknown; depositPct: number; plan?: unknown; steps?: unknown }): ScheduleResult {
  total = Math.round(total);
  // the client may choose to pay everything in one payment instead of in steps (the price is the same)
  // the client typed the exact amount of each payment before the last; the last payment is whatever is left, so the steps always add up to the total
  if (Array.isArray(input.steps) && input.steps.length) {
    const amts = input.steps.map((v) => Math.round(Number(v)));
    if (amts.length > 4) return { ok: false, error: "You can pay in up to 5 payments." };
    if (amts.some((a) => !Number.isFinite(a) || a < 1)) return { ok: false, error: "Enter the amount of every payment." };
    const drill = kind === "drill" || kind === "opendrill";
    if (drill && (amts[0] < MOB_MIN || amts[0] > mobMax(kind))) return { ok: false, error: `The first payment (mobilization) must be ${mobRange(kind)}.` };
    const before = amts.reduce((a, b) => a + b, 0);
    const minLast = Math.max(1, Math.round((total * (100 - ONSITE_PCT_MAX)) / 100));
    if (total - before < minLast) return { ok: false, error: `The payments before the last one can add up to at most ${ONSITE_PCT_MAX}% of the contract price, so that the final payment is at least KSh ${minLast.toLocaleString("en-KE")}.` };
    const names = drill ? ["Mobilization", "On reaching the site", "Next payment", "Next payment"] : ["Deposit", "Second payment", "Third payment", "Fourth payment"];
    const stages: Stage[] = amts.map((a, i) => ({ id: i === 0 ? (drill ? "mobilization" : "deposit") : drill && i === 1 ? "onsite" : `step${i + 1}`, label: names[i], amount: a }));
    stages.push({ id: "balance", label: kind === "survey" ? "Balance, when the best point is identified" : kind === "drill" ? `Final payment, when water is hit (${Math.round(((total - before) * 100) / total)}%)` : "Final payment, on completion", amount: total - before });
    return { ok: true, mobilization: drill ? amts[0] : 0, onsitePct: drill && amts.length > 1 ? Math.round(((amts[0] + amts[1]) * 100) / total) : 0, stages };
  }
  if (input.plan === "full") return { ok: true, mobilization: 0, onsitePct: 0, stages: [{ id: "full", label: "Full payment", amount: total }] };
  if (kind === "drill" || kind === "opendrill") {
    const blankMob = input.mobilization === undefined || input.mobilization === null || input.mobilization === "";
    let m = blankMob ? (kind === "opendrill" ? OPEN_MOB_DEFAULT : MOB_DEFAULT) : Math.round(Number(input.mobilization));
    if (!Number.isFinite(m) || m < MOB_MIN || m > mobMax(kind)) return { ok: false, error: `Mobilization must be ${mobRange(kind)}.` };
    const p = input.onsitePct === undefined || input.onsitePct === null || input.onsitePct === "" ? ONSITE_PCT_DEFAULT : Math.round(Number(input.onsitePct));
    if (!Number.isFinite(p) || p < ONSITE_PCT_MIN || p > ONSITE_PCT_MAX) return { ok: false, error: `The payment on reaching the site must be between ${ONSITE_PCT_MIN}% and ${ONSITE_PCT_MAX}%.` };
    const cum = Math.round((total * p) / 100);
    if (blankMob && kind !== "opendrill" && cum - m < 1) m = MOB_MIN;   // a small contract cannot carry the usual 150,000: start from the lowest allowed instead
    if (cum - m < 1 || total - cum < 1) return { ok: false, error: "The mobilization is too large for this contract price. Please call us." };
    return { ok: true, mobilization: m, onsitePct: p, stages: [
      { id: "mobilization", label: "Mobilization", amount: m },
      { id: "onsite", label: `On reaching the site (brings your payments to ${p}%)`, amount: cum - m },
      { id: "balance", label: kind === "drill" ? `Final payment, when water is hit (${100 - p}%)` : "Balance on completion", amount: total - cum },
    ] };
  }
  const dep = kind === "survey" ? SURVEY_DEPOSIT : Math.round((total * input.depositPct) / 100);   // a survey deposit is normally KSh 5,000
  if (dep < 1 || total - dep < 1) return { ok: true, mobilization: 0, onsitePct: 0, stages: [{ id: "full", label: "Full payment", amount: total }] };
  return { ok: true, mobilization: 0, onsitePct: 0, stages: [{ id: "deposit", label: kind === "survey" ? "Deposit" : `Deposit (${input.depositPct}%)`, amount: dep }, { id: "balance", label: kind === "survey" ? "Balance, when the best point is identified" : "Balance on completion", amount: total - dep }] };
}
