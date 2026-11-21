/** Worked calculations from the client's own numbers. Anything that is not the client's number is an assumption and is labelled as one. */
const f = (n: number, d = 1) => (Number.isFinite(n) ? n.toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: 0 }) : "n/a");
export interface CalcInput { yieldText: string; zoneFrom: number; zoneTo: number; minDepth: number; maxDepth: number; preferredDepth: number; surfaceCasingTo: number; casingMm?: number }

export function workedCalculations(c: CalcInput): { head: string[]; rows: string[][]; notes: string[] } | null {
  const ys = (c.yieldText.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  const rows: string[][] = [];
  const hours = 8, eff = 0.5, sump = 3, rho = 1000, g = 9.81;
  if (ys.length) {
    const lo = Math.min(...ys), hi = Math.max(...ys), mid = (lo + hi) / 2;
    rows.push(["Daily abstraction at the expected yield", "V = Q × t", `Q = ${f(lo)} to ${f(hi)} m³/h (client); t = ${hours} h/day (assumed pumping time); V = ${f(lo)} × ${hours} and ${f(hi)} × ${hours}`, `${f(lo * hours)} to ${f(hi * hours)} m³/day (${f(lo * hours * 1000, 0)} to ${f(hi * hours * 1000, 0)} litres/day)`]);
    if (c.preferredDepth > 0) {
      const H = c.preferredDepth, kw = (rho * g * (mid / 3600) * H) / (1000 * eff);
      rows.push(["Indicative pump power", "P = ρ g Q H / η", `ρ = 1 000 kg/m³; g = 9.81 m/s²; Q = ${f(mid)} m³/h = ${f(mid / 3600, 5)} m³/s (middle of the client's range); H = ${f(H, 0)} m (preferred depth used as the total head, conservative); η = ${eff} (assumed); P = (1 000 × 9.81 × ${f(mid / 3600, 5)} × ${f(H, 0)}) / ${eff}`, `${f(kw * 1000, 0)} W, about ${f(kw, 2)} kW. Preliminary; the pump is sized after the pumping test.`]);
    }
  }
  if (c.preferredDepth > 0 && c.zoneFrom > 0 && c.zoneFrom < c.preferredDepth - sump) {
    const screenTop = c.zoneFrom > 0 ? Math.min(c.zoneFrom, c.preferredDepth) : 0, screenEnd = Math.max(screenTop, Math.min(c.zoneTo || c.preferredDepth, c.preferredDepth - sump));
    const plain = Math.max(0, screenTop), screen = Math.max(0, screenEnd - screenTop);
    rows.push(["Casing and screen arrangement", "Total depth = plain casing + screen + sump", `Preferred depth = ${f(c.preferredDepth, 0)} m (client); sump = ${sump} m (standard allowance); target zone starts at ${f(c.zoneFrom, 0)} m (client); plain casing = ${f(plain, 0)} m; screen = ${f(screenEnd, 0)} − ${f(screenTop, 0)} = ${f(screen, 0)} m`, `Plain casing ${f(plain, 0)} m, screen ${f(screen, 0)} m, sump ${sump} m. Preliminary; the final design follows the drilling log.`]);
  }
  if (c.preferredDepth > 0) {
    const d = (c.casingMm ?? 150) / 1000, per = (Math.PI * d * d) / 4;
    rows.push(["Water storage per metre of casing", "V = π d² / 4", `d = ${f(d * 1000, 0)} mm = ${f(d, 3)} m (${c.casingMm ? "client" : "assumed 6-inch casing"}); V = 3.1416 × ${f(d, 3)}² / 4`, `${f(per * 1000, 1)} litres per metre of casing`]);
  }
  if (c.minDepth > 0 && c.maxDepth > 0) rows.push(["Drilling depth range", "Range = maximum − minimum", `Minimum = ${f(c.minDepth, 0)} m; maximum = ${f(c.maxDepth, 0)} m (client); range = ${f(c.maxDepth, 0)} − ${f(c.minDepth, 0)}`, `${f(c.maxDepth - c.minDepth, 0)} m of allowable drilling depth`]);
  if (c.zoneFrom > 0 && c.zoneTo > c.zoneFrom) rows.push(["Thickness of the target zone", "Thickness = lower depth − upper depth", `Lower = ${f(c.zoneTo, 0)} m; upper = ${f(c.zoneFrom, 0)} m (client's interpreted zone); thickness = ${f(c.zoneTo, 0)} − ${f(c.zoneFrom, 0)}`, `${f(c.zoneTo - c.zoneFrom, 0)} m`]);
  if (!rows.length) return null;
  return { head: ["Quantity", "Formula", "Working (values substituted)", "Result"], rows, notes: ["Values marked (client) come from the survey data. Values marked (assumed) are standard planning allowances, not measurements, and are used only to show the method.", "Transmissivity, hydraulic conductivity and specific capacity cannot be calculated until a step-drawdown and constant-rate pumping test has been run; the formulas used then are T = 0.183 Q / Δs (Cooper-Jacob), K = T / b and Sc = Q / s."] };
}
