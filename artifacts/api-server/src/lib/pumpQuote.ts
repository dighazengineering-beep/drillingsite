import type { BuiltLine, BuiltQuote } from "./quoteLines";

// Pump installation quote. The client gives the borehole details (depth, water levels, yield, how high the water must go, power source, sand),
// the pump is sized from them, and every line is worked out in whole shillings, so quantity x rate = amount and the lines add up to the total exactly.
//
// RATES: the electric (grid) rates are taken from the owner's sample quotations. The pump price by size, and the solar and generator
// items, are ESTIMATES worked out from those samples: the owner should check them and tell us any that differ. They all live in this file.

export type PumpPower = "grid" | "solar" | "generator";
export type PumpSand = "clear" | "some" | "sandy";
export interface PumpInput { power: PumpPower; depth: number; yieldLph: number; staticLevel?: number; pumpingLevel?: number; delivery?: number; sand: PumpSand }

export const POWER_LABEL: Record<PumpPower, string> = { grid: "Grid electricity", solar: "Solar power", generator: "Generator" };
const MOTORS_KW = [0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22];
const GENSETS_KVA = [10, 15, 20, 30, 40, 60, 80];

const round = (n: number, to: number) => Math.round(n / to) * to;
const intIn = (n: unknown, lo: number, hi: number) => (Number.isFinite(Number(n)) && n !== "" && n !== null ? Math.min(hi, Math.max(lo, Math.round(Number(n)))) : NaN);

export type PumpResult = { ok: true; built: BuiltQuote; kw: number; tdh: number; flow: number; settingDepth: number } | { ok: false; error: string };

export function buildPumpQuote(inp: PumpInput): PumpResult {
  const power: PumpPower = inp.power === "solar" || inp.power === "generator" ? inp.power : "grid";
  const depth = Math.round(Number(inp.depth)), yieldLph = Math.round(Number(inp.yieldLph));
  if (!(depth >= 20 && depth <= 600)) return { ok: false, error: "Enter the borehole depth in metres, between 20 and 600." };
  if (!(yieldLph >= 500 && yieldLph <= 60000)) return { ok: false, error: "Enter the borehole yield in litres per hour, between 500 and 60,000." };
  const st = inp.staticLevel === undefined ? NaN : intIn(inp.staticLevel, 0, depth);
  const pl = inp.pumpingLevel === undefined ? NaN : intIn(inp.pumpingLevel, 0, depth);
  if (Number.isFinite(st) && Number.isFinite(pl) && pl < st) return { ok: false, error: "The pumping water level must be deeper than the static (resting) level." };
  const level = Number.isFinite(pl) ? pl : Number.isFinite(st) ? st : Math.round(depth * 0.6); // when the client does not know the water level, 60% of the depth is assumed
  const delivery = inp.delivery === undefined || !Number.isFinite(Number(inp.delivery)) ? 20 : Math.min(300, Math.max(0, Math.round(Number(inp.delivery))));

  const flow = Math.round(yieldLph * 0.8) / 1000;               // pump no more than 80% of the yield, m3/hr
  const tdh = Math.round((level + delivery) * 1.1);              // total dynamic head, with 10% for friction in the pipes
  const settingDepth = Math.max(12, Math.min(depth - 6, level + 20));
  const need = (flow * tdh) / (367 * 0.62);                      // shaft power in kW at about 62% pump efficiency
  const kw = MOTORS_KW.find((k) => k >= need);
  if (!kw) return { ok: false, error: "That pump is too big for an instant quote. Please call or WhatsApp us and we will quote it properly." };
  if (tdh > 450) return { ok: false, error: "That head is too high for an instant quote. Please call or WhatsApp us." };

  const big = flow > 12;
  const lines: BuiltLine[] = [];
  let sn = 0;
  const section = (t: string) => lines.push({ kind: "section", sn: null, description: t, unit: "", qty: null, rate: null, amount: null, rateOnly: false });
  const add = (description: string, unit: string, qty: number, rate: number) => lines.push({ kind: "line", sn: ++sn, description, unit, qty, rate, amount: qty * rate, rateOnly: false });

  const pump = round(270000 * Math.pow(kw / 7.5, 0.75), 1000);
  const cableRate = kw <= 2.2 ? 250 : kw <= 5.5 ? 420 : kw <= 11 ? 600 : 1000;
  const cableName = kw <= 2.2 ? "2.5 mm" : kw <= 5.5 ? "4 mm" : kw <= 11 ? "6 mm" : "10 mm";
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  section("Submersible pump and rising main");
  add(`Supply of a ${fmt(kw)} kW submersible pump and motor (Grundfos or equivalent), capable of pumping ${fmt(flow)} m³/hr at a total head of ${tdh} m`, "No", 1, pump);
  if (inp.sand !== "clear") add("Sand-resistant (stainless steel) pump stages, for water carrying sand", "No", 1, round(pump * 0.25, 1000));
  add(big ? '3" UPVC heavy gauge 3 m pipes with sockets' : '2" UPVC heavy gauge 3 m pipes with sockets', "No", Math.ceil(settingDepth / 3), big ? 5500 : 2800);
  add(big ? 'Adaptor set 3"' : 'Adaptor set 2"', "No", 1, big ? 9000 : 6000);
  add('Non-return valve', "No", 1, big ? 12000 : 8000);
  add(big ? 'Supply and installation of 3" flow meter' : 'Supply and installation of 2" flow meter', "No", 1, big ? 45000 : 30000);

  section("Cables and electrical");
  add(`Submersible cable ${cableName}² by 4 core`, "m", settingDepth + 10, cableRate);
  add(`Armoured cable 4 core ${cableName}²`, "m", 10, round((cableRate * 7) / 6, 10));
  add("U-PVC airline / piezometer for water level", "No", settingDepth, 250);
  add("10 mm green earth cable", "m", 4, 300);
  add("Earth rod 4 ft and clamp", "No", 1, 1500);
  add("Cable ties and splicing kit", "No", 1, 10000);
  add("Electrode probe sensors with 200 m cable", "Set", 1, 10000);
  add("Cable junction box", "No", 1, 2500);
  add("Installation sundries", "No", 1, 2300);
  add("Bore cover plate and piping accessories", "Set", 1, 20000);

  if (power === "solar") {
    const panels = Math.ceil((kw * 1.3 * 1000) / 550);
    section("Solar power system");
    add("550 W mono solar panels", "No", panels, 30000);
    add("Panel mounting structure", "No", panels, 6500);
    add("Solar pump inverter / controller", "No", 1, 20000 + round(kw * 22000, 1000));
    add("Solar DC cable 6 mm", "m", 40, 190);
    add("DC isolator and surge protection", "No", 1, 12000);
    add("Lightning arrestor with accessories", "No", 1, 15000);
    add("Float switch for the tank", "No", 1, 6000);
    add("6 mm 4 core cable to the float switch", "m", 30, 600);
  } else {
    section(power === "generator" ? "Generator and controls" : "Controls");
    add(kw <= 7.5 ? "Electrical control panel 0.55-7.5 kW 3PH" : "Electrical control panel 11-22 kW 3PH", "No", 1, kw <= 7.5 ? 50000 : 90000);
    add("TPN switch fuse", "No", 1, 10000);
    add("AVS 3 phase and accessories", "No", 1, 20000);
    if (power === "generator") {
      const kva = GENSETS_KVA.find((k) => k >= kw * 2.2) ?? 100;
      add(`${kva} kVA diesel generator, canopy type, with starter battery`, "No", 1, kva * 28000 + 40000);
      add("Generator changeover switch", "No", 1, 25000);
    }
  }

  section("Installation");
  add("Pumping equipment installation charges", "L.s", 1, power === "solar" ? 60000 : kw <= 7.5 ? 40000 : kw <= 15 ? 60000 : 80000);

  let total = 0;
  for (const l of lines) if (l.kind === "line") total += l.amount ?? 0;
  const footer = [
    `Design basis: borehole ${depth} m deep, yield ${yieldLph.toLocaleString("en-US")} L/hr (pumped at 80%), water level about ${level} m, water pushed up ${delivery} m, power: ${POWER_LABEL[power]}${inp.sand !== "clear" ? ", water carries sand" : ""}.`,
    `Pump sized at ${fmt(flow)} m³/hr, total head ${tdh} m, ${fmt(kw)} kW, set at about ${settingDepth} m. The final pump is confirmed from the test pumping report or after our site visit.`,
    "Prices do not include tanks, towers, fencing or other civil works.",
  ].join("\n");
  return { ok: true, built: { lines, total, templateTotal: total, footer }, kw, tdh, flow, settingDepth };
}
