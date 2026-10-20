export const VIDEO_CATS = [
  { id: "boreholes", label: "Water Found", titleOf: (p: string) => `Successful Borehole in ${p}` },
  { id: "drilling", label: "Drilling", titleOf: (p: string) => `Borehole drilling in ${p}` },
  { id: "solar", label: "Solarization", titleOf: (p: string) => `Solarization in ${p}` },
  { id: "pump", label: "Pump Installation", titleOf: (p: string) => `Pump installation in ${p}` },
  { id: "inspection", label: "Borehole Inspection", titleOf: (p: string) => `Borehole inspection in ${p}` },
  { id: "survey", label: "Survey", titleOf: (p: string) => `Survey work in ${p}` },
  { id: "purification", label: "Purification", titleOf: (p: string) => `Water purification system in ${p}` },
] as const;
export type VideoCat = (typeof VIDEO_CATS)[number]["id"];
export const catOf = (v: unknown): VideoCat => (VIDEO_CATS.some((c) => c.id === v) ? (v as VideoCat) : "boreholes");
