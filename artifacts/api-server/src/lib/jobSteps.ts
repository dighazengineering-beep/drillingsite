/**
 * Job types and their steps. This is the ONE place to edit them.
 *
 * - `steps` are shown to the client in this order (first = start, last = finished).
 * - `important` steps get a highlighted bell notification and include the site team contact in the SMS.
 * - `phrase` (below) is the friendly sentence sent to the client for a step. Steps without one use a plain sentence.
 * - Jobs are stored by step NAME, so you can add or reorder steps later without breaking old jobs.
 *   If you rename a step, old jobs fall back to their saved step position.
 */
export interface JobTypeDef {
  id: string;
  label: string;
  steps: string[];
  important: string[];
}

export const JOB_TYPES: JobTypeDef[] = [
  {
    id: "survey",
    label: "Hydrogeological survey",
    steps: ["Booked", "Geologist on the way", "Geologist on site", "Survey in progress", "Survey completed", "Report being prepared", "Report delivered"],
    important: ["Geologist on the way", "Geologist on site", "Survey completed", "Report delivered"],
  },
  {
    id: "drilling",
    label: "Borehole drilling",
    steps: [
      "Booked", "Survey completed", "Rig and crew on the way", "Rig arrived", "Setting up equipment", "Drilling started", "Drilling in progress",
      "Target depth reached", "Casing and gravel packing", "Flushing and development", "Pump test", "Handed over",
    ],
    important: ["Rig and crew on the way", "Rig arrived", "Drilling started", "Target depth reached", "Handed over"],
  },
  {
    id: "pump",
    label: "Pump installation",
    steps: ["Booked", "Materials being prepared", "Materials on the way", "Materials delivered", "Engineers on the way", "Engineers on site", "Installation in progress", "Testing", "Handed over"],
    important: ["Engineers on the way", "Engineers on site", "Handed over"],
  },
  {
    id: "solar",
    label: "Solar installation",
    steps: ["Booked", "Materials on the way", "Materials delivered", "Engineers on site", "Panels and mounting installed", "Wiring and controller", "Testing", "Handed over"],
    important: ["Materials on the way", "Engineers on site", "Handed over"],
  },
  {
    id: "inspection",
    label: "Borehole inspection",
    steps: ["Booked", "Inspection team on the way", "Team on site", "Inspection in progress", "Findings report ready"],
    important: ["Inspection team on the way", "Team on site", "Findings report ready"],
  },
  {
    id: "purification",
    label: "Water purification",
    steps: ["Booked", "Equipment on the way", "Equipment delivered", "Installation in progress", "Water testing", "Handed over"],
    important: ["Equipment on the way", "Equipment delivered", "Handed over"],
  },
  {
    id: "other",
    label: "Other / product delivery",
    steps: ["Booked", "Preparing order", "Out for delivery", "Delivered"],
    important: ["Out for delivery", "Delivered"],
  },
];

export const JOB_TYPE_IDS = JOB_TYPES.map((t) => t.id);
export const typeDef = (id: string): JobTypeDef => JOB_TYPES.find((t) => t.id === id) ?? JOB_TYPES[JOB_TYPES.length - 1]!;

/** Friendly sentence for a step. Use {item} for the job name and {company} for the company. */
export const PHRASES: Record<string, string> = {
  "Geologist on the way": "Our geologist is on the way to your site for {item}.",
  "Geologist on site": "Our geologist has arrived on site for {item}.",
  "Survey completed": "The survey for {item} is completed.",
  "Report delivered": "Your report for {item} has been delivered.",
  "Rig and crew on the way": "Our rig and crew are on the way to your site for {item}.",
  "Rig arrived": "Our rig has arrived on site for {item}.",
  "Drilling started": "Drilling has started for {item}.",
  "Target depth reached": "Target depth reached for {item}.",
  "Engineers on the way": "Our engineers are on the way to your site for {item}.",
  "Engineers on site": "Our engineers have arrived on site for {item}.",
  "Materials on the way": "Materials for {item} are on the way.",
  "Materials delivered": "Materials for {item} have been delivered.",
  "Inspection team on the way": "Our inspection team is on the way to your site for {item}.",
  "Team on site": "Our inspection team has arrived on site for {item}.",
  "Findings report ready": "The findings report for {item} is ready.",
  "Equipment on the way": "Equipment for {item} is on the way.",
  "Equipment delivered": "Equipment for {item} has been delivered.",
  "Out for delivery": "{item} is out for delivery.",
  "Delivered": "{item} has been delivered. Thank you for choosing {company}.",
  "Handed over": "Your {item} is complete and handed over. Thank you for choosing {company}.",
};

/** Guess the job type from the service or product name. The admin can always change it. */
export function suggestType(item: string, kind = "service"): string {
  if (kind === "product") return "other";
  const s = item.toLowerCase();
  if (/inspect/.test(s)) return "inspection";
  if (/purif|treatment|filter|water\s*treat|\bro\b|osmosis/.test(s)) return "purification";
  if (/solar/.test(s)) return "solar";
  if (/survey|hydro|geolog/.test(s) && !/drill/.test(s)) return "survey";
  if (/drill/.test(s)) return "drilling";
  if (/test.?pump/.test(s)) return "other";
  if (/pump/.test(s)) return "pump";
  return "other";
}

/**
 * Old jobs saved a stage NUMBER from the first two step lists. These tables turn that number into a step name in
 * today's list, so nothing stored earlier is lost. (Do not edit.)
 */
const LEGACY_STAGE_TO_STEP: Record<string, string[]> = {
  drilling: ["Booked", "Survey completed", "Drilling in progress", "Casing and gravel packing", "Pump test", "Handed over"],
  survey: ["Booked", "Geologist on the way", "Geologist on site", "Survey completed", "Report delivered"],
};

/** Work out a job's type and current step from what is stored. A saved step name wins; otherwise the old stage number is mapped. */
export function resolveJob(stored: { job_type?: unknown; step?: unknown; stage?: unknown; hasRow: boolean }, item: string, kind = "service") {
  const savedType = typeof stored.job_type === "string" ? stored.job_type : "";
  // a job saved before step names existed used the original drilling list unless it was marked as a survey
  const type = JOB_TYPE_IDS.includes(savedType) ? savedType : stored.hasRow ? "drilling" : suggestType(item, kind);
  const def = typeDef(type);
  let idx = typeof stored.step === "string" && stored.step ? def.steps.indexOf(stored.step) : -1;
  if (idx < 0) {
    const n = Math.max(0, Math.round(Number(stored.stage ?? 0)) || 0);
    const legacy = !stored.step ? LEGACY_STAGE_TO_STEP[type]?.[n] : undefined;
    idx = legacy ? def.steps.indexOf(legacy) : Math.min(n, def.steps.length - 1);
    if (idx < 0) idx = Math.min(n, def.steps.length - 1);
  }
  return { type, def, index: idx, step: def.steps[idx]! };
}

export const jobStatus = (index: number, total: number): "waiting" | "progress" | "done" => (index >= total - 1 ? "done" : index <= 0 ? "waiting" : "progress");
