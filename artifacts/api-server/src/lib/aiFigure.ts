/** Conceptual figures drawn by the OpenAI image model (needs OPENAI_API_KEY). Returns null when no key is set or the call fails, and the report simply goes without that figure. */
export async function aiFigure(prompt: string, size: "1536x1024" | "1024x1024" = "1536x1024"): Promise<{ png: Buffer; w: number; h: number } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1", prompt, size, quality: "medium", n: 1 }),
      signal: AbortSignal.timeout(150_000),
    });
    if (!r.ok) return null;
    const b64 = ((await r.json()) as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json;
    if (!b64) return null;
    const [w, h] = size.split("x").map(Number) as [number, number];
    return { png: Buffer.from(b64, "base64"), w, h };
  } catch { return null; }
}

const STYLE = "Clean, professional technical illustration for a hydrogeological consulting report: flat vector style, muted natural colours, white background, thin dark outlines, a small legend, labels in plain capital letters with minimal text and NO numbers, no logos, no watermark, not to scale.";
export const conceptualGeology = (layers: string, county: string) => `Conceptual geological cross-section of a groundwater borehole site in ${county || "Kenya"}. Show, from the surface down: topsoil and weathered overburden, a weathered and fractured bedrock zone holding groundwater (highlight this aquifer zone in blue), then fresh basement rock. Show a vertical borehole with casing and screen opposite the aquifer zone, the water table, and arrows for rainfall recharge and groundwater flow. ${layers ? `Layers supplied: ${layers}.` : ""} ${STYLE}`;
export const conceptualHydro = (county: string) => `Conceptual hydrogeological model for ${county || "a semi-arid Kenyan"} setting: rainfall, surface runoff, infiltration through soil, recharge to a fractured and weathered aquifer, groundwater flow towards a seasonal river valley, a proposed borehole intersecting the aquifer, and natural discharge. ${STYLE}`;

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
/** The reference analysed picture (layout and style only; its numbers, dates and text must never be copied). */
const sample = (): Buffer | null => {
  for (const d of [path.resolve(here, "../assets/reference"), path.resolve(here, "../../assets/reference"), path.resolve(process.cwd(), "assets/reference")]) {
    try { return fs.readFileSync(path.join(d, "analysed_sample.png")); } catch { /* next */ }
  }
  return null;
};

export interface SectionFacts { station: string; zoneFrom: number; zoneTo: number; yieldText: string; instrument: string; surveyDate: string; layers: string; reason: string; minDepth?: number; maxDepth?: number; preferredDepth?: number }

/** Analysed picture of the machine screenshot, in the layout of the reference sample, drawn by the OpenAI image model. */
export async function analysedSection(raw: Buffer, v: SectionFacts): Promise<{ png: Buffer; w: number; h: number } | null> {
  const key = process.env.OPENAI_API_KEY, ref = sample();
  if (!key || !ref || process.env.ANALYSED_AI === "off") return null;
  const prompt = `Image 1 is the REAL field section measured by a ${v.instrument || "groundwater resistivity"} instrument. Image 2 is ONLY a layout and style reference of a finished analysed picture: copy its layout, panels and styling, but NEVER copy its numbers, dates, station, depths, formation names or any of its text.
Produce a new analysed picture of Image 1. Keep the contour pattern, the station positions along the top and the depth scale of Image 1 exactly as they are; do not redraw or invent different geology.
Layout like Image 2: a blue title bar reading "INTERPRETED GEOELECTRIC SECTION (Groundwater Exploration)" with the survey date; station numbers along the top with the selected station boxed and a red vertical line down it; the depth axis; the resistivity colour scale at the right; two dashed red horizontal lines bounding the target aquifer zone with their depths written; bracket labels on the right for Overburden / Top Soil, Target Aquifer Zone and Deeper Zone; red dashed callout boxes (Horizontal positions, How to read, Where to drill, Drilling recommendation); a legend box (high resistivity, moderate, low); an INTERPRETATION SUMMARY table; and a NOTES box.
Use exactly these values and no others (the client's own typed numbers; never replace them with depths you read from the picture): ${v.preferredDepth ? `drilling depth preferred ${v.preferredDepth} m, minimum ${v.minDepth ?? ""} m, maximum ${v.maxDepth ?? ""} m (draw these as green horizontal lines); ` : ""}selected station ${v.station}; target aquifer zone ${v.zoneFrom} to ${v.zoneTo} m; expected yield ${v.yieldText || "to be confirmed"}; method ${v.instrument || "groundwater resistivity survey"}; survey date ${v.surveyDate || "not recorded"}; reason for the choice: ${v.reason || "lowest resistivity zone along the line"}. ${v.layers ? `Layers supplied: ${v.layers}.` : "For aquifer type and formation write 'To be confirmed by drilling'."} Add the note that drilling is required for confirmation and that the yield is a target, not a guarantee. Text must be small, sharp and spelled correctly.`;
  try {
    const fd = new FormData();
    fd.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-1");
    fd.append("prompt", prompt); fd.append("size", "1536x1024"); fd.append("quality", "medium");
    fd.append("image[]", new Blob([new Uint8Array(raw)], { type: "image/png" }), "field-section.png");
    fd.append("image[]", new Blob([new Uint8Array(ref)], { type: "image/png" }), "layout-reference.png");
    const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(240_000) });
    if (!r.ok) return null;
    const b64 = ((await r.json()) as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json;
    return b64 ? { png: Buffer.from(b64, "base64"), w: 1536, h: 1024 } : null;
  } catch { return null; }
}
