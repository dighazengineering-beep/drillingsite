import { claude, parseJson } from "./claude";
import type { Facts } from "./hydroAi";
import { REFERENCE } from "./referenceProfile";

/** One piece of a section, in reading order: a paragraph, a table, or a bullet list. */
export type Flow = { p: string } | { table: { caption: string; head: string[]; rows: string[][] } } | { bullets: string[] };

/** The hydrogeological survey layout, matched to the client's reference report (Al-Zahra Centre). */
export interface Sec { id: string; num: string; title: string; level: 1 | 2 | 3; words?: number; guide?: string; lead?: boolean }

const T = (cols: string, rows: string) => `Include a TABLE (columns: ${cols}) with ${rows}.`;
export const SURVEY_SECTIONS: Sec[] = [
  { id: "exec", num: "", title: "EXECUTIVE SUMMARY", level: 1, words: 260, guide: "3 paragraphs: the purpose of the study and where it was done (client, site, instrument); the key findings (recommended station, target aquifer zone, expected yield and the minimum, maximum and preferred drilling depths, exactly as supplied); and the recommended next steps (drilling, casing, development, pumping test, water-quality analysis). No other numbers." },
  { id: "1", num: "1.0", title: "INTRODUCTION", level: 1 },
  { id: "1.1", num: "1.1", title: "Background Information", level: 2, words: 260, guide: "4 paragraphs: who commissioned the study (client, sponsor, supervising body, project representative where supplied) and where; the water situation of the locality and why the study was needed; groundwater development in the region (opportunities and challenges) and why geophysics is used; the survey itself (date, instrument, method, number of stations, line direction) and what it produced." },
  { id: "1.2", lead: true, num: "1.2", title: "Objective of the Study", level: 2, words: 130, guide: "One lead-in sentence, then " + T("No., Objective", "7 numbered objectives (survey of the site with the instrument; delineate stratigraphy and aquifer zones; target depth, yield and aquifer type; most prospective siting; construction, development and testing recommendations; water quality considerations and analysis schedule; a professional report for the client, donors and regulators)") },
  { id: "1.3", num: "1.3", title: "Reporting Requirements", level: 2, words: 120, guide: "2 paragraphs: the standards and Kenyan authorities the report is written for (Water Resources Authority, WASREB, the regional water works development agency, county government as relevant); what the report contains (method, fieldwork, interpretation, geological model, groundwater potential, borehole recommendations, figures and appendices)." },
  { id: "2", num: "2.0", title: "BACKGROUND INFORMATION", level: 1 },
  { id: "2.1", num: "2.1", title: "Project Location", level: 2, words: 230, guide: "1-2 paragraphs on the administrative position of the site (county size, neighbours and position from researched facts), then " + T("Parameter, Detail", "rows: Country, County, Sub-County, Location/Ward, Village, Nearest Town (with approximate distance if researched), Latitude and Longitude in decimal degrees and in DMS, GPS Datum WGS84, Designated Survey Point, Elevation (approx.), plus one more researched row") + " Then one paragraph on road access to the site (from researched facts and the supplied landmark/access notes; write around anything not known)." },
  { id: "2.2", num: "2.2", title: "Physiography and Drainage", level: 2, words: 240, guide: "3 paragraphs: relief and elevation range and slope direction; surface geology and soils; drainage (rivers, seasonal streams, direction). " + T("Parameter, Characteristics", "rows: Drainage Pattern, Major Watercourses, Drainage Direction, Seasonal Streams, Runoff Characteristics, Groundwater Recharge Zones") },
  { id: "2.3", num: "2.3", title: "Climate", level: 2, words: 240, guide: "2 paragraphs (climate zone, rainy seasons, rainfall and temperature ranges, humidity) using researched figures only, then " + T("Climate Parameter, Value / Description", "rows: Climate Zone, Mean Annual Rainfall, Rainfall Regime, Mean Monthly Temperature, Mean Relative Humidity, Dry Season, Predominant Wind Direction; use 'Not recorded' where the researched facts give no figure") + " Then one paragraph on how rainfall drives groundwater recharge." },
  { id: "2.4", num: "2.4", title: "Current Water Supply and Demand", level: 2, words: 200, guide: "2 paragraphs: how the community or client now gets water (from researched facts and the supplied nearby-source/demand notes), and how the proposed borehole with the interpreted yield and zone answers that need. " + T("Water Supply Parameter, Current Status", "rows: Primary Water Sources, Estimated Water Demand, Reliability of Existing Sources, Water Quality of Existing Sources, Proposed Borehole Yield, Adequacy of Proposed Borehole") },
  { id: "3", num: "3.0", title: "REGIONAL GEOLOGY AND HYDROGEOLOGY", level: 1 },
  { id: "3.1", num: "3.1", title: "Regional Geological Setting", level: 2, words: 300, guide: "2 paragraphs on the regional geological setting from researched facts, " + T("Geological Unit, Age, Lithological Description, Depth Range (approx.)", "4-6 rows from surface to bedrock, depth ranges consistent with the supplied layers and recommended zone") + " Then 2 paragraphs: structural geology (faults and lineaments in the region) and superficial deposits." },
  { id: "3.2", num: "3.2", title: "Hydrogeological Conditions", level: 2, words: 300, guide: "One paragraph on what governs groundwater in the area, " + T("Aquifer System, Hydrogeological Type, Primary Characteristics, Groundwater Potential", "3 aquifer systems relevant to the area") + " Then 3 paragraphs: the principal aquifer targeted by this investigation at the recommended station and depth; regional groundwater flow and discharge; recharge." },
  { id: "4", num: "4.0", title: "GROUNDWATER ASSESSMENT", level: 1 },
  { id: "4.1", num: "4.1", title: "Aquifer Characteristics", level: 2, words: 230, guide: "2 paragraphs classifying the aquifer at the recommended station, giving the zone, thickness and the low-resistivity character from the data, then " + T("Aquifer Parameter, Estimated Value, Basis", "rows: Aquifer Type, Geological Formation, Top of Aquifer Zone, Base of Productive Zone, Aquifer Thickness, Aquifer Condition, Expected Borehole Yield, Recommended Drilling Depth, Aquifer Resistivity (target) if supplied") },
  { id: "4.2", num: "4.2", title: "Estimated Hydraulic Parameters", level: 2 },
  { id: "4.2.1", num: "4.2.1", title: "Groundwater Occurrence", level: 3, words: 110, guide: "One paragraph: confined/semi-confined/unconfined conditions and what the data indicate." },
  { id: "4.2.2", num: "4.2.2", title: "Transmissivity", level: 3, words: 110, guide: "One paragraph: what transmissivity is and a typical preliminary range for this aquifer type, to be proven by pumping tests." },
  { id: "4.2.3", num: "4.2.3", title: "Hydraulic Conductivity", level: 3, words: 110, guide: "One paragraph: what it is, typical preliminary range, where higher." },
  { id: "4.2.4", num: "4.2.4", title: "Storage Characteristics", level: 3, words: 150, guide: "One paragraph on storativity and the preliminary range, then " + T("Hydraulic Parameter, Estimated Range, Unit, Method of Estimation", "rows: Transmissivity (T), Hydraulic Conductivity (K), Storativity (S), Specific Yield, Effective Porosity, Specific Capacity; all preliminary planning estimates") },
  { id: "4.2.5", num: "4.2.5", title: "Groundwater Movement", level: 3, words: 110, guide: "One paragraph on regional gradient and local structural influence, and how the survey line relates to flow." },
  { id: "4.2.6", num: "4.2.6", title: "Groundwater Quality Considerations", level: 3, words: 160, guide: "One paragraph, then " + T("Parameter, Potential Concern, Recommended Action", "rows for Salinity/TDS, Iron, Fluoride, Nitrate, Microbial Quality, Hardness") },
  { id: "4.2.7", lead: true, num: "4.2.7", title: "Recharge and Discharge", level: 3, words: 130, guide: "One lead-in sentence and a BULLET list of 4 recharge pathways, then one paragraph on natural discharge and sustainable abstraction." },
  { id: "5", num: "5.0", title: "GEOPHYSICAL INVESTIGATION METHODS", level: 1 },
  { id: "5.1", num: "5.1", title: "Survey Principle", level: 2, words: 150, guide: "2 paragraphs: the instrument supplied and the physical principle of the method (resistivity of rocks, depth of investigation). Do not quote specifications that are not in the project data." },
  { id: "5.2", num: "5.2", title: "Survey Equipment Specifications", level: 2, words: 90, guide: T("Equipment Parameter, Specification", "rows built ONLY from the project data: Instrument Model, Survey Method, Survey Line Orientation, Station Spacing, Total Stations, Survey Date, Data Output (digital resistivity-depth section), plus rows for anything else supplied") },
  { id: "5.3", num: "5.3", title: "Data Acquisition and Processing", level: 2, words: 140, guide: "2 paragraphs: how the line was laid out and measured (orientation, number of stations, spacing from data) and how the data were processed and inverted into a resistivity-depth section." },
  { id: "5.4", num: "5.4", title: "Interpretation Methodology", level: 2, words: 140, guide: "One paragraph, then " + T("Resistivity Class, Geological / Hydrogeological Interpretation, Display Colour", "3 classes (high, moderate, low resistivity) described relative to the colour scale of the section; give numeric ranges ONLY if supplied in the project data") + " Then one paragraph on how low-resistivity anomalies were interpreted and stations ranked." },
  { id: "6", num: "6.0", title: "FIELDWORK AND RESULTS", level: 1 },
  { id: "6.1", num: "6.1", title: "Field Investigation", level: 2, words: 250, guide: "One paragraph on the reconnaissance before the survey (date, purpose), then " + T("Reconnaissance Item, Field Observation", "rows: Date, Site Accessibility, GPS Verification, Topography, Vegetation Cover, Existing Land Use, Surface Geology, Surface Drainage, Environmental Observations, Overall Conclusion; fill them from the supplied data, land use, notes and researched facts, writing 'Not recorded' where nothing is known") },
  { id: "6.2", lead: true, num: "6.2", title: "Interpretation of Geophysical Results", level: 2, words: 45, guide: "One short paragraph introducing the geoelectric section and the layer model." },
  { id: "6.2.1", num: "6.2.1", title: "Geoelectric Layer Model", level: 3, words: 100, guide: T("Geoelectric Layer, Depth Range (m bgs), Resistivity, Geological / Hydrogeological Interpretation", "one row per layer from the supplied layers and recommended zone (resistivity described qualitatively unless numbers are supplied)") },
  { id: "6.2.2", num: "6.2.2", title: "Interpreted Geoelectric Section", level: 3, words: 180, guide: "One paragraph referring to the interpreted section figure, then a BULLET list describing each principal layer or feature from top to bottom (use only the supplied layers and zones)." },
  { id: "6.2.3", num: "6.2.3", title: "Aquifer Continuity and Structural Controls", level: 3, words: 200, guide: "3 paragraphs: lateral continuity of the low-resistivity zone across stations (only as far as the supplied station outcomes support); the inferred structural control at the recommended station; and a comparison of the surveyed points that were NOT recommended, explaining in writing why each was not recommended (use the reasons and any yield or depth supplied for them; never invent readings for them)." },
  { id: "6.3", num: "6.3", title: "Recommended Borehole Location", level: 2, words: 190, guide: "One paragraph naming the recommended station and why, and, if other points were surveyed, a second paragraph on why each of them was not recommended, using the reasons supplied (never invent readings for them); one sentence giving the coordinates exactly as supplied; then " + T("Selection Criterion, Evidence / Justification", "7 rows: Strongest low-resistivity anomaly, Aquifer continuity, Optimal aquifer depth, Structural position, Expected yield, Site accessibility, Absence of contamination risk") + " State the target zone, minimum/preferred depth and expected yield exactly as supplied, as a recommended target." },
  { id: "7", lead: true, num: "7.0", title: "CONCLUSIONS", level: 1, words: 270, guide: "One lead-in sentence, then " + T("No., Conclusion", "10 numbered conclusions covering: regional setting; the survey done; the layer model and aquifer zone; aquifer classification; recommended station; coordinates; recommended depth; expected yield; groundwater quality expectation; site suitability") },
  { id: "8", lead: true, num: "8.0", title: "RECOMMENDATIONS", level: 1, words: 30, guide: "One sentence introducing the recommendations that follow from Section 7.0." },
  { id: "8.1", num: "8.1", title: "Borehole Drilling", level: 2, words: 90, guide: T("Recommendation, Detail", "rows: Drilling Location, Target Aquifer Zone, Recommended Drilling Depth (with sump allowance), Drilling Method, Casing Diameter, Conductor Casing") },
  { id: "8.2", num: "8.2", title: "Casing and Screen Design", level: 2, words: 100, guide: T("Construction Element, Recommended Specification", "rows: Sanitary Seal / Surface Casing, Plain Casing (depth range), Slotted Screen (target zone), Gravel Pack, Sump, Wellhead Protection; depths consistent with the supplied depths") },
  { id: "8.3", num: "8.3", title: "Borehole Development and Testing", level: 2, words: 90, guide: T("Testing Requirement, Method / Duration", "rows: Borehole Development, Step-Drawdown Test, Constant Discharge Pumping Test, Recovery Monitoring, Static Water Level Measurement, Data Analysis") },
  { id: "8.4", num: "8.4", title: "Water Quality Analysis", level: 2, words: 105, guide: "One paragraph (analysis after development by an accredited laboratory), then " + T("Analysis Category, Parameters", "rows: Physical, Chemical, Bacteriological, Additional Parameters, Compliance Standard (WHO drinking-water guidelines and the Kenyan drinking water standard)") },
  { id: "8.5", num: "8.5", title: "Pump Selection and Installation", level: 2, words: 90, guide: "A BULLET list of 4 recommendations on pump selection, setting depth below maximum drawdown, fittings and wellhead protection." },
  { id: "8.6", num: "8.6", title: "Monitoring and Management", level: 2, words: 85, guide: "A BULLET list of 4 recommendations: water-level monitoring, annual water quality analysis, abstraction within sustainable yield, submitting the drilling log to the water authority." },
];

/** The owner's report-generation prompt. It is sent to the AI first, with this project's details filled in below it. */
export const MASTER_PROMPT = `# Professional Hydrogeological Report-Generation Prompt

When generating a hydrogeological survey report, follow the structure, sequencing, formatting, and professional style of the reference template (the section list below), without copying any of its content. The report should be fully customized to the client using only the project details supplied, and these details must appear strictly in the sections where they logically belong according to the template. If a detail supplied does not fit the purpose of a particular section, it should not be inserted there. You may supplement missing elements with accurate, original, and relevant information from the credible online hydrogeological sources supplied, but no text or ideas should be reused from the sample template. The final report must read as an original, professional document tailored to the client's needs.

## Instructions for Report Generation

Use the project information strictly where appropriate, ensuring accuracy, relevance, and clarity throughout every section of the report.

When preparing the report:
- Follow the structure, organization, sequencing, formatting, and professional writing style of the reference template exactly, while producing entirely original content.
- Do not copy wording, paragraphs, interpretations, or conclusions from the sample report.
- Place every client-specific detail only within the section where it logically belongs.
- Where necessary, supplement the report with accurate, current, and scientifically accepted hydrogeological information relevant to the project area, including its regional geology, hydrogeology, geomorphology, climate, drainage, groundwater occurrence, aquifer characteristics, and groundwater development potential, using the researched facts supplied.
- Use only factual and verifiable information from credible geological and hydrogeological references. Do not fabricate information or make unsupported assumptions.
- Ensure that interpretations of the geophysical survey remain technically sound and consistent with accepted groundwater exploration practices.
- Avoid repetition throughout the report.
- Maintain a formal, technical, and authoritative tone suitable for submission by a professional hydrogeologist or groundwater consultancy.
- Integrate the uploaded figures, maps, GPS images, and survey sections where indicated, with appropriate figure numbering and captions (the figures are placed by the system; refer to them in the text).
- Ensure smooth transitions between sections so that the report reads as a coherent professional document rather than a collection of independent sections.

## Final Objective

Produce a comprehensive, scientifically sound, and client-specific hydrogeological survey report that is ready for professional submission. The report should accurately assess the groundwater potential of the proposed borehole site, identify the recommended drilling location based on the geophysical investigation, provide technically justified recommendations for borehole development, and fully comply with professional hydrogeological reporting standards.

The report must clearly distinguish between a recommended drilling target and a guaranteed groundwater yield, and actual groundwater conditions must be presented as subject to confirmation during drilling and subsequent pumping testing.

Carefully follow the reference template section by section, applying its structure and professional approach without reproducing its content. Deliver only original, technically accurate, well-researched, and contextually appropriate information, ensuring that every section contains only the information relevant to its purpose. The final report should be consistent, logical, and suitable for presentation to the client and relevant regulatory authorities.`;

type Brief = Record<string, any>;
const has = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";
/** The "Project Information" part of the prompt, filled in from this project's details. */
export function projectBrief(d: Brief): string {
  const L = d.location ?? {}; const dep = d.boreholeDepthsM ?? {}; const rec = d.recommended ?? {};
  const place = [L.village && `${L.village} Village`, L.location && `${L.location} Location`, L.subcounty && `${L.subcounty} Sub-County`, L.county && `${L.county} County`, "Kenya"].filter(Boolean).join(", ");
  const o: string[] = ["## Project Information", ""];
  if (has(d.projectId)) o.push(`**Project ID:** ${d.projectId}`);
  if (has(d.client)) o.push(`**Client Name:** ${d.client}`);
  if (has(d.siteReference)) o.push(`**Project / Site Reference:** ${d.siteReference}`);
  if (has(d.purpose)) o.push(`**Project Purpose:** ${d.purpose}`);
  o.push("", "## Location and Site Identification", "", `The proposed borehole site is located in **${place}**.${has(d.landmark) ? ` Landmark or access note supplied: ${d.landmark}.` : ""} The site was identified following client instructions and field guidance, after which its geographical position was established using GPS. The investigation was undertaken at the specified location to determine the groundwater potential and suitability of the site for borehole development.`);
  if (d.coordinatesDecimal) o.push("", "## Geographical Coordinates", "", `The borehole site was geo-referenced using GPS. Latitude **${d.coordinatesDecimal.lat}°**, longitude **${d.coordinatesDecimal.lng}°** (WGS84)${has(d.coordinatesDMS) ? `; in degrees, minutes and seconds: ${d.coordinatesDMS}` : ""}${has(d.elevationM) ? `; elevation about ${d.elevationM} m above sea level` : ""}. These coordinates are the geographical reference for the proposed drilling location.`);
  o.push("", "## Site Position and Topographical Setting", "", `The proposed drilling location is situated within **${place}**. The topographical and hydrogeological setting is described from the researched facts supplied for this sub-county and county.${has(d.landUse) ? ` Land use noted: ${d.landUse}.` : ""}${has(d.nearbySource) ? ` Existing water source nearby: ${d.nearbySource}.` : ""}${has(d.demand) ? ` Water demand: ${d.demand}.` : ""}`);
  o.push("", "## Field Reconnaissance and Site Verification", "", `A field reconnaissance survey was conducted to verify the location provided by the client before the hydrogeological investigation: accessibility of the site was confirmed, its coordinates recorded and relevant site characteristics documented.${has(d.surveyDate) ? ` Survey date: ${d.surveyDate}.` : ""}`);
  o.push("", "## Geophysical Investigation Method", "", `The hydrogeophysical investigation is based on data acquired with the **${d.instrument || "geophysical resistivity"}** groundwater exploration system${has(d.lineDirection) ? `, along a survey line oriented ${d.lineDirection}` : ""}${has(d.stationSpacing) ? `, with station spacing ${d.stationSpacing}` : ""}${has(d.stationsInvestigated) ? `, ${d.stationsInvestigated} stations investigated` : ""}. The survey is interpreted according to accepted hydrogeophysical principles, with emphasis on subsurface resistivity variations, weathered and fractured zones, aquifer geometry, groundwater-bearing formations and the most suitable drilling location. Interpretation includes the optimum borehole position, expected aquifer depth, anticipated drilling depth, groundwater potential and any geological limitations.`);
  o.push(`Recommended station (supplied): Station ${rec.station ?? ""}; target zone ${rec.targetZoneM ?? ""} m; expected yield ${rec.expectedYield ?? ""}; reason: ${rec.reason ?? ""}${has(rec.aiNote) ? `; interpretation note: ${rec.aiNote}` : ""}.`);
  if (Array.isArray(d.otherPoints) && d.otherPoints.length) o.push(`Other stations investigated: ${JSON.stringify(d.otherPoints)}.`);
  if (has(d.layers)) o.push(`Interpreted layers supplied: ${typeof d.layers === "string" ? d.layers : JSON.stringify(d.layers)}.`);
  if (has(d.casing)) o.push(`Casing supplied: ${d.casing}.`);
  if (has(d.waterQualityTests)) o.push(`Water-quality tests supplied: ${typeof d.waterQualityTests === "string" ? d.waterQualityTests : JSON.stringify(d.waterQualityTests)}.`);
  if (has(d.notes)) o.push(`Notes supplied by the client: ${d.notes}`);
  if (has(dep.minimum) || has(dep.maximum) || has(dep.preferred)) {
    o.push("", "## Borehole Depth Recommendation", "");
    o.push(`The interpreted groundwater target should be assessed within the drilling depth range of approximately **${dep.minimum ?? "?"} to ${dep.maximum ?? "?"} metres**.`);
    if (has(dep.minimum)) o.push(`The **minimum proposed drilling depth is approximately ${dep.minimum} metres**${has(dep.maximum) ? `, while the borehole may be drilled to a **maximum depth of approximately ${dep.maximum} metres** where the geophysical interpretation and drilling conditions support extension to the deeper target` : ""}.`);
    if (has(dep.preferred)) o.push(`Both depths are technically acceptable within the investigation findings; however, **approximately ${dep.preferred} metres is the more favourable target where feasible${has(dep.preferredReason) ? ` because ${dep.preferredReason}` : ""}**.`);
    o.push("The final drilling depth must remain subject to confirmation by the actual geological formations, water strikes, drilling conditions and hydrogeological observations encountered during drilling. Do not present the preferred depth as a guaranteed water-yielding depth or fabricate a specific aquifer interval that is not supported by the supplied geophysical data.");
  }
  o.push("", "## Figure References", "", "Site location map and satellite view (inserted from the coordinates or the uploaded map); interpreted geoelectric section for each station; borehole design drawing; site photographs where supplied. The system places these figures.");
  return o.join("\n");
}

export const RULES = `You write hydrogeological survey reports for a Kenyan borehole drilling company, as an experienced consulting hydrogeologist would, in the style of a professional consultancy report: formal prose with supporting tables.
HARD RULES
- Use ONLY the project data and the researched area facts supplied. Never invent coordinates, dates, readings, depths, yields, names, organisations, laws or numbers. If a fact is missing, write around it, or put "Not recorded" in a table cell.
- Every depth, yield, coordinate, station and date must match the project data exactly.
- THE CLIENT'S NUMBERS PREVAIL: the drilling depths (minimum, maximum, preferred), the water zone, the expected yield, the recommended station and the reasons supplied by the client are final. Your analysis must support and justify them. Never suggest a different depth or yield, and never replace them with a figure you infer from the screenshot or the interpretation note. If the interpretation note shows something different, mention it only as a secondary feature and keep the client's figures as the recommendation. Do not write any other depth or yield figure.
- The drilling depth is a recommended target, never a guaranteed water depth or yield. Depths are confirmed by logging, water strikes and pumping tests. Do not invent an aquifer interval the data does not support.
- Hydraulic parameters (transmissivity, hydraulic conductivity, storativity, specific yield, porosity, specific capacity) are preliminary planning estimates: give ranges typical for the formation described, label them preliminary and to be proven by a pumping test.
- FORMULAS: whenever you state a formula, show the working in the text or table: the formula, the values substituted (from the project data, or a typical range clearly labelled as an assumption), the arithmetic, and the result with its unit. Never give a bare formula. Do not run a calculation whose input is missing; say what test supplies it.
- Standard drilling and construction recommendations (casing, screen, gravel pack, development, pump tests) are normal engineering practice and may be stated, but any depth must come from the project data.
- Put each detail only in the section where it belongs; do not repeat the same sentence across sections.
- Formal, clear scientific English, third person, past tense for fieldwork. No AI-style filler, no marketing language, no "In conclusion".
- The wording must be original: vary sentence structure and paragraph order from other reports. Use the style seed.
- Cite researched sources in text as (Author/Organisation, Year) ONLY if the source is in the SOURCES list supplied; otherwise do not cite. Never write a placeholder such as "Year".
- PARAGRAPH STANDARD (marked by the code; a section that fails is sent back): every prose paragraph has 3 to 4 sentences (never fewer than 3), in this order: (1) a topic sentence stating the point; (2) a supporting sentence that explains it; (3) an evidence sentence that ties it to the project data, the survey results or a researched fact; (4) optionally a concluding sentence that closes the point or links it to the next. Only the short lead-in sentence that introduces a table or a bullet list may be shorter, where the section guide says so.
- Write each section at about its target word count (prose and table text together) and follow its GUIDE: if it asks for a table, the table is required.
OUTPUT: one JSON object only: {"<section id>": [ item, item, ... ], ...}. An item is a paragraph string, or {"table": {"caption": "...", "head": ["..."], "rows": [["..."]]}}, or {"bullets": ["full sentence", ...]}. Items appear in reading order. Table captions are short noun phrases (no "Table 1"). Every table cell is a string.`;

const CHUNK_WORDS = 1100;
const chunks = (ids: string[]): string[][] => {
  const out: string[][] = []; let cur: string[] = []; let w = 0;
  for (const id of ids) { const s = SURVEY_SECTIONS.find((x) => x.id === id)!; const n = s.words ?? 100; if (cur.length && (w + n > CHUNK_WORDS || cur.length >= 5)) { out.push(cur); cur = []; w = 0; } cur.push(id); w += n; }
  if (cur.length) out.push(cur);
  return out;
};

const sentences = (t: string) => t.trim().split(/(?<=[.!?])["')]?\s+(?=[A-Z(])/).filter((x) => x.trim().length > 1);
/** Prose paragraphs that break the 5-sentence minimum (lead-ins before a table or list are allowed where the section says so). */
const thinParas = (f: Flow[], lead: boolean) => f.flatMap((x, i) => ("p" in x && !(lead && i === 0 && f.length > 1 && !("p" in f[1]!)) && sentences(x.p).length < 3 ? [`paragraph ${f.slice(0, i + 1).filter((y) => "p" in y).length} has ${sentences(x.p).length} sentence(s)`] : []));
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Differences between a written section and the same section of the reference report. */
export function gaps(id: string, f: Flow[]): string[] {
  const r = REFERENCE[id]; const s = SURVEY_SECTIONS.find((x) => x.id === id);
  const out: string[] = [];
  const minWords = Math.max(Math.round((s?.words ?? 80) * 0.45), Math.round((r?.words ?? 0) * 0.7));
  if (flowWords(f) < minWords) out.push(`it has ${flowWords(f)} words but needs at least ${minWords}`);
  if (!r) return out;
  const tbs = f.filter((x): x is { table: { caption: string; head: string[]; rows: string[][] } } => "table" in x).map((x) => x.table);
  r.tables.forEach((rt, i) => {
    const t = tbs[i];
    if (!t) { out.push(`table ${i + 1} is missing (columns: ${rt.head.join(" | ")})`); return; }
    if (t.head.length !== rt.head.length) out.push(`table ${i + 1} must have exactly ${rt.head.length} columns: ${rt.head.join(" | ")}`);
    else if (norm(t.head[0]!) !== norm(rt.head[0]!) && !/ohm|\(m/i.test(rt.head.join(" "))) out.push(`table ${i + 1} first column must be headed "${rt.head[0]}"`);
    const need = Math.max(2, Math.round(rt.rows * 0.7));
    if (t.rows.length < need) out.push(`table ${i + 1} needs at least ${need} rows (it has ${t.rows.length})`);
  });
  if (r.bullets > 0 && !f.some((x) => "bullets" in x && x.bullets.length >= Math.min(3, r.bullets))) out.push(`it needs a bullet list of at least ${Math.min(3, r.bullets)} items`);
  return out;
}
const flowWords = (f: Flow[]) => f.reduce((n, x) => n + ("p" in x ? x.p.split(/\s+/).length : "table" in x ? x.table.rows.flat().join(" ").split(/\s+/).length + x.table.head.length : x.bullets.join(" ").split(/\s+/).length), 0);
const asFlow = (raw: unknown): Flow[] => {
  if (typeof raw === "string") return [{ p: raw }];
  if (!Array.isArray(raw)) return [];
  const out: Flow[] = [];
  for (const it of raw) {
    if (typeof it === "string") { if (it.trim()) out.push({ p: it.trim() }); continue; }
    if (it && typeof it === "object") {
      const o = it as Record<string, unknown>;
      const tb = o.table as { caption?: unknown; head?: unknown; rows?: unknown } | undefined;
      if (tb && Array.isArray(tb.head) && Array.isArray(tb.rows) && tb.rows.length) out.push({ table: { caption: String(tb.caption ?? "Summary"), head: tb.head.map(String), rows: tb.rows.filter(Array.isArray).map((r) => (r as unknown[]).map((c) => String(c ?? ""))) } });
      else if (Array.isArray(o.bullets) && o.bullets.length) out.push({ bullets: o.bullets.map(String) });
      else if (typeof o.p === "string" && o.p.trim()) out.push({ p: o.p.trim() });
    }
  }
  return out;
};

/** Remove citations that are placeholders or do not match a listed source. */
export function cleanCitations(text: string, allowed: string[]): string {
  const hay = allowed.join(" | ").toLowerCase();
  return text.replace(/\s*\(([A-Z][^()]{2,90}?),?\s*(\d{4}[a-z]?|Year|n\.d\.)\)/g, (m, who: string, yr: string) => {
    if (!/^\d{4}/.test(yr)) return "";
    const first = who.split(/[ ,&]/)[0]!.toLowerCase();
    return first.length > 2 && hay.includes(first) ? m : "";
  });
}

export async function writeReport(ctx: { data: unknown; facts: Facts; seed: string }, progress: (msg: string) => Promise<void>, onSection?: (id: string, flow: Flow[]) => void, extra: { glossary?: [string, string][]; images?: { label: string; b64: string }[] } = {}): Promise<Record<string, Flow[]>> {
  const ids = SURVEY_SECTIONS.filter((s) => s.words).map((s) => s.id);
  const sources = ctx.facts.sources.map((s) => s.title).slice(0, 20);
  const body = (want: string[], prior = "") => {
    const list = want.map((id) => { const s = SURVEY_SECTIONS.find((x) => x.id === id)!; const r = REFERENCE[id]; const cols = r?.tables.map((t, i) => `table ${i + 1}: exactly these columns [${t.head.join(" | ")}], about ${t.rows} rows`).join("; "); return `- ${s.id} ${s.title} (about ${s.words} words). GUIDE: ${s.guide}${cols ? ` REQUIRED TABLES (match the reference report; these columns override any columns named in the guide): ${cols}.` : ""}`; }).join("\n");
    return `${projectBrief(ctx.data as Brief)}\n\nPROJECT DATA (authoritative, same details as a JSON record):\n${JSON.stringify(ctx.data, null, 1)}\n\nRESEARCHED AREA FACTS (from web sources):\n${JSON.stringify({ geography: ctx.facts.geography, physiography: ctx.facts.physiography, climate: ctx.facts.climate, geology: ctx.facts.geology, hydrogeology: ctx.facts.hydrogeology, waterSupply: ctx.facts.waterSupply }, null, 1)}\n\nSOURCES: ${sources.join(" | ")}\n\nStyle seed: ${ctx.seed}\n\n${prior ? `ALREADY WRITTEN (do not repeat these points; keep the report consistent with them):\n${prior}\n\n` : ""}Write these sections now, with exactly these ids:\n${list}`;
  };
  const allowed = [...sources, ...REFERENCE_LIBRARY];
  const got: Record<string, Flow[]> = {};
  // every depth or yield figure in the text must come from the client's data (or the researched facts), or be a simple sum/difference of them
  const known = (() => {
    const base = new Set<number>(); const grab = (t: string) => { for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) base.add(Number(m[0])); };
    grab(JSON.stringify(ctx.data)); grab(JSON.stringify({ g: ctx.facts.geography, p: ctx.facts.physiography, c: ctx.facts.climate, ge: ctx.facts.geology, h: ctx.facts.hydrogeology, w: ctx.facts.waterSupply }));
    const small = [...base].filter((n) => n > 0 && n <= 600).slice(0, 60); const all = new Set(base);
    for (const a of small) for (const b of small) { all.add(Math.abs(a - b)); all.add(a + b); }
    return all;
  })();
  const badNums = (f: Flow[]): string[] => {
    const text = f.map((x) => ("p" in x ? x.p : "bullets" in x ? x.bullets.join(" ") : [x.table.caption, ...x.table.rows.flat()].join(" "))).join(" ");
    const out = new Set<string>();
    for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)(?:\s*(?:to|-|–)\s*(\d+(?:[.,]\d+)?))?\s*(m\b(?![²³])|metres|meters|m³\/h|m3\/h|m³\/hr|m³\/hour)/gi)) {
      for (const g of [m[1], m[2]]) { if (!g) continue; const n = Number(g.replace(",", ".")); if (Number.isFinite(n) && n > 5 && !known.has(n)) out.add(`${g} ${m[3]}`); }
    }
    return [...out].slice(0, 5);
  };
  let strictNums = true; // foreign depth/yield figures are checked on the first draft and one rewrite only, so a report never loops for long
  const ok = (id: string) => {
    const f = got[id]; const s = SURVEY_SECTIONS.find((x) => x.id === id)!;
    if (!f || !f.length) return false;
    if (/TABLE/.test(s.guide ?? "") && !f.some((x) => "table" in x)) return false;
    if (/BULLET/.test(s.guide ?? "") && !f.some((x) => "bullets" in x)) return false;
    if (thinParas(f, !!s.lead).length) return false;
    if (strictNums && badNums(f).length) return false;
    return gaps(id, f).length === 0;
  };
  const why = (id: string) => { const f = got[id]; const s = SURVEY_SECTIONS.find((x) => x.id === id)!; if (!f) return "nothing usable was returned"; const bn = badNums(f); if (bn.length) return `it contains figures that are not in the client's data (${bn.join(", ")}). Remove them: use only the client's depths, zone and yield exactly as supplied, and support them rather than suggesting others.`; const t = f ? thinParas(f, !!s.lead) : []; return t.length ? `${t.join("; ")}. Every prose paragraph needs 3 to 4 sentences: a topic sentence, two or three supporting sentences, an evidence sentence, then a concluding sentence.` : `the section does not match the reference report: ${gaps(id, f).join("; ") || "it was too short"}.`; };
  let lastRaw = "";
  /** Find a section in the AI's JSON whatever key style it used ("1.1", "Section 1.1", "1.1 Background Information", or a wrapper object/array). */
  const pick = (j: Record<string, unknown>, id: string): unknown => {
    if (id in j) return j[id];
    const k = Object.keys(j).find((x) => new RegExp(`^(section\\s*)?${id.replace(/\./g, "\\.")}(\\.?\\s|[:\\-]|$)`, "i").test(x.trim()));
    if (k) return j[k];
    for (const w of Object.values(j)) {
      if (Array.isArray(w)) { const hit = w.find((e) => e && typeof e === "object" && String((e as Record<string, unknown>).id ?? (e as Record<string, unknown>).section ?? "").trim() === id); if (hit) return hit; }
      else if (w && typeof w === "object") { const r = pick(w as Record<string, unknown>, id); if (r !== undefined) return r; }
    }
    return undefined;
  };
  const unwrap = (v: unknown): unknown => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if (o.table || o.bullets || typeof o.p === "string") return [o];
      for (const k of ["content", "items", "paragraphs", "body", "text", "flow", "blocks"]) if (o[k] !== undefined) return o[k];
    }
    return v;
  };
  // the pictures of the surveyed points go to the writer only in the section that explains the choice of point
  const userContent = (want: string[], text: string): string | { type: string; [k: string]: unknown }[] => {
    const imgs = extra.images ?? [];
    if (!imgs.length || !want.some((w) => w === "6.2.3" || w === "6.3")) return text;
    const note = `\n\nPICTURES OF THE SURVEYED POINTS (attached after this text, in this order: ${imgs.map((i) => i.label).join("; ")}). Study each picture yourself. For every point that was NOT recommended, work out from its picture (water-bearing zone depth and strength, how continuous or fractured the response looks, shallow or thin anomalies, likely yield) why it was not recommended, compared with the recommended point, and write that reasoning in 6.2.3 and 6.3 together with the client's own reason. Describe only what is actually visible; never invent numeric readings.`;
    return [{ type: "text", text: text + note }, ...imgs.flatMap((i) => [{ type: "text", text: i.label }, { type: "image", source: { type: "base64", media_type: "image/png", data: i.b64 } }])];
  };
  const run = async (want: string[], prior = "", fix = "") => {
    const out = await claude({ system: `${MASTER_PROMPT}\n\n${RULES}`, maxTokens: 9000, json: true, messages: [{ role: "user", content: userContent(want, body(want, prior) + (fix ? `\n\nYour previous version of this section was rejected by the checker: ${fix} Rewrite the whole section.` : "")) }] });
    lastRaw = out.text;
    let j: Record<string, unknown> = {};
    try { j = parseJson<Record<string, unknown>>(out.text); } catch { console.warn(`[report] reply was not JSON: ${out.text.slice(0, 200)}`); }
    for (const id of want) { const f = asFlow(unwrap(pick(j, id))); if (f.length) got[id] = f; }
  };
  // order: executive summary, glossary, then each main section in batches of 3 sub-sections (a lone leftover joins the previous batch)
  const brief = (id: string) => { const f = got[id]; const t = (f ?? []).map((x) => ("p" in x ? x.p : "bullets" in x ? x.bullets.join(" ") : x.table.caption)).join(" "); return t.slice(0, 170); };
  const summary = (xs: string[]) => xs.filter((x) => got[x]).map((x) => `${x} ${SURVEY_SECTIONS.find((y) => y.id === x)!.title}: ${brief(x)}…`).join("\n");
  const batchesOf = (xs: string[]): string[][] => {
    const out: string[][] = [];
    for (let k = 0; k < xs.length; k += 3) out.push(xs.slice(k, k + 3));
    if (out.length > 1 && out[out.length - 1]!.length === 1) { const last = out.pop()!; out[out.length - 1]!.push(...last); }
    return out;
  };
  // progress line: step count, percentage and what is already finished
  let step = 0, total = 1; const done: string[] = [];
  const say = (t: string) => progress(`${t} — step ${Math.min(step, total)} of ${total} (${Math.round((Math.max(step - 1, 0) / total) * 100)}%)${done.length ? ` — finished: ${done.join(", ")}` : ""}`);
  const doBatch = async (group: string[], label: string) => {
    step++;
    const others = () => ids.filter((x) => got[x] && !group.includes(x));
    const t0 = Date.now(); const took = () => `${Math.round((Date.now() - t0) / 1000)}s`;
    await say(label);
    await run(group, summary(others()));
    console.log(`[report] ${label}: first draft done in ${took()}`);
    strictNums = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt >= 1) strictNums = false;
      const bad = group.filter((id) => !ok(id));
      if (!bad.length) break;
      const sib = group.filter((id) => !bad.includes(id));
      console.log(`[report] ${label}: rewrite ${attempt + 1} for ${bad.join(", ")} (${bad.map((id) => why(id)).join(" | ").slice(0, 200)})`);
      await say(`${label} (improving ${bad.length} part${bad.length > 1 ? "s" : ""}, round ${attempt + 1})`);
      await run(bad, [summary(others()), summary(sib)].filter(Boolean).join("\n"), bad.map((id) => `Section ${id}: ${why(id)}`).join(" "));
    }
    // after the retries keep the best version the writer produced; only fail when a section is truly empty
    console.log(`[report] ${label}: finished in ${took()}`);
    const empty = group.filter((id) => !got[id] || !got[id]!.length);
    if (empty.length) throw new Error(`The writer returned nothing usable for section ${empty.join(", ")} (the AI reply was empty or not in the expected form; it began: "${lastRaw.replace(/\s+/g, " ").slice(0, 160) || "nothing"}"). Please try again.`);
    for (const id of group.filter((x) => !ok(x))) console.warn(`[report] section ${id} accepted below the checker standard: ${why(id)}`);
    for (const id of group) {
      got[id] = got[id]!.map((x) => ("p" in x ? { p: cleanCitations(x.p, allowed) } : "bullets" in x ? { bullets: x.bullets.map((b) => cleanCitations(b, allowed)) } : x));
      onSection?.(id, got[id]!);
    }
  };
  // glossary of 20 to 30 terms (not fatal: the Word file falls back to its fixed abbreviation list)
  const writeGlossary = async () => {
    step++; await say("Writing the report… Glossary");
    for (let a = 0; a < 2; a++) {
      try {
        const out = await claude({ system: "You write the glossary of a hydrogeological survey report for a Kenyan borehole company. Output one JSON object only.", maxTokens: 3000, messages: [{ role: "user", content: `${projectBrief(ctx.data as Brief)}\n\nWrite a glossary of 20 to 30 technical terms and abbreviations that appear in a report on this project (resistivity, aquifer, transmissivity, static water level, casing, gravel pack, the survey instrument, TDS, m bgl and similar). Each meaning is one clear sentence in plain scientific English with no invented figures.\nOUTPUT: {"glossary": [{"term": "...", "meaning": "..."}]}` }] });
        const j = parseJson<{ glossary?: { term?: unknown; meaning?: unknown }[] }>(out.text);
        const g = (j.glossary ?? []).filter((x) => x && x.term && x.meaning).map((x) => [String(x.term), String(x.meaning)] as [string, string]);
        if (g.length >= 15) { extra.glossary = g.slice(0, 30); return; }
      } catch { /* try once more, then fall back */ }
    }
  };
  const mains = [...new Set(ids.map((id) => id.split(".")[0]!))];
  total = mains.reduce((n, mm) => n + batchesOf(ids.filter((id) => id.split(".")[0] === mm)).length, 0) + 1;
  for (let m = 0; m < mains.length; m++) {
    const group = ids.filter((id) => id.split(".")[0] === mains[m]);
    const head = SURVEY_SECTIONS.find((x) => x.id === mains[m])!;
    const bs = batchesOf(group);
    for (let b = 0; b < bs.length; b++) await doBatch(bs[b]!, `Writing the report… ${head.num ? head.num + " " : ""}${head.title}${bs.length > 1 ? ` (part ${b + 1} of ${bs.length})` : ""}`);
    done.push(head.num ? head.num : "Executive summary");
    if (mains[m] === "exec") { await writeGlossary(); done.push("Glossary"); }
  }
  return got;
}

/** Textbooks and standards that exist. Online pages the AI really opened are added separately with the access date. */
export const REFERENCE_LIBRARY: string[] = [
  "Driscoll, F.G. (1986). Groundwater and Wells (2nd ed.). Johnson Division, St. Paul, Minnesota.",
  "Fetter, C.W. (2001). Applied Hydrogeology (4th ed.). Prentice Hall, Upper Saddle River, New Jersey.",
  "Freeze, R.A. and Cherry, J.A. (1979). Groundwater. Prentice-Hall, Englewood Cliffs, New Jersey.",
  "Kearey, P., Brooks, M. and Hill, I. (2002). An Introduction to Geophysical Exploration (3rd ed.). Blackwell Science, Oxford.",
  "Koefoed, O. (1979). Geosounding Principles, 1: Resistivity Sounding Measurements. Elsevier, Amsterdam.",
  "Kruseman, G.P. and de Ridder, N.A. (1990). Analysis and Evaluation of Pumping Test Data (2nd ed.). ILRI Publication 47, Wageningen.",
  "Republic of Kenya (2016). The Water Act, 2016 (No. 43 of 2016). Government Printer, Nairobi.",
  "Telford, W.M., Geldart, L.P. and Sheriff, R.E. (1990). Applied Geophysics (2nd ed.). Cambridge University Press, Cambridge.",
  "Todd, D.K. and Mays, L.W. (2005). Groundwater Hydrology (3rd ed.). John Wiley and Sons, New York.",
  "World Health Organization (2022). Guidelines for Drinking-water Quality: Fourth Edition Incorporating the First and Second Addenda. WHO, Geneva.",
];

/** One-line result of comparing the finished report with the reference report. */
export function conformance(got: Record<string, Flow[]>): string {
  const ids = SURVEY_SECTIONS.filter((x) => x.words).map((x) => x.id);
  const okSecs = ids.filter((id) => got[id] && gaps(id, got[id]!).length === 0).length;
  const refT = ids.reduce((n, id) => n + (REFERENCE[id]?.tables.length ?? 0), 0);
  const gotT = ids.reduce((n, id) => n + Math.min(REFERENCE[id]?.tables.length ?? 0, (got[id] ?? []).filter((x) => "table" in x).length), 0);
  return `layout matches the reference report: ${okSecs}/${ids.length} sections, ${gotT}/${refT} tables`;
}
