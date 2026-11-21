import { createCanvas, loadImage } from "@napi-rs/canvas";
import { claude, parseJson, type Source } from "./claude";
import type { SectionCalibration } from "./hydroFigures";

/** Shrink a screenshot so the AI and the drawing code share one pixel frame. Returns a PNG. */
export async function normaliseShot(buf: Buffer, max = 1400): Promise<{ png: Buffer; w: number; h: number }> {
  const img = await loadImage(buf);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  const c = createCanvas(w, h); c.getContext("2d").drawImage(img, 0, 0, w, h);
  return { png: c.toBuffer("image/png"), w, h };
}

export interface SectionReading {
  cal: SectionCalibration;
  zones: { from: number; to: number; note: string; strength: "strong" | "moderate" | "weak" }[];
  lowColour: string;
  scaleNote: string;
  stationsSeen: string[];
  confidence: "high" | "medium" | "low";
}

/** The AI looks at the machine screenshot and finds where the axes are and where the chosen station shows low resistivity (likely water). The person confirms or corrects every number. */
export async function readSection(png: Buffer, w: number, h: number, a: { instrument: string; station: string }): Promise<SectionReading> {
  const sys = `You read resistivity section screenshots from groundwater survey instruments (ADMT, PQWT). Be exact about pixel positions and honest about uncertainty. Reply with one JSON object only.`;
  const prompt = `Screenshot size: ${w} x ${h} pixels (x to the right, y downward, origin top-left). Instrument: ${a.instrument}. The person recommends station/point "${a.station}" (a number on the horizontal axis).
Find, in THIS image's pixel coordinates:
- plot: the coloured plot rectangle {x0,x1,y0,y1}
- depthRef: two labelled depth ticks on the vertical axis: {y1,d1,y2,d2} (d values as printed, e.g. -20 and -600, keep the sign)
- stationX: pixel x of the horizontal-axis tick labelled "${a.station}" (the vertical line that drops from that label)
- zones: along that station's vertical line, the depth intervals (positive metres below ground) that look like water-bearing: low-resistivity colours (blue/purple on the cool end of the colour scale), preferably continuous and thick. Max 3, best first. strength = strong/moderate/weak. note = one short factual line (e.g. "continuous low-resistivity band, about 40-80 ohm.m").
- lowColour: name of the colours that mean low resistivity on this scale
- scaleNote: the colour-scale range and units you can read (e.g. "40 to 240, blue = low")
- stationsSeen: the station labels you can read on the horizontal axis
- confidence: high/medium/low
Do not invent numbers you cannot read; use null for anything unreadable. JSON shape:
{"plot":{"x0":0,"x1":0,"y0":0,"y1":0},"depthRef":{"y1":0,"d1":0,"y2":0,"d2":0},"stationX":0,"zones":[{"from":0,"to":0,"note":"","strength":"strong"}],"lowColour":"","scaleNote":"","stationsSeen":[],"confidence":"medium"}`;
  const out = await claude({
    system: sys, maxTokens: 1500,
    messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } }, { type: "text", text: prompt }] }],
  });
  const j = parseJson<{ plot: SectionCalibration["plot"]; depthRef: { y1: number; d1: number; y2: number; d2: number }; stationX: number; zones: SectionReading["zones"]; lowColour: string; scaleNote: string; stationsSeen: string[]; confidence: SectionReading["confidence"] }>(out.text);
  return {
    cal: { y1: j.depthRef.y1, d1: j.depthRef.d1, y2: j.depthRef.y2, d2: j.depthRef.d2, stationX: j.stationX, plot: j.plot },
    zones: (j.zones ?? []).map((z) => ({ from: Math.abs(Number(z.from)), to: Math.abs(Number(z.to)), note: String(z.note ?? ""), strength: z.strength })).filter((z) => z.from < z.to),
    lowColour: j.lowColour ?? "", scaleNote: j.scaleNote ?? "", stationsSeen: j.stationsSeen ?? [], confidence: j.confidence ?? "low",
  };
}

export interface Facts { climateMonthly?: { rainfallMm?: (number | null)[]; tempC?: (number | null)[] } | null; geography: string; physiography: string; climate: string; geology: string; hydrogeology: string; waterSupply: string; sources: Source[] }

/** Real, searched facts about the area, with the pages actually opened. Nothing here comes from the model's memory alone. */
export async function researchArea(loc: { village: string; location: string; subcounty: string; county: string }): Promise<Facts> {
  const place = [loc.village, loc.location, loc.subcounty, loc.county].filter(Boolean).join(", ");
  const out = await claude({
    search: 8, maxTokens: 4000,
    system: `You are a hydrogeology researcher in Kenya. Use web search to find credible facts (Geological Survey / Mines and Geology Dept reports, Water Resources Authority, county integrated development plans, Kenya Meteorological Department, FAO, journal papers). Report only what the sources state. If a fact is not found, write "not found in the sources" rather than guessing. Reply with one JSON object only.`,
    messages: [{ role: "user", content: `Area: ${place}, Kenya. Research and summarise, each as 3-6 factual sentences with figures where sources give them: geography (location, access, settlements, land use), physiography (relief, altitude, drainage, rivers), climate (rainfall seasons and totals, temperature, agro-climatic zone), geology (regional and local rock units, structures, soils), hydrogeology (aquifer types, typical borehole depths, yields, water quality issues such as fluoride or salinity), waterSupply (main water sources and demand for the area).
Also give climateMonthly: the 12 monthly mean rainfall values (mm) and mean temperatures (°C), January to December, ONLY if a source you opened states them for this area or the nearest station; otherwise null. Never estimate them.
JSON: {"geography":"","physiography":"","climate":"","geology":"","hydrogeology":"","waterSupply":"","climateMonthly":{"rainfallMm":[12 numbers or nulls],"tempC":[12 numbers or nulls]} or null}` }],
  });
  const j = parseJson<Omit<Facts, "sources">>(out.text);
  return { ...j, sources: out.sources.slice(0, 25) };
}

/** Read GPS coordinates from a screenshot (a maps or GPS app). Returns null when none are visible. */
export async function readCoordinates(png: Buffer): Promise<{ lat: number; lng: number; elevation: number | null } | null> {
  const out = await claude({
    system: "You read GPS coordinates from screenshots of phone maps and GPS apps. Reply with one JSON object only. Never guess: if no coordinates are clearly visible, return nulls.",
    maxTokens: 300,
    messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } }, { type: "text", text: 'Find the location coordinates shown (decimal degrees, or degrees-minutes-seconds converted to decimal). South and West are negative. Kenya lies between latitude -5 and 5 and longitude 33 and 42. If an elevation or altitude in metres is also shown, return it as well. JSON: {"lat": number|null, "lng": number|null, "elevation": number|null}' }] }],
  });
  const j = parseJson<{ lat: number | null; lng: number | null; elevation?: number | null }>(out.text);
  const lat = Number(j.lat), lng = Number(j.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && j.lat !== null && j.lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng, elevation: j.elevation != null && Number.isFinite(Number(j.elevation)) && Math.abs(Number(j.elevation)) < 6000 ? Math.round(Number(j.elevation)) : null } : null;
}
