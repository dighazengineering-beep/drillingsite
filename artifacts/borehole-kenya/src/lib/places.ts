import { KENYA_COUNTIES } from "@/lib/utils";

/**
 * Autofill for the upload form: County, then Sub-county, then Ward, then an optional village or area.
 * Counties are built in; sub-counties, wards and villages come from a small data file loaded when the form opens.
 * These are only suggestions: anything can still be typed by hand, so a place missing from here is never a problem.
 */
export const COUNTY_LIST: string[] = KENYA_COUNTIES;

const norm = (s: string) => s.toLowerCase().replace(/['’]/g, "").trim();

/** Best matches first: names that start with what was typed, then words that start with it, then anything containing it. */
function rank<T>(items: T[], label: (t: T) => string, q: string, limit: number): T[] {
  const n = norm(q);
  if (!n) return items.slice(0, limit);
  const scored: { t: T; s: number }[] = [];
  for (const t of items) {
    const l = norm(label(t));
    const s = l.startsWith(n) ? 0 : l.split(/[\s\-/]+/).some((w) => w.startsWith(n)) ? 1 : n.length >= 3 && l.includes(n) ? 2 : -1;
    if (s >= 0) scored.push({ t, s });
  }
  return scored.sort((a, b) => a.s - b.s || label(a.t).localeCompare(label(b.t))).slice(0, limit).map((x) => x.t);
}

/** `county` and `sub` are set when picking this suggestion should also fill those boxes. */
export interface Suggestion { label: string; hint?: string; county?: string; sub?: string }

export function countySuggestions(q: string): Suggestion[] {
  return rank(COUNTY_LIST, (c) => c, q, 12).map((c) => ({ label: c }));
}

/** counties -> { s: sub-county -> wards, a: locations and sub-locations }, plus _x: areas with no county on record */
type AreaData = Record<string, { s: Record<string, string[]>; a: string[] }> & { _x?: string[] };
let AREAS: AreaData | null = null;
let areasLoad: Promise<void> | null = null;
export function loadAreas(): Promise<void> {
  areasLoad ??= fetch(`${import.meta.env.BASE_URL}data/areas.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d) AREAS = d as AreaData; })
    .catch(() => { areasLoad = null; });
  return areasLoad;
}

const countyData = (county: string) => (AREAS ? AREAS[COUNTY_LIST.find((c) => norm(c) === norm(county)) ?? ""] : undefined);
const countyName = (county: string) => COUNTY_LIST.find((c) => norm(c) === norm(county)) ?? "";
const allCounties = () => (AREAS ? Object.entries(AREAS).filter(([k]) => k[0] !== "_") as [string, { s: Record<string, string[]>; a: string[] }][] : []);

/** Sub-counties of the chosen county; with no county chosen, every sub-county in Kenya (picking one fills the county). */
export function subCountySuggestions(q: string, county: string): Suggestion[] {
  const own = countyData(county);
  if (own) return rank(Object.keys(own.s), (s) => s, q, 12).map((s) => ({ label: s }));
  const all = allCounties().flatMap(([c, v]) => Object.keys(v.s).map((s) => ({ s, c })));
  return rank(all, (x) => x.s, q, 10).map((x) => ({ label: x.s, hint: x.c, county: x.c }));
}

/** Wards of the chosen sub-county; with only a county, its wards; with nothing, any ward (picking one fills the boxes above it). */
export function wardSuggestions(q: string, county: string, sub: string): Suggestion[] {
  const own = countyData(county);
  if (own) {
    const sc = Object.keys(own.s).find((s) => norm(s) === norm(sub));
    if (sc) return rank(own.s[sc], (w) => w, q, 12).map((w) => ({ label: w }));
    const all = Object.entries(own.s).flatMap(([s, ws]) => ws.map((w) => ({ w, s })));
    return rank(all, (x) => x.w, q, 10).map((x) => ({ label: x.w, hint: x.s, sub: x.s }));
  }
  const all = allCounties().flatMap(([c, v]) => Object.entries(v.s).flatMap(([s, ws]) => ws.map((w) => ({ w, s, c }))));
  return rank(all, (x) => x.w, q, 10).map((x) => ({ label: x.w, hint: `${x.s}, ${x.c}`, county: x.c, sub: x.s }));
}

const HISTORY = "kws_places";
const recent = (): string[] => { try { return JSON.parse(localStorage.getItem(HISTORY) ?? "[]"); } catch { return []; } };

/**
 * Village or area suggestions: places this phone used before, then locations and sub-locations of the chosen county
 * (every county when none is chosen), then areas whose county is not recorded in the official list.
 */
export function villageSuggestions(q: string, county = ""): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (list: Suggestion[]) => { for (const s of list) { const k = norm(s.label); if (!seen.has(k)) { seen.add(k); out.push(s); } } };
  add(rank(recent(), (v) => v, q, 4).map((v) => ({ label: v, hint: "Used before" })));
  if (AREAS) {
    const own = countyData(county);
    if (own) add(rank(own.a, (v) => v, q, 10).map((v) => ({ label: v })));
    else add(rank(allCounties().flatMap(([c, v]) => v.a.map((n) => ({ n, c }))), (x) => x.n, q, 8).map((x) => ({ label: x.n, hint: x.c })));
    if (out.length < 10 && norm(q).length >= 2) add(rank(AREAS._x ?? [], (v) => v, q, 10 - out.length).map((v) => ({ label: v })));
  }
  return out.slice(0, 12);
}

export function rememberVillage(v: string) {
  const t = v.trim();
  if (!t) return;
  try { localStorage.setItem(HISTORY, JSON.stringify([t, ...recent().filter((x) => norm(x) !== norm(t))].slice(0, 40))); } catch { /* ignore */ }
}

/** Find the county in a name like "Kajiado County" using the official list. */
export const matchCounty = (name: string) => COUNTY_LIST.find((c) => norm(name).replace(/ county$/, "") === norm(c)) ?? "";

/** Work out the sub-county and ward from place names a map gives for a spot (the ward is matched first, then the sub-county). */
export function resolveArea(county: string, names: string[]): { county: string; sub: string; ward: string } {
  const wanted = names.map(norm).filter(Boolean);
  const pools = county && countyData(county) ? ([[countyName(county), countyData(county)!]] as [string, { s: Record<string, string[]>; a: string[] }][]) : allCounties();
  for (const n of wanted) {
    for (const [c, v] of pools) for (const [s, ws] of Object.entries(v.s)) { const w = ws.find((x) => norm(x) === n); if (w) return { county: c, sub: s, ward: w }; }
  }
  for (const n of wanted) {
    for (const [c, v] of pools) { const s = Object.keys(v.s).find((x) => norm(x) === n); if (s) return { county: c, sub: s, ward: "" }; }
  }
  return { county, sub: "", ward: "" };
}

/** Turn a map position into a county, sub-county, ward and village using OpenStreetMap (free, no key needed). */
export async function reverseGeocode(lat: number, lng: number): Promise<{ county: string; sub: string; ward: string; village: string }> {
  let a: Record<string, string> = {};
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`);
    a = ((await r.json()).address ?? {}) as Record<string, string>;
  } catch { /* the pin is still saved without place names */ }
  await loadAreas();
  const county = matchCounty(a.county ?? "") || matchCounty(a.state ?? "") || matchCounty(a.state_district ?? "");
  const names = [a.suburb, a.neighbourhood, a.village, a.hamlet, a.town, a.city_district, a.municipality, a.city, a.locality, a.state_district].filter(Boolean) as string[];
  const found = resolveArea(county, names);
  const village = a.village || a.hamlet || a.suburb || a.neighbourhood || a.locality || "";
  return { county: found.county || county, sub: found.sub, ward: found.ward, village: norm(village) === norm(found.ward) ? "" : village };
}

/** Turn the phone's GPS position into county, sub-county, ward and village. */
export async function whereAmI(): Promise<{ county: string; sub: string; ward: string; village: string; lat: number; lng: number }> {
  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("This phone cannot share its location.")); return; }
    navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("Could not get the location. Allow location access and try again.")), { enableHighAccuracy: true, timeout: 15000 });
  });
  const { latitude: lat, longitude: lng } = pos.coords;
  return { ...(await reverseGeocode(lat, lng)), lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
}
