/**
 * Turn pasted or typed coordinates into decimal degrees. Understands "-3.53073, 38.32219", "3.53073 S 38.32219 E", "S 3.53073 E 38.32219"
 * and degrees-minutes-seconds like 3°31'50.6"S 38°19'19.9"E. Kenya lies between latitude -5 and 5 and longitude 33 and 42,
 * so a pair given the wrong way round is turned the right way.
 */
export function parseCoords(text: string): { lat: number; lng: number } | null {
  const t = text.replace(/[′’‘]/g, "'").replace(/[″”“]/g, '"').replace(/[º˚]/g, "°").trim();
  if (!t) return null;
  const prefix = /^\s*[NSEW]/i.test(t);
  const num = String.raw`(-?\d{1,3}(?:\.\d+)?)\s*°?\s*(?:(\d{1,2}(?:\.\d+)?)\s*')?\s*(?:(\d{1,2}(?:\.\d+)?)\s*")?`;
  const re = new RegExp(prefix ? String.raw`([NSEW])\s*${num}` : String.raw`${num}\s*([NSEW])?`, "gi");
  const parts: { v: number; h: string }[] = [];
  for (const m of t.matchAll(re)) {
    const h = ((prefix ? m[1] : m[4]) ?? "").toUpperCase();
    const o = prefix ? 2 : 1;
    const deg = Number(m[o]), min = Number(m[o + 1] ?? 0), sec = Number(m[o + 2] ?? 0);
    if (!Number.isFinite(deg)) continue;
    const v = Math.abs(deg) + min / 60 + sec / 3600;
    parts.push({ v: (deg < 0 || /[SW]/.test(h) ? -1 : 1) * v, h });
  }
  if (parts.length < 2) return null;
  let [a, b] = parts as [{ v: number; h: string }, { v: number; h: string }];
  if (/[EW]/.test(a.h) || /[NS]/.test(b.h)) [a, b] = [b, a];
  let lat = a.v, lng = b.v;
  if (Math.abs(lat) > 90 || (Math.abs(lat) > 6 && Math.abs(lng) <= 6)) [lat, lng] = [lng, lat];
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}
