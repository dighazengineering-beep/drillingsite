import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";

/**
 * Report figures drawn from the person's own data:
 *  - sectionFigure(): the machine screenshot (ADMT / PQWT) inside a titled frame, with the chosen station and the target aquifer zone marked on it.
 *  - boreholeFigure(): the proposed borehole drawn from the confirmed layers and depths.
 * The screenshot itself is never redrawn: only lines, labels and boxes are added on top of it.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
let fontsOk = false;
function fonts() {
  if (fontsOk) return;
  for (const dir of [path.resolve(here, "../assets/fonts"), path.resolve(here, "../../assets/fonts"), path.resolve(process.cwd(), "assets/fonts")]) {
    try {
      GlobalFonts.registerFromPath(path.join(dir, "DejaVuSans.ttf"), "ReportSans");
      GlobalFonts.registerFromPath(path.join(dir, "DejaVuSans-Bold.ttf"), "ReportSans");
      fontsOk = true; return;
    } catch { /* try the next folder */ }
  }
}
const F = (px: number, bold = false) => `${bold ? "bold " : ""}${px}px ReportSans, sans-serif`;
const NAVY = "#0b2a4a", RED = "#d12b2b";

export interface SectionCalibration {
  /** pixel rows of two known depths on the screenshot's depth axis */
  y1: number; d1: number; y2: number; d2: number;
  /** pixel column of the chosen station on the screenshot */
  stationX: number;
  /** pixel box of the coloured plot (where lines may be drawn) */
  plot: { x0: number; x1: number; y0: number; y1: number };
}
export interface SectionInput {
  screenshot: Buffer;
  cal: SectionCalibration;
  station: string;
  zoneFrom: number; zoneTo: number;
  yieldText: string;
  instrument: string;
  surveyDate: string;
  title?: string;
  subtitle?: string;
  summary: [string, string][];
  /** the drilling depths the client typed; drawn on the picture so it supports them */
  depths?: { min?: number; max?: number; preferred?: number };
  /** the colour legend of the instrument, read from the screenshot by the AI: ["High", ">200"] style rows are optional */
  note?: string;
}

function wrap(ctx: SKRSContext2D, text: string, w: number): string[] {
  const out: string[] = []; let line = "";
  for (const word of text.split(/\s+/)) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export async function sectionFigure(inp: SectionInput): Promise<Buffer> {
  fonts();
  const img = await loadImage(inp.screenshot);
  // landscape (desktop-style) layout: the machine picture on the left, notes and summary on the right
  const W = 1800, M = 28, headH = 78;
  const nBars = depthBarsFor({ zoneFrom: inp.zoneFrom, zoneTo: inp.zoneTo, min: inp.depths?.min, max: inp.depths?.max, preferred: inp.depths?.preferred }).length;
  const sumRows = inp.summary.length;
  const rightNeed = 660 + sumRows * 46 + 60 + (nBars ? 100 + nBars * 78 : 0);
  const contentH0 = Math.max(960, rightNeed);
  const yv = (inp.yieldText.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n > 0);
  const yBars: DepthBar[] = yv.length ? [{ label: "Expected yield", from: yv.length > 1 ? Math.min(...yv) : 0, to: Math.max(...yv), color: "#0f8a5f" }] : [];
  const scale = Math.min(contentH0 / img.height, 900 / img.width), imgW = Math.round(img.width * scale), imgHh = Math.round(img.height * scale);
  // keep the screenshot full size; if the strip under it is small, make the picture a little taller so the yield bars fit there
  const contentH = yBars.length ? Math.max(contentH0, imgHh + 210) : contentH0;
  const H = headH + M + contentH + M;
  const sideW = W - M * 2 - imgW - 16;
  const c = createCanvas(W, H); const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  // title bar
  g.fillStyle = NAVY; g.fillRect(0, 0, W, headH);
  g.fillStyle = "#fff"; g.textAlign = "center"; g.font = F(30, true);
  g.fillText(inp.title ?? "INTERPRETED GEOELECTRIC SECTION", W / 2, 38);
  g.font = F(20); g.fillText(inp.subtitle ?? "(Groundwater Exploration)", W / 2, 64);
  g.textAlign = "left";
  const ox = M, oy = headH + M;
  g.drawImage(img, ox, oy, imgW, imgHh);
  g.strokeStyle = NAVY; g.lineWidth = 2; g.strokeRect(ox, oy, imgW, imgHh);
  if (yBars.length) { const by = oy + imgHh + 20; drawDepthBars(g, ox, by, imgW, oy + contentH - by, yBars, "EXPECTED YIELD (m³/hour)", "m³/h"); }
  const px = (x: number) => ox + x * scale, py = (y: number) => oy + y * scale;
  const { cal } = inp;
  const yOfDepth = (d: number) => cal.y1 + ((d - cal.d1) * (cal.y2 - cal.y1)) / (cal.d2 - cal.d1);
  // magnitude only: depths on the screen are negative
  const dep = (d: number) => -Math.abs(d);
  const yA = py(yOfDepth(dep(inp.zoneFrom))), yB = py(yOfDepth(dep(inp.zoneTo)));
  const x0 = px(cal.plot.x0), x1 = px(cal.plot.x1);
  // shaded zone
  g.fillStyle = "rgba(209,43,43,0.12)"; g.fillRect(x0, Math.min(yA, yB), x1 - x0, Math.abs(yB - yA));
  g.strokeStyle = RED; g.lineWidth = 2.5; g.setLineDash([10, 7]);
  for (const y of [yA, yB]) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
  g.setLineDash([]);
  // the client's drilling depths (green): preferred solid, minimum and maximum dashed
  const GREEN = "#0f8a5f";
  const dl = (d: number | undefined, label: string, dash: boolean) => {
    if (!d || d <= 0) return;
    const y = py(yOfDepth(dep(d)));
    if (!(y > py(cal.plot.y0) && y < py(cal.plot.y1))) return;
    g.strokeStyle = GREEN; g.lineWidth = dash ? 2.5 : 3.5; g.setLineDash(dash ? [4, 6] : []);
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]);
    g.font = F(16, true); const t = `${label} ${d} m`; const w = g.measureText(t).width + 12;
    g.fillStyle = GREEN; g.fillRect(x1 - w - 4, y - 22, w, 22); g.fillStyle = "#fff"; g.fillText(t, x1 - w + 2, y - 5);
  };
  dl(inp.depths?.min, "Min", true); dl(inp.depths?.max, "Max", true); dl(inp.depths?.preferred, "Preferred", false);
  // station line
  const sx = px(cal.stationX);
  g.lineWidth = 3; g.beginPath(); g.moveTo(sx, py(cal.plot.y0)); g.lineTo(sx, py(cal.plot.y1)); g.stroke();
  // station tag
  g.fillStyle = RED; const tag = `STATION ${inp.station}`; g.font = F(17, true);
  const tw = g.measureText(tag).width + 18;
  const tx = Math.min(Math.max(sx - tw / 2, ox + 4), ox + imgW - tw - 4);
  const ty0 = py(cal.plot.y0) + 6; g.fillRect(tx, ty0, tw, 28); g.fillStyle = "#fff"; g.fillText(tag, tx + 9, ty0 + 20);
  // depth labels on the dashed lines
  g.fillStyle = RED; g.font = F(16, true);
  g.fillText(`${inp.zoneFrom} m`, x0 + 6, Math.min(yA, yB) - 6);
  g.fillText(`${inp.zoneTo} m`, x0 + 6, Math.max(yA, yB) + 20);
  // right-hand notes
  const rx = ox + imgW + 16; let ry = oy;
  const box = (head: string, lines: string[], stroke: string) => {
    g.font = F(27); const body = lines.flatMap((l) => wrap(g, l, sideW - 30));
    const h = 52 + body.length * 36 + 12;
    g.strokeStyle = stroke; g.lineWidth = 2; g.setLineDash(stroke === RED ? [6, 4] : []);
    g.strokeRect(rx, ry, sideW, h); g.setLineDash([]);
    g.fillStyle = stroke; g.font = F(27, true); g.fillText(head, rx + 14, ry + 36);
    g.fillStyle = "#222"; g.font = F(27); body.forEach((l, i) => g.fillText(l, rx + 14, ry + 78 + i * 36));
    ry += h + 16;
  };
  box("TARGET AQUIFER ZONE", [`${inp.zoneFrom} – ${inp.zoneTo} m below ground level`, `Expected yield: ${inp.yieldText}`], RED);
  box("HOW TO READ", ["Warm colours (yellow to red) show higher resistivity: hard or dry formations.", "Cool colours (blue) show lower resistivity: fractured, weathered or saturated zones.", "Use the instrument's own colour scale on the left of the picture."], RED);
const dd = inp.depths ?? {}; const rng = dd.min && dd.max ? `${dd.min} – ${dd.max} m` : "";
  box("DRILLING RECOMMENDATION", [dd.preferred || rng ? `Drilling is recommended at Station ${inp.station}${dd.preferred ? ` to a preferred depth of ${dd.preferred} m` : ""}${rng ? ` (range ${rng})` : ""}.` : `Drilling is recommended at Station ${inp.station}, targeting ${inp.zoneFrom} – ${inp.zoneTo} m.`, "Final depth to be confirmed by geological logging and water strikes during drilling."], RED);
  // summary table (right column, under the notes)
  let ty = ry + 6;
  g.fillStyle = NAVY; g.fillRect(rx, ty, sideW, 50); g.fillStyle = "#fff"; g.font = F(27, true); g.textAlign = "center";
  g.fillText("INTERPRETATION SUMMARY", rx + sideW / 2, ty + 35); g.textAlign = "left"; ty += 50;
  inp.summary.forEach(([k, v], i) => {
    g.fillStyle = i % 2 ? "#f1f5f9" : "#fff"; g.fillRect(rx, ty, sideW, 46);
    g.strokeStyle = "#cbd5e1"; g.lineWidth = 1; g.strokeRect(rx, ty, sideW, 46);
    g.fillStyle = "#111"; g.font = F(26, true); g.fillText(k, rx + 14, ty + 32, 330);
    g.font = F(26); g.fillText(v, rx + 360, ty + 32, sideW - 374); ty += 46;
  });
  // fill the rest of the right column with the client's depth plan (no empty space)
  const bars = depthBarsFor({ zoneFrom: inp.zoneFrom, zoneTo: inp.zoneTo, min: inp.depths?.min, max: inp.depths?.max, preferred: inp.depths?.preferred });
  const room = H - M - ty - 22;
  if (bars.length && room >= 170) drawDepthBars(g, rx, ty + 22, sideW, Math.min(room, 80 + bars.length * 78 + 140), bars, "DEPTH PLAN (client's figures, m below ground)");
  return c.toBuffer("image/png");
}

export interface BoreholeInput {
  title: string;
  /** layers from the surface down: from/to in metres, label, kind decides the colour */
  layers: { from: number; to: number; label: string; kind: "soil" | "weathered" | "aquifer" | "deep" | "rock" }[];
  surfaceCasingTo: number;
  screens: { from: number; to: number; label: string }[];
  minDepth: number; recommendedDepth: number;
}
const LAYER_COLOURS: Record<string, string> = { soil: "#8b5a3c", weathered: "#e7d9b3", aquifer: "#a1d0f0", deep: "#2f7fc1", rock: "#9ca3af" };

export async function boreholeFigure(inp: BoreholeInput): Promise<Buffer> {
  fonts();
  const maxD = Math.max(inp.recommendedDepth, ...inp.layers.map((l) => l.to)) + 15;
  const W = 1400, top = 120, ph = 1000, H = top + ph + 50;
  const sy = (d: number) => top + (d / maxD) * ph;
  const c = createCanvas(W, H); const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.fillStyle = NAVY; g.font = F(24, true); g.fillText(inp.title, 40, 42);
  g.font = F(16); g.fillStyle = "#475569"; g.fillText("Schematic, not to scale horizontally. Depths are approximate and are confirmed during drilling.", 40, 70);
  const cx = 430, colW = 270, bw = 54;
  // depth axis
  g.strokeStyle = "#334155"; g.fillStyle = "#334155"; g.lineWidth = 1.5; g.font = F(15);
  g.beginPath(); g.moveTo(110, top); g.lineTo(110, sy(maxD)); g.stroke();
  const step = maxD > 200 ? 50 : 25;
  for (let d = 0; d <= maxD; d += step) { g.beginPath(); g.moveTo(104, sy(d)); g.lineTo(110, sy(d)); g.stroke(); g.textAlign = "right"; g.fillText(String(d), 98, sy(d) + 5); }
  g.textAlign = "left"; g.save(); g.translate(30, top + ph / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillText("Depth below ground level (m)", 0, 0); g.restore(); g.textAlign = "left";
  // layers
  for (const l of inp.layers) {
    g.fillStyle = LAYER_COLOURS[l.kind] ?? "#ddd"; g.fillRect(cx - colW / 2, sy(l.from), colW, sy(l.to) - sy(l.from));
    g.fillStyle = "#0b2a4a"; g.font = F(15); g.fillText(`${l.from}–${l.to} m  ${l.label}`, cx + colW / 2 + 18, (sy(l.from) + sy(l.to)) / 2 + 5);
  }
  // casing (open bore)
  g.fillStyle = "#fff"; g.fillRect(cx - bw / 2, sy(0), bw, sy(inp.recommendedDepth) - sy(0));
  g.strokeStyle = NAVY; g.lineWidth = 3; g.strokeRect(cx - bw / 2, sy(0), bw, sy(inp.recommendedDepth) - sy(0));
  g.fillStyle = "#9ca3af"; g.fillRect(cx - bw / 2 - 9, sy(0), 9, sy(inp.surfaceCasingTo) - sy(0)); g.fillRect(cx + bw / 2, sy(0), 9, sy(inp.surfaceCasingTo) - sy(0));
  g.fillStyle = NAVY; g.font = F(14); g.textAlign = "right"; g.fillText("Surface casing", cx - colW / 2 - 14, (sy(0) + sy(inp.surfaceCasingTo)) / 2);
  // screens
  for (const s of inp.screens) {
    g.fillStyle = "#f4d35e"; g.fillRect(cx - bw / 2 + 1, sy(s.from), bw - 2, sy(s.to) - sy(s.from));
    g.strokeStyle = NAVY; g.lineWidth = 1.2;
    for (let y = sy(s.from) + 4; y < sy(s.to); y += 7) { g.beginPath(); g.moveTo(cx - bw / 2 + 1, y); g.lineTo(cx + bw / 2 - 1, y); g.stroke(); }
    g.fillStyle = NAVY; g.font = F(14); g.textAlign = "right"; g.fillText(s.label, cx - colW / 2 - 14, (sy(s.from) + sy(s.to)) / 2 + 5);
  }
  g.textAlign = "left";
  // depth lines
  const line = (d: number, colour: string, text: string) => {
    g.strokeStyle = colour; g.lineWidth = 2.5; g.setLineDash([12, 8]); g.beginPath(); g.moveTo(110, sy(d)); g.lineTo(W - 60, sy(d)); g.stroke(); g.setLineDash([]);
    g.fillStyle = colour; g.font = F(17, true); g.fillText(text, W - 480, sy(d) - 8);
  };
  line(inp.minDepth, "#c0392b", `${inp.minDepth} m minimum depth`);
  if (inp.recommendedDepth !== inp.minDepth) line(inp.recommendedDepth, "#1e7a3c", `${inp.recommendedDepth} m recommended depth`);
  return c.toBuffer("image/png");
}

export interface StationRow { station: string; from: number; to: number; yieldM3h: number | null; recommended: boolean }

function chartBase(W: number, H: number, title: string) {
  fonts();
  const c = createCanvas(W, H); const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#0B2A4A"; g.font = "bold 24px ReportSans"; g.textAlign = "center"; g.fillText(title, W / 2, 38);
  return { c, g };
}
const niceMax = (v: number) => { const s = v <= 20 ? 5 : v <= 60 ? 10 : v <= 120 ? 20 : 50; return Math.ceil(v / s) * s; };

/** Target aquifer depth range per surveyed station (depth increases downwards). */
export async function zoneChart(rows: StationRow[]): Promise<Buffer> {
  const W = 1400, H = 780, L = 110, R = 50, T = 80, B = 110;
  const { c, g } = chartBase(W, H, "Interpreted target aquifer depth by station");
  const max = niceMax(Math.max(...rows.map((r) => r.to)) * 1.1), pw = W - L - R, ph = H - T - B;
  const y = (d: number) => T + (d / max) * ph;
  g.font = "18px ReportSans"; g.textAlign = "right"; g.strokeStyle = "#d4dbe3"; g.lineWidth = 1; g.fillStyle = "#334";
  const step = max <= 60 ? 10 : max <= 150 ? 20 : 50;
  for (let d = 0; d <= max; d += step) { g.beginPath(); g.moveTo(L, y(d)); g.lineTo(W - R, y(d)); g.stroke(); g.fillText(String(d), L - 12, y(d) + 6); }
  g.save(); g.translate(30, T + ph / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillText("Depth below ground (m)", 0, 0); g.restore();
  const slot = pw / rows.length, bw = Math.min(120, slot * 0.5);
  rows.forEach((r, i) => {
    const x = L + slot * i + slot / 2;
    g.fillStyle = r.recommended ? "#0f8a5f" : "#6b8fb5"; g.fillRect(x - bw / 2, y(r.from), bw, Math.max(4, y(r.to) - y(r.from)));
    g.fillStyle = "#223"; g.textAlign = "center"; g.font = "bold 19px ReportSans"; g.fillText(`Station ${r.station}`, x, H - B + 34);
    g.font = "17px ReportSans"; g.fillText(`${r.from}–${r.to} m`, x, y(r.to) + 24);
    if (r.recommended) { g.fillStyle = "#0f8a5f"; g.fillText("Recommended", x, H - B + 58); }
  });
  g.strokeStyle = "#334"; g.lineWidth = 2; g.strokeRect(L, T, pw, ph);
  return c.toBuffer("image/png");
}

/** Expected yield per surveyed station. */
export async function yieldChart(rows: StationRow[]): Promise<Buffer> {
  const W = 1400, H = 700, L = 110, R = 50, T = 80, B = 110;
  const { c, g } = chartBase(W, H, "Expected yield by station (m³/hr, preliminary)");
  const max = niceMax(Math.max(...rows.map((r) => r.yieldM3h ?? 0)) * 1.15 || 5), pw = W - L - R, ph = H - T - B;
  const y = (v: number) => T + ph - (v / max) * ph;
  g.font = "18px ReportSans"; g.textAlign = "right"; g.strokeStyle = "#d4dbe3"; g.lineWidth = 1; g.fillStyle = "#334";
  const step = max <= 20 ? 2 : max <= 60 ? 5 : max <= 120 ? 10 : 25;
  for (let v = 0; v <= max; v += step) { g.beginPath(); g.moveTo(L, y(v)); g.lineTo(W - R, y(v)); g.stroke(); g.fillText(String(v), L - 12, y(v) + 6); }
  g.save(); g.translate(30, T + ph / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillText("Yield (m³/hr)", 0, 0); g.restore();
  const slot = pw / rows.length, bw = Math.min(120, slot * 0.5);
  rows.forEach((r, i) => {
    const x = L + slot * i + slot / 2, v = r.yieldM3h ?? 0;
    g.fillStyle = r.recommended ? "#0f8a5f" : "#6b8fb5"; g.fillRect(x - bw / 2, y(v), bw, y(0) - y(v));
    g.fillStyle = "#223"; g.textAlign = "center"; g.font = "bold 19px ReportSans"; g.fillText(`Station ${r.station}`, x, H - B + 34);
    g.font = "17px ReportSans"; g.fillText(`${v} m³/hr`, x, y(v) - 10);
    if (r.recommended) { g.fillStyle = "#0f8a5f"; g.fillText("Recommended", x, H - B + 58); }
  });
  g.strokeStyle = "#334"; g.lineWidth = 2; g.strokeRect(L, T, pw, ph);
  return c.toBuffer("image/png");
}

/** Flow chart of the investigation method (no data: the steps of the work). */
export async function flowChart(instrument: string): Promise<Buffer> {
  const W = 1400, H = 520;
  const { c, g } = chartBase(W, H, "Workflow of the hydrogeological investigation");
  const steps = ["Desk study of the area", "Site reconnaissance and GPS check", `Field survey (${instrument || "resistivity instrument"})`, "Processing and section interpretation", "Selection of the drilling point", "Drilling, pumping test and water-quality analysis"];
  const bw = 190, gap = 38, x0 = (W - (steps.length * bw + (steps.length - 1) * gap)) / 2, y0 = 190, bh = 150;
  steps.forEach((t, i) => {
    const x = x0 + i * (bw + gap);
    g.fillStyle = i === steps.length - 1 ? "#0f8a5f" : "#0B2A4A"; g.beginPath(); g.roundRect(x, y0, bw, bh, 14); g.fill();
    g.fillStyle = "#fff"; g.font = "bold 28px ReportSans"; g.textAlign = "center"; g.fillText(String(i + 1), x + bw / 2, y0 + 38);
    g.font = "17px ReportSans";
    const words = t.split(" "); let line = "", ly = y0 + 70;
    for (const w of words) { const tt = line ? `${line} ${w}` : w; if (g.measureText(tt).width > bw - 22 && line) { g.fillText(line, x + bw / 2, ly); ly += 22; line = w; } else line = tt; }
    g.fillText(line, x + bw / 2, ly);
    if (i < steps.length - 1) { g.strokeStyle = "#334"; g.lineWidth = 3; const ax = x + bw + 4; g.beginPath(); g.moveTo(ax, y0 + bh / 2); g.lineTo(ax + gap - 10, y0 + bh / 2); g.stroke(); g.fillStyle = "#334"; g.beginPath(); g.moveTo(ax + gap - 2, y0 + bh / 2); g.lineTo(ax + gap - 14, y0 + bh / 2 - 8); g.lineTo(ax + gap - 14, y0 + bh / 2 + 8); g.fill(); }
  });
  return c.toBuffer("image/png");
}

/** The client's depths against the depth scale: target zone, minimum, maximum and preferred drilling depth, surface casing. */
export async function depthPlanChart(v: { zoneFrom: number; zoneTo: number; min: number; max: number; preferred: number; casingTo: number }): Promise<Buffer> {
  const W = 1400, H = 700, L = 110, R = 60, T = 80, B = 70;
  const { c, g } = chartBase(W, H, "Proposed borehole depths (m below ground level)");
  const max = niceMax(Math.max(v.zoneTo, v.max, v.preferred, 10) * 1.1), pw = W - L - R, ph = H - T - B;
  const x = (d: number) => L + (d / max) * pw;
  g.font = "18px ReportSans"; g.textAlign = "center"; g.strokeStyle = "#d4dbe3"; g.lineWidth = 1; g.fillStyle = "#334";
  const step = max <= 60 ? 10 : max <= 150 ? 20 : max <= 300 ? 50 : 100;
  for (let d = 0; d <= max; d += step) { g.beginPath(); g.moveTo(x(d), T); g.lineTo(x(d), T + ph); g.stroke(); g.fillText(String(d), x(d), T + ph + 28); }
  const bars: [string, number, number, string][] = [["Surface casing", 0, v.casingTo, "#8a96a3"], ["Target aquifer zone", v.zoneFrom, v.zoneTo, "#2a7bd6"], ["Allowed drilling range", v.min, v.max, "#6b8fb5"], ["Preferred depth", 0, v.preferred, "#0f8a5f"]].filter((b) => (b[2] as number) > (b[1] as number) || (b[0] === "Allowed drilling range" && (b[2] as number) > 0)) as [string, number, number, string][];
  const slot = ph / Math.max(bars.length, 1), bh = Math.min(60, slot * 0.55);
  bars.forEach(([lab, a, b, col], i) => {
    const cy = T + slot * i + slot / 2;
    g.fillStyle = col; g.fillRect(x(a), cy - bh / 2, Math.max(4, x(b) - x(a)), bh);
    g.fillStyle = "#223"; g.textAlign = "left"; g.font = "bold 18px ReportSans"; g.fillText(lab, L + 8, cy - bh / 2 - 8);
    g.font = "17px ReportSans"; const tl = `${a ? a + " – " : ""}${b} m`; if (x(b) + 10 + g.measureText(tl).width > W - R) { g.textAlign = "right"; g.fillText(tl, x(a) - 10, cy + 6); g.textAlign = "left"; } else g.fillText(tl, x(b) + 10, cy + 6);
  });
  g.strokeStyle = "#334"; g.lineWidth = 2; g.strokeRect(L, T, pw, ph);
  g.fillStyle = "#334"; g.textAlign = "center"; g.font = "18px ReportSans"; g.fillText("Depth below ground level (m)", L + pw / 2, H - 14);
  return c.toBuffer("image/png");
}

/** Monthly rainfall (bars) and temperature (line) from researched figures. */
export async function climateChart(rain: (number | null)[], temp: (number | null)[]): Promise<Buffer> {
  const W = 1400, H = 700, L = 110, R = 110, T = 80, B = 90;
  const { c, g } = chartBase(W, H, "Mean monthly rainfall and temperature (researched figures)");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const rv = rain.map((v) => (v ?? 0)), pw = W - L - R, ph = H - T - B;
  const rmax = niceMax(Math.max(...rv, 10) * 1.15), tv = temp.filter((v): v is number => v !== null);
  const tmin = tv.length ? Math.floor(Math.min(...tv) - 3) : 0, tmax = tv.length ? Math.ceil(Math.max(...tv) + 3) : 40;
  const yr = (v: number) => T + ph - (v / rmax) * ph, yt = (v: number) => T + ph - ((v - tmin) / (tmax - tmin)) * ph;
  g.font = "18px ReportSans"; g.textAlign = "right"; g.strokeStyle = "#d4dbe3"; g.lineWidth = 1; g.fillStyle = "#334";
  const step = rmax <= 20 ? 5 : rmax <= 60 ? 10 : rmax <= 120 ? 20 : rmax <= 300 ? 50 : 100;
  for (let v = 0; v <= rmax; v += step) { g.beginPath(); g.moveTo(L, yr(v)); g.lineTo(W - R, yr(v)); g.stroke(); g.fillText(String(v), L - 12, yr(v) + 6); }
  g.save(); g.translate(30, T + ph / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillText("Rainfall (mm)", 0, 0); g.restore();
  const slot = pw / 12, bw = slot * 0.55;
  rv.forEach((v, i) => { if (rain[i] === null) return; g.fillStyle = "#2a7bd6"; g.fillRect(L + slot * i + (slot - bw) / 2, yr(v), bw, yr(0) - yr(v)); });
  g.textAlign = "center"; g.fillStyle = "#223"; mon.forEach((m, i) => g.fillText(m, L + slot * i + slot / 2, H - B + 30));
  if (tv.length) {
    g.strokeStyle = "#d12b2b"; g.lineWidth = 3.5; g.beginPath(); let started = false;
    temp.forEach((v, i) => { if (v === null) return; const px = L + slot * i + slot / 2; if (!started) { g.moveTo(px, yt(v)); started = true; } else g.lineTo(px, yt(v)); }); g.stroke();
    g.fillStyle = "#d12b2b"; temp.forEach((v, i) => { if (v !== null) { g.beginPath(); g.arc(L + slot * i + slot / 2, yt(v), 6, 0, 7); g.fill(); } });
    g.textAlign = "left"; g.fillStyle = "#d12b2b"; for (let t = tmin; t <= tmax; t += Math.max(2, Math.round((tmax - tmin) / 6))) g.fillText(`${t}°C`, W - R + 12, yt(t) + 6);
  }
  g.strokeStyle = "#334"; g.lineWidth = 2; g.strokeRect(L, T, pw, ph);
  g.font = "18px ReportSans"; g.textAlign = "left"; g.fillStyle = "#2a7bd6"; g.fillRect(L, H - 30, 18, 14); g.fillStyle = "#223"; g.fillText("Rainfall", L + 26, H - 17);
  if (tv.length) { g.fillStyle = "#d12b2b"; g.fillRect(L + 140, H - 30, 18, 14); g.fillStyle = "#223"; g.fillText("Temperature", L + 166, H - 17); }
  return c.toBuffer("image/png");
}

/** The contract-receipt look: the picture is a white sheet with a drop shadow, lying on a soft blurred, darkened copy of itself. */
export async function photoCard(buf: Buffer, w: number, h: number): Promise<{ buf: Buffer; w: number; h: number }> {
  const img = await loadImage(buf);
  const m = Math.round(Math.max(w, h) * 0.04), pad = Math.round(Math.max(w, h) * 0.012);
  // always a landscape (desktop-style) frame: a tall picture sits in the middle and the blurred backdrop fills the sides
  const FH = h + (m + pad) * 2, FW = Math.max(w + (m + pad) * 2, Math.round(FH * 1.7));
  const k = Math.min(1, 1800 / FW), W = Math.round(FW * k), H = Math.round(FH * k);
  const c = createCanvas(W, H); const g = c.getContext("2d");
  // blurred backdrop: shrink the picture hard, then stretch it back over the whole frame with smoothing
  const tw = Math.max(12, Math.round(W / 40)), th = Math.max(12, Math.round(H / 40));
  const s = createCanvas(tw, th); const sg = s.getContext("2d"); sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = "high";
  const cover = Math.max(tw / img.width, th / img.height);
  sg.drawImage(img, (tw - img.width * cover) / 2, (th - img.height * cover) / 2, img.width * cover, img.height * cover);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(s, 0, 0, W, H);
  g.fillStyle = "rgba(71,85,105,0.55)"; g.fillRect(0, 0, W, H);
  // white sheet with shadow, centred, then the picture
  const p = Math.round(pad * k), sw = Math.round(w * k) + p * 2, sh = Math.round(h * k) + p * 2, sx = Math.round((W - sw) / 2), sy = Math.round((H - sh) / 2);
  g.shadowColor = "rgba(15,23,42,0.45)"; g.shadowBlur = Math.round(34 * k + 8); g.shadowOffsetY = Math.round(10 * k + 3);
  g.fillStyle = "#fff"; g.fillRect(sx, sy, sw, sh); g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0;
  g.drawImage(img, sx + p, sy + p, sw - p * 2, sh - p * 2);
  return { buf: c.toBuffer("image/jpeg", 86), w: W, h: H };
}

/** A tall picture (phone screenshot) with an explanation beside it: landscape, readable, on the same blurred backdrop as the other pictures. */
export async function sideCard(buf: Buffer, w: number, h: number, heading: string, lines: string[], extra: NoteExtra = {}): Promise<{ buf: Buffer; w: number; h: number }> {
  fonts();
  const img = await loadImage(buf);
  const W = 1800, H = 1000, m = 50, pad = 22;
  const ih = H - m * 2 - pad * 2, iw = Math.min(Math.round((img.width * ih) / img.height), 760), ihh = Math.round((img.height * iw) / img.width);
  const c = createCanvas(W, H); const g = c.getContext("2d");
  const tw = Math.round(W / 40), th = Math.round(H / 40); const sm = createCanvas(tw, th); const sg = sm.getContext("2d"); sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = "high";
  const cv = Math.max(tw / img.width, th / img.height); sg.drawImage(img, (tw - img.width * cv) / 2, (th - img.height * cv) / 2, img.width * cv, img.height * cv);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(sm, 0, 0, W, H);
  g.fillStyle = "rgba(71,85,105,0.55)"; g.fillRect(0, 0, W, H);
  g.shadowColor = "rgba(15,23,42,0.45)"; g.shadowBlur = 40; g.shadowOffsetY = 12; g.fillStyle = "#fff"; g.fillRect(m, m, W - m * 2, H - m * 2);
  g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0;
  const ix = m + pad, iy = m + pad + Math.round((ih - ihh) / 2);
  g.drawImage(img, ix, iy, iw, ihh); g.strokeStyle = NAVY; g.lineWidth = 2; g.strokeRect(ix, iy, iw, ihh);
  const tx = ix + iw + 50, tw2 = W - m - pad - tx;
  g.fillStyle = NAVY; g.fillRect(tx, m + pad, tw2, 70); g.fillStyle = "#fff"; g.font = F(36, true); g.textAlign = "left"; g.fillText(heading, tx + 22, m + pad + 47, tw2 - 40);
  let y = m + pad + 70 + 46; g.fillStyle = "#1a2433"; g.font = F(31);
  if (!extra.bars?.length && !extra.key) { // no chart: centre the text block in the panel
    let th2 = 0; for (const l of lines) { g.font = F(31, l.startsWith("**")); th2 += wrap(g, l.replace(/^\*\*/, ""), tw2 - 30).length * 44 + 14; }
    y += Math.max(0, Math.round((H - m * 2 - pad * 2 - 70 - 46 - th2) / 2) - 20);
  }
  for (const l of lines) {
    const bold = l.startsWith("**"); const t = bold ? l.slice(2) : l; g.font = F(31, bold);
    for (const ln of wrap(g, t, tw2 - 30)) { if (y > H - m - pad) break; g.fillText(ln, tx + 14, y); y += 44; }
    y += 14;
  }
  // fill what is left of the panel: depth bars from the client's figures, else the colour key, else centre the text
  const bottomY = H - m - pad, room = bottomY - y;
  if (extra.bars?.length && room > 230) drawDepthBars(g, tx, y + 4, tw2, Math.min(room - 4, 90 + extra.bars.length * 80), extra.bars, "DEPTH PLAN (client's figures, m below ground)");
  else if (extra.key && room > 230) drawColourKey(g, tx, y + 4, tw2, Math.min(room - 4, 250));
  return { buf: c.toBuffer("image/jpeg", 86), w: W, h: H };
}

export interface DepthBar { label: string; from: number; to: number; color: string }
export interface NoteExtra { bars?: DepthBar[]; key?: boolean }

/** Horizontal depth bars (client's figures) drawn into a box. */
function drawDepthBars(g: SKRSContext2D, x: number, y: number, w: number, h: number, bars: DepthBar[], title: string, unit = "m") {
  g.fillStyle = NAVY; g.fillRect(x, y, w, 50); g.fillStyle = "#fff"; g.font = F(27, true); g.textAlign = "center"; g.fillText(title, x + w / 2, y + 35); g.textAlign = "left";
  const top = y + 62, bottom = y + h - 44, L = x + 250, R = x + w - 40, max = niceMax(Math.max(...bars.map((b) => b.to), 10) * 1.05);
  const dx = (d: number) => L + (d / max) * (R - L);
  g.strokeStyle = "#cbd5e1"; g.lineWidth = 1; g.font = F(22); g.fillStyle = "#475569"; g.textAlign = "center";
  const step = max <= 20 ? 2 : max <= 60 ? 10 : max <= 150 ? 20 : max <= 300 ? 50 : 100;
  for (let d = 0; d <= max; d += step) { g.beginPath(); g.moveTo(dx(d), top); g.lineTo(dx(d), bottom); g.stroke(); g.fillText(String(d), dx(d), bottom + 28); }
  g.textAlign = "left";
  const slot = (bottom - top) / bars.length, bh = Math.min(46, slot * 0.6);
  bars.forEach((b, i) => {
    const cy = top + slot * i + slot / 2;
    g.fillStyle = "#1a2433"; g.font = F(24, true); g.fillText(b.label, x + 12, cy + 8, 232);
    g.fillStyle = b.color; g.fillRect(dx(b.from), cy - bh / 2, Math.max(5, dx(b.to) - dx(b.from)), bh);
    g.fillStyle = "#1a2433"; g.font = F(22); const t = `${b.from ? b.from + " – " : ""}${b.to} ${unit}`; const tw = g.measureText(t).width;
    if (dx(b.to) + 10 + tw > R + 30) { g.textAlign = "right"; g.fillText(t, dx(b.from) - 8, cy + 8); g.textAlign = "left"; } else g.fillText(t, dx(b.to) + 10, cy + 8);
  });
  g.strokeStyle = "#334"; g.lineWidth = 2; g.strokeRect(x, y, w, h);
}
/** Colour key for resistivity pictures: explains what the colours mean (no data). */
function drawColourKey(g: SKRSContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = NAVY; g.fillRect(x, y, w, 50); g.fillStyle = "#fff"; g.font = F(27, true); g.textAlign = "center"; g.fillText("HOW THE COLOURS READ", x + w / 2, y + 35); g.textAlign = "left";
  const gx = x + 30, gw = w - 60, gy = y + 90, gh = Math.min(70, h - 190);
  const grad = g.createLinearGradient(gx, 0, gx + gw, 0);
  [["#7a0a4a", 0], ["#2a1fc0", 0.18], ["#1f6bff", 0.36], ["#18c8c0", 0.5], ["#7de02a", 0.65], ["#ffe11a", 0.82], ["#ff6a00", 0.92], ["#e01010", 1]].forEach(([c, t]) => grad.addColorStop(t as number, c as string));
  g.fillStyle = grad; g.fillRect(gx, gy, gw, gh); g.strokeStyle = "#334"; g.lineWidth = 2; g.strokeRect(gx, gy, gw, gh);
  g.fillStyle = "#1a2433"; g.font = F(24, true); g.textAlign = "left"; g.fillText("LOW resistivity", gx, gy + gh + 36); g.textAlign = "right"; g.fillText("HIGH resistivity", gx + gw, gy + gh + 36);
  g.font = F(22); g.fillStyle = "#334"; g.textAlign = "left"; g.fillText("fractured, weathered, wet", gx, gy + gh + 68); g.textAlign = "right"; g.fillText("hard, compact, dry", gx + gw, gy + gh + 68); g.textAlign = "left";
  g.strokeStyle = "#334"; g.lineWidth = 2; g.strokeRect(x, y, w, h);
}
export const depthBarsFor = (v: { zoneFrom?: number; zoneTo?: number; min?: number; max?: number; preferred?: number; casingTo?: number }): DepthBar[] => [
  ...(v.casingTo ? [{ label: "Surface casing", from: 0, to: v.casingTo, color: "#8a96a3" }] : []),
  ...(v.zoneFrom !== undefined && v.zoneTo && v.zoneTo > v.zoneFrom ? [{ label: "Target zone", from: v.zoneFrom, to: v.zoneTo, color: "#2a7bd6" }] : []),
  ...(v.min && v.max ? [{ label: "Drilling range", from: v.min, to: v.max, color: "#6b8fb5" }] : []),
  ...(v.preferred ? [{ label: "Preferred depth", from: 0, to: v.preferred, color: "#0f8a5f" }] : []),
];
