import { createCanvas, loadImage } from "@napi-rs/canvas";

const LAYERS = {
  sat: { url: (z: number, y: number, x: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, credit: "Imagery: Esri, Maxar, Earthstar Geographics" },
  topo: { url: (z: number, y: number, x: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`, credit: "Map: Esri, HERE, Garmin, USGS, OpenStreetMap contributors" },
} as const;

/** A real map picture centred on the coordinates (Esri tiles), with a marker, north arrow and scale bar. Returns null if the tiles can't be fetched. */
export async function tileMap(lat: number, lng: number, zoom: number, layer: keyof typeof LAYERS = "sat", cols = 5, rows = 3): Promise<{ png: Buffer; w: number; h: number } | null> {
  try {
    const n = 2 ** zoom, L = LAYERS[layer];
    const fx = ((lng + 180) / 360) * n;
    const fy = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
    const tx = Math.floor(fx), ty = Math.floor(fy), halfX = Math.floor(cols / 2), halfY = Math.floor(rows / 2);
    const W = 256 * cols, H = 256 * rows, c = createCanvas(W, H), g = c.getContext("2d");
    g.fillStyle = "#dfe6ea"; g.fillRect(0, 0, W, H);
    const jobs: Promise<void>[] = [];
    let ok = 0;
    for (let dx = 0; dx < cols; dx++) for (let dy = 0; dy < rows; dy++) {
      const x = tx - halfX + dx, y = ty - halfY + dy;
      jobs.push((async () => {
        const r = await fetch(L.url(zoom, y, x), { signal: AbortSignal.timeout(10000) });
        if (!r.ok) return;
        g.drawImage(await loadImage(Buffer.from(await r.arrayBuffer())), dx * 256, dy * 256); ok++;
      })().catch(() => {}));
    }
    await Promise.all(jobs);
    if (ok < Math.ceil(cols * rows * 0.66)) return null;
    const px = (fx - (tx - halfX)) * 256, py = (fy - (ty - halfY)) * 256;
    // marker
    g.lineWidth = 4; g.strokeStyle = "#fff"; g.fillStyle = "#e11d48";
    g.beginPath(); g.arc(px, py, zoom >= 15 ? 14 : 9, 0, Math.PI * 2); g.fill(); g.stroke();
    if (zoom >= 15) { g.beginPath(); g.arc(px, py, 34, 0, Math.PI * 2); g.stroke(); }
    // north arrow
    g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(W - 54, 10, 44, 62);
    g.fillStyle = "#111"; g.beginPath(); g.moveTo(W - 32, 18); g.lineTo(W - 20, 52); g.lineTo(W - 32, 45); g.lineTo(W - 44, 52); g.closePath(); g.fill();
    g.font = "bold 14px sans-serif"; g.textAlign = "center"; g.fillText("N", W - 32, 67);
    // scale bar
    const mpp = (156543.03 * Math.cos((lat * Math.PI) / 180)) / n;
    const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000].find((m) => m / mpp >= 70) ?? 200000;
    const len = nice / mpp;
    g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(10, H - 56, len + 20, 28);
    g.fillStyle = "#111"; g.fillRect(20, H - 38, len, 4); g.fillRect(20, H - 44, 2, 10); g.fillRect(20 + len - 2, H - 44, 2, 10);
    g.font = "12px sans-serif"; g.textAlign = "left"; g.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, 24, H - 46);
    g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, H - 20, W, 20);
    g.fillStyle = "#fff"; g.font = "11px sans-serif"; g.fillText(L.credit, 8, H - 6);
    return { png: c.toBuffer("image/png"), w: W, h: H };
  } catch { return null; }
}

/** Satellite view of the site (kept for the single-picture case). */
export const satelliteMap = (lat: number, lng: number, zoom = 17) => tileMap(lat, lng, zoom, "sat");

type Pt = { lat: number; lng: number; name: string; kind: string };
const GLYPH: Record<string, [string, string]> = { school: ["S", "#2563eb"], health: ["H", "#dc2626"], worship: ["†", "#7c3aed"], market: ["M", "#d97706"], place: ["•", "#0f766e"], other: ["•", "#475569"] };

/** Named places (schools, clinics, churches, mosques, markets, shops) around the site from OpenStreetMap. Empty when the service can't be reached. */
async function landmarks(lat: number, lng: number, radius: number): Promise<Pt[]> {
  try {
    const q = `[out:json][timeout:20];(node(around:${radius},${lat},${lng})["name"]["amenity"];way(around:${radius},${lat},${lng})["name"]["amenity"];node(around:${radius},${lat},${lng})["name"]["place"];node(around:${radius},${lat},${lng})["name"]["shop"];way(around:${radius},${lat},${lng})["name"]["leisure"];way(around:${radius},${lat},${lng})["name"]["building"];);out center 120;`;
    const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(20000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { elements?: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
    return (j.elements ?? []).flatMap((e) => {
      const t = e.tags ?? {}; const la = e.lat ?? e.center?.lat, ln = e.lon ?? e.center?.lon;
      if (la == null || ln == null || !t.name) return [];
      const a = t.amenity ?? "";
      const kind = /school|college|kindergarten|university/.test(a) ? "school" : /hospital|clinic|doctors|pharmacy/.test(a) ? "health" : /place_of_worship/.test(a) ? "worship" : /marketplace/.test(a) || t.shop ? "market" : t.place ? "place" : "other";
      return [{ lat: la, lng: ln, name: t.name, kind }];
    });
  } catch { return []; }
}

/** Wide aerial picture (satellite tiles) with the names of nearby landmarks written on it, like the Google Maps / Google Earth view. */
export async function aerialView(lat: number, lng: number, zoom = 18, W = 1400, H = 700, siteLabel = "Proposed borehole site"): Promise<{ png: Buffer; w: number; h: number } | null> {
  try {
    const n = 2 ** zoom;
    const wx = ((lng + 180) / 360) * n * 256;
    const wy = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n * 256;
    const x0 = wx - W / 2, y0 = wy - H / 2;
    const c = createCanvas(W, H), g = c.getContext("2d");
    g.fillStyle = "#dfe6ea"; g.fillRect(0, 0, W, H);
    const jobs: Promise<void>[] = []; let ok = 0, total = 0;
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + W) / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + H) / 256); ty++) {
      total++;
      jobs.push((async () => {
        const r = await fetch(LAYERS.sat.url(zoom, ty, tx), { signal: AbortSignal.timeout(10000) });
        if (!r.ok) return;
        g.drawImage(await loadImage(Buffer.from(await r.arrayBuffer())), tx * 256 - x0, ty * 256 - y0); ok++;
      })().catch(() => {}));
    }
    const mpp = (156543.03 * Math.cos((lat * Math.PI) / 180)) / n;
    const [, pts] = await Promise.all([Promise.all(jobs), landmarks(lat, lng, Math.round((Math.hypot(W, H) / 2) * mpp))]);
    if (ok < Math.ceil(total * 0.66)) return null;
    const proj = (p: Pt) => ({ x: ((p.lng + 180) / 360) * n * 256 - x0, y: ((1 - Math.log(Math.tan((p.lat * Math.PI) / 180) + 1 / Math.cos((p.lat * Math.PI) / 180)) / Math.PI) / 2) * n * 256 - y0 });
    const cx = W / 2, cy = H / 2;
    g.font = "bold 15px sans-serif"; g.textBaseline = "middle"; g.lineJoin = "round";
    const used: [number, number, number, number][] = [[cx - 90, cy - 30, cx + 90, cy + 30]];
    const hit = (b: number[]) => used.some((u) => b[0] < u[2] && b[2] > u[0] && b[1] < u[3] && b[3] > u[1]);
    let placed = 0;
    for (const p of pts.sort((a, b) => (a.kind === "other" ? 1 : 0) - (b.kind === "other" ? 1 : 0))) {
      if (placed >= 24) break;
      const { x, y } = proj(p); if (x < 20 || x > W - 20 || y < 20 || y > H - 40) continue;
      const tw = g.measureText(p.name).width, box = [x - 12, y - 12, x + 20 + tw, y + 12];
      if (box[2] > W - 4 || hit(box)) continue;
      used.push(box as [number, number, number, number]); placed++;
      const [gl, col] = GLYPH[p.kind] ?? GLYPH.other!;
      g.fillStyle = col; g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = "#fff"; g.textAlign = "center"; g.font = "bold 12px sans-serif"; g.fillText(gl, x, y + 1);
      g.font = "bold 15px sans-serif"; g.textAlign = "left"; g.lineWidth = 4; g.strokeStyle = "rgba(0,0,0,.85)"; g.strokeText(p.name, x + 16, y); g.fillStyle = "#fff"; g.fillText(p.name, x + 16, y);
    }
    // the site
    g.lineWidth = 4; g.strokeStyle = "#fff"; g.fillStyle = "#e11d48"; g.beginPath(); g.arc(cx, cy, 13, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.arc(cx, cy, 32, 0, Math.PI * 2); g.stroke();
    g.font = "bold 16px sans-serif"; g.textAlign = "center"; g.lineWidth = 5; g.strokeStyle = "rgba(0,0,0,.85)"; g.strokeText(siteLabel, cx, cy + 52); g.fillStyle = "#fff"; g.fillText(siteLabel, cx, cy + 52);
    // north arrow and scale
    g.fillStyle = "rgba(255,255,255,.88)"; g.fillRect(W - 54, 10, 44, 62);
    g.fillStyle = "#111"; g.beginPath(); g.moveTo(W - 32, 18); g.lineTo(W - 20, 52); g.lineTo(W - 32, 45); g.lineTo(W - 44, 52); g.closePath(); g.fill(); g.font = "bold 14px sans-serif"; g.fillText("N", W - 32, 64);
    const nice = [10, 20, 50, 100, 200, 500].find((m) => m / mpp >= 90) ?? 500, len = nice / mpp;
    g.fillStyle = "rgba(255,255,255,.88)"; g.fillRect(10, H - 60, len + 24, 30); g.fillStyle = "#111"; g.fillRect(22, H - 40, len, 4); g.fillRect(22, H - 46, 2, 10); g.fillRect(22 + len - 2, H - 46, 2, 10);
    g.font = "12px sans-serif"; g.textAlign = "left"; g.fillText(`${nice} m`, 26, H - 50);
    g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(0, H - 22, W, 22); g.fillStyle = "#fff"; g.font = "11px sans-serif"; g.fillText("Imagery: Esri, Maxar, Earthstar Geographics. Place names: OpenStreetMap contributors", 8, H - 11);
    return { png: c.toBuffer("image/png"), w: W, h: H };
  } catch { return null; }
}

/** Google Maps satellite view with place names, when a Google Maps Static API key is set on the server. */
export async function googleHybrid(lat: number, lng: number, zoom = 20): Promise<{ png: Buffer; w: number; h: number } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=640x320&scale=2&maptype=hybrid&markers=color:red%7C${lat},${lng}&key=${key}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok || !String(r.headers.get("content-type")).startsWith("image/")) return null;
    return { png: Buffer.from(await r.arrayBuffer()), w: 1280, h: 640 };
  } catch { return null; }
}
