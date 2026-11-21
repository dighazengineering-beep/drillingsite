import type { ContractKind } from "./contractRules";
import { SURFACE_CASING_RATE } from "./quoteLines";

// The wording of the contract. DRAFT for the owner to approve: edit the text here. {company} is replaced with the company name.
// Each entry is a numbered clause. A line starting with "-" is shown as a bullet, **text** is bold.
// Kept short on purpose. Clauses sit two to a row on the printed page, so clauses that follow each other are written to be about the same length.
// A clause with 3 or more bullets takes a full row by itself.

type Clause = readonly [string, string];

const PAY_STEPS = "The Client pays the steps in the payment schedule, to the Company's payment details shown in this contract. A step counts only when {company} has confirmed it. Cash is paid only against an official receipt. Work for the next step starts after the earlier step is paid.";
const PAY_FULL = "The Client pays the full contract price in one payment, to the Company's payment details shown in this contract. It counts only when {company} has confirmed it. Cash is paid only against an official receipt. Work starts after that.";

const LAW: Clause = ["Disagreements", "We will first try to settle any disagreement by talking. If that fails, Kenyan law applies and the courts of Kenya decide."];
const AGREEMENT: Clause = ["Agreement", "This contract and the attached quotation are the whole agreement. Any change must be in writing and signed by both parties. It takes effect when both sign."];
const DELAYS: Clause = ["Delays", "Dates are estimates. {company} is not responsible for delays caused by weather, unrest, an unsafe site, a late payment or anything outside our control. We will tell the Client early."];
const CANCEL: Clause = ["Cancellation", "If the Client cancels after the first payment, money already spent on moving equipment, work done or materials is not refunded. The rest is returned."];

/** What the system knows when the contract is made and prints inside the wording. */
export interface TermsOpts { siteDay?: string; finalPct?: number }

const KSH = (n: number) => `KSh ${n.toLocaleString("en-KE")}`;

/** The DRILLING contract (steel or PVC casing). Plain, short wording; the crucial parts are in bold. */
function drillClauses(full: boolean, o: TermsOpts): Clause[] {
  const finalPct = o.finalPct && o.finalPct > 0 && o.finalPct < 100 ? o.finalPct : 25;
  return [
    ["The work", "{company} (\"the Company\") will drill a borehole for the client (\"the Client\") at the place the Client shows. The work included is the list in the quotation."],
    ["Price and depth", `Price = agreed rate per metre × metres drilled. The total uses the quoted depth. **The Client pays only for the exact depth drilled.** If the depth changes, the price changes at the same rate. Both sides agree the final depth before the last payment. If loose soil needs a permanent surface casing (usually the top 1 to 15 m), it is charged at ${KSH(SURFACE_CASING_RATE)} per metre.`],
    ["Mobilization", "Mobilization pays for moving the rig and crew to the site and back. It is " + (full ? "part of the total, not extra." : "deducted from the total, not extra, and is paid before the rig moves.")],
    ["Payment", full
      ? "The Client pays the full contract price in one payment, to the Company's payment details shown in this contract. It counts when the Company has confirmed it. Cash is paid only against an official receipt. Cheques are paid into the Company's bank accounts shown. Work starts after that."
      : `The Client pays the steps in the payment schedule, to the Company's payment details shown in this contract. A step counts when the Company has confirmed it. Cash is paid only against an official receipt. Cheques are paid into the Company's bank accounts shown. Work for the next step starts after the earlier step is paid. **The last ${finalPct}% is paid when water is hit, so that we can complete the borehole.**`],
    ["Timeline", (o.siteDay ? `Work starts on **${o.siteDay}**, the site day the Client chose, ` : "Work starts on a day agreed with the Client ") + (full ? "once the full payment is confirmed. " : "once the mobilization is paid. The Client then waits for the rig. ") + "**Drilling normally takes 3 to 6 days, depending on the soil profile and the environment.** Dates are estimates. Weather, an unsafe site, a late payment or anything outside our control can move them."],
    ["Client's responsibilities", "- Give safe access to the site on the agreed dates.\n- Point out the exact place and any underground pipes or cables.\n- Have the permits (NEMA and WARMA), or ask us to help.\n- **Pay on time.**"],
    ["Warranty", "The Company repairs faults in its own workmanship, reported in good time, at its own cost. Not covered: damage by others, a pump or power we did not install, wear and tear, or a falling water level. The Company is not responsible for indirect losses."],
    ["Ending the contract", "Either side can end this contract in writing. The Client then pays for the work already done and the travel."],
    LAW,
    ["Whole agreement", "This contract and the quotation are the whole agreement. Any change must be in writing and signed by both parties. It takes effect when both sign."],
  ];
}

function openDrillClauses(full: boolean): Clause[] {
  return [
    ["The work", "{company} (\"the Company\") will drill a borehole for the client (\"the Client\") at the place the Client shows. The work included is the list in the attached quotation."],
    ["Price and depth", "Price = agreed rate per metre × metres drilled. The total uses the quoted depth. If the depth changes, the price changes at the same rate. Both sides agree the final depth before the last payment."],
    ["Mobilization", "Mobilization pays for moving the rig and crew to the site and back. It is part of the total, not extra" + (full ? "." : ", and is paid before the rig moves.")],
    ["Payment", full ? PAY_FULL : PAY_STEPS],
    ["Timeline", "Work starts on a date we agree together, and we keep the Client updated. Dates are estimates. Weather, an unsafe site, a late payment or anything outside our control can move them."],
    ["Client's responsibilities", "- Give safe access to the site on the agreed dates.\n- Point out the exact place and any underground pipes or cables.\n- Have the permits (NEMA and WARMA), or ask us to help.\n- Pay on time."],
    ["Warranty", "The Company repairs faults in its own workmanship, reported in good time, at its own cost. Not covered: damage by others, a pump or power we did not install, wear and tear, or a falling water level. The Company is not responsible for indirect losses."],
    ["Ending the contract", "Either side can end this contract in writing. The Client then pays for the work already done and the travel."],
    LAW,
    AGREEMENT,
  ];
}

function surveyClauses(full: boolean): Clause[] {
  return [
    ["The work", "{company} (\"the Company\") will carry out a hydrogeological survey for the client (\"the Client\") at the place in the attached quotation. It includes:\n- a site visit and desk study;\n- a geophysical investigation;\n- marking the best drilling point on the ground;\n- a written report."],
    ["Report", "The fieldwork is complete when the best point has been found and shown to the Client. The written report comes within 2 to 3 days after that, once the final payment is confirmed. It gives the drilling point, expected depth and water potential."],
    ["Payment", full
      ? "The Client pays the full price in Kenya shillings by M-Pesa or bank transfer through the website, before the survey starts. It counts only when the Company has confirmed it."
      : "Paid in Kenya shillings by M-Pesa or bank transfer through the website. The deposit, normally KSh 5,000, is paid before the geologist travels and is part of the price. **The balance is paid the same day the best point is found.** A payment counts only when the Company has confirmed it."],
    ["Nature of a survey", "A survey is the hydrogeologist's expert opinion. It lowers the risk of drilling at the wrong place but cannot guarantee water, its amount or its quality. The fee is payable whether or not a borehole is drilled."],
    ["Delays", "Dates are estimates. The Company is not responsible for delays caused by weather, unrest, an unsafe site, a late payment or anything outside its control."],
    ["Client's responsibilities", "- Give safe access to the site.\n- Point out the area and any underground pipes, cables or septic tanks.\n- Be present, or send a representative, to be shown the point."],
    ["Cancellation", "If the Client cancels after the team has travelled or started, the Client still pays for the work done and the travel."],
    LAW,
    AGREEMENT,
  ];
}

function otherClauses(full: boolean): Clause[] {
  return [
    ["The work", "{company} will supply and carry out the work described in the attached quotation, to a good standard and on the agreed dates."],
    ["Warranty", "{company} repairs faults in its own workmanship, reported in good time, at its own cost. Manufacturers' warranties apply to equipment."],
    ["Payment", full ? PAY_FULL : PAY_STEPS],
    DELAYS,
    CANCEL,
    LAW,
    ["Client's responsibilities", "- Give safe access to the site on the agreed dates.\n- Point out the exact place and any underground pipes or cables.\n- Pay on time."],
    AGREEMENT,
  ];
}

export function termsFor(kind: ContractKind, company: string, full = false, opts: TermsOpts = {}): string {
  const list = kind === "survey" ? surveyClauses(full) : kind === "drill" ? drillClauses(full, opts) : kind === "opendrill" ? openDrillClauses(full) : otherClauses(full);
  return list.map(([h, t], i) => `${i + 1}. ${h}\n${t}`).join("\n\n").replace(/\{company\}/g, company);
}
