import type { BuiltLine, BuiltQuote } from "./quoteLines";

// Solar installation quote. The client picks the kind of system, its size, how much battery backup and where the panels go.
// Everything else (panels, inverter, cables, protection, labour) is worked out from that, every line in whole shillings,
// so quantity x rate = amount and the lines add up to the total exactly.
//
// RATES: all of these are ESTIMATES (normal Kenyan market prices; the panel price matches the JA Solar 550W on the shop page).
// The owner should check them and tell us any that differ. They all live in this file.

export type SolarType = "grid" | "hybrid" | "offgrid";
export type SolarMount = "roof" | "ground";
export const SOLAR_TYPE_LABEL: Record<SolarType, string> = { grid: "Grid-tied (no battery)", hybrid: "Hybrid (solar, battery and grid)", offgrid: "Off-grid (solar and battery)" };
export const SOLAR_SIZES = [2, 3, 5, 8, 10] as const;

const PANEL_W = 550, PANEL_PRICE = 30000;
const INVERTER: Record<number, number> = { 2: 60000, 3: 80000, 5: 130000, 8: 220000, 10: 270000 };   // hybrid / off-grid inverter by size (kW); grid-tied costs 70% of this
const PACKS_DEFAULT: Record<number, number> = { 2: 1, 3: 1, 5: 2, 8: 3, 10: 4 };                       // recommended 5 kWh lithium packs
const PACK_PRICE = 125000;
export const MAX_PACKS = 8;
const round = (n: number, to: number) => Math.round(n / to) * to;

export type SolarResult = { ok: true; built: BuiltQuote; panels: number; kw: number } | { ok: false; error: string };

export function buildSolarQuote(inp: { type: unknown; kw: unknown; packs?: unknown; mount?: unknown }): SolarResult {
  const type = (["grid", "hybrid", "offgrid"] as const).find((x) => x === inp.type);
  if (!type) return { ok: false, error: "Choose the kind of solar system: grid-tied, hybrid or off-grid." };
  const kw = Math.round(Number(inp.kw));
  if (!(SOLAR_SIZES as readonly number[]).includes(kw)) return { ok: false, error: "Choose the system size." };
  const mount: SolarMount = inp.mount === "ground" ? "ground" : "roof";
  const wantPacks = inp.packs === undefined || inp.packs === null || inp.packs === "" ? NaN : Math.round(Number(inp.packs));
  if (Number.isFinite(wantPacks) && (wantPacks < 1 || wantPacks > MAX_PACKS) && type !== "grid") return { ok: false, error: `Choose between 1 and ${MAX_PACKS} battery packs.` };
  const packs = type === "grid" ? 0 : Number.isFinite(wantPacks) ? wantPacks : PACKS_DEFAULT[kw]!;

  const panels = Math.ceil((kw * 1000) / PANEL_W);
  const lines: BuiltLine[] = [];
  let sn = 0;
  const section = (t: string) => lines.push({ kind: "section", sn: null, description: t, unit: "", qty: null, rate: null, amount: null, rateOnly: false });
  const add = (description: string, unit: string, qty: number, rate: number) => lines.push({ kind: "line", sn: ++sn, description, unit, qty, rate, amount: qty * rate, rateOnly: false });

  section("Solar panels and mounting");
  add(`${PANEL_W} W mono solar panels (${((panels * PANEL_W) / 1000).toFixed(2).replace(/\.?0+$/, "")} kW of panels)`, "No", panels, PANEL_PRICE);
  add(mount === "roof" ? "Roof mounting rails, clamps and hooks" : "Ground-mount steel frame with concrete footings", "No", panels, mount === "roof" ? 6500 : 9500);

  section("Inverter and battery");
  const inv = type === "grid" ? round(INVERTER[kw]! * 0.7, 1000) : INVERTER[kw]!;
  add(`${kw} kW ${type === "grid" ? "grid-tied" : type === "hybrid" ? "hybrid" : "off-grid"} solar inverter${type === "grid" ? "" : " with built-in MPPT charger"}`, "No", 1, inv);
  if (packs > 0) add("5 kWh lithium (LiFePO4) battery with BMS", "No", packs, PACK_PRICE);

  section("Cables and protection");
  add("Solar DC cable 6 mm", "m", 40 + (mount === "ground" ? 20 : 0), 190);
  add("AC cable and conduit to the distribution board", "m", 20, 450);
  add("DC isolator, breakers and surge protection", "Set", 1, 15000 + kw * 2000);
  add("Earthing kit and lightning protection", "Set", 1, 8000);

  section("Installation");
  add("Installation, testing and commissioning", "L.s", 1, round(25000 + kw * 8000, 1000));
  add("Transport of equipment to your site", "L.s", 1, 15000);

  let total = 0;
  for (const l of lines) if (l.kind === "line") total += l.amount ?? 0;
  const footer = [
    `Design basis: ${SOLAR_TYPE_LABEL[type]}, ${kw} kW system${packs ? `, ${packs * 5} kWh of battery storage (${packs} pack${packs > 1 ? "s" : ""})` : ""}, panels on the ${mount === "roof" ? "roof" : "ground"}.`,
    "The final design is confirmed after our site visit, from the appliances you want to run.",
    type === "grid" ? "Net metering and the utility application are not included; any extra cost is set by the utility." : "Prices do not include extra wiring of your building or changes to your existing electrical board.",
  ].join("\n");
  return { ok: true, built: { lines, total, templateTotal: total, footer }, panels, kw };
}
