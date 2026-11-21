import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, LocateFixed, Search, Camera, MapPin, Check } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const LAYERS: Record<string, { label: string; base: string; over?: string[]; credit: string }> = {
  hybrid: { label: "Satellite + names", base: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, over: [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`], credit: "Imagery © Esri, Maxar, Earthstar Geographics" },
  sat: { label: "Satellite", base: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, credit: "Imagery © Esri, Maxar, Earthstar Geographics" },
  street: { label: "Street map", base: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", credit: "© OpenStreetMap contributors" },
  topo: { label: "Topographic", base: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`, credit: "Map © Esri, HERE, Garmin, USGS, OpenStreetMap contributors" },
};
const MAXZ = 19;
const NAMES: Record<string, string> = { hybrid: "Aerial view of the site with place names", sat: "Aerial (satellite) view of the site", street: "Street map of the site area", topo: "Terrain (topographic) map of the site area" };
const fill = (tpl: string, z: number, x: number, y: number) => tpl.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
const loadTile = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

/**
 * Full map for the admin: satellite, satellite with names, street and topographic views, place search, coordinates and a red pin in the middle.
 * "Take screenshot" draws exactly what is on the screen (with the pin, a north arrow and a scale bar) so it can be framed and saved as the report's map.
 * "Use this pin" copies the pin's latitude and longitude into the form.
 */
export default function MapShot({ initial, query, onClose, onShot, onUsePin }: {
  initial: { lat: number; lng: number } | null; query: string; onClose: () => void;
  onShot: (blob: Blob, name: string) => void; onUsePin: (lat: number, lng: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null); const map = useRef<L.Map | null>(null); const layers = useRef<L.TileLayer[]>([]); const pin = useRef<L.Marker | null>(null); const putPin = useRef<(ll: L.LatLngExpression) => void>(() => {});
  const [view, setView] = useState("hybrid"); const [q, setQ] = useState(query);
  const [coords, setCoords] = useState(initial ? `${initial.lat}, ${initial.lng}` : "");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [centre, setCentre] = useState<string>("");

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: false, maxZoom: MAXZ }).setView(initial ? [initial.lat, initial.lng] : [0.4, 37.9], initial ? 18 : 6);
    map.current = m;
    // the pin is a real marker fixed to a spot on the ground: it moves and zooms with the map. Click the map or drag the pin to move it.
    const icon = L.divIcon({ className: "", html: '<div style="width:28px;height:28px;border-radius:50%;background:#e11d48;border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div>', iconSize: [28, 28], iconAnchor: [14, 14] });
    const upd = () => { const c = pin.current?.getLatLng(); setCentre(c ? `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}` : ""); };
    const put = (ll: L.LatLngExpression) => {
      if (pin.current) pin.current.setLatLng(ll); else { pin.current = L.marker(ll, { icon, draggable: true }).addTo(m); pin.current.on("dragend", upd); }
      upd();
    };
    putPin.current = put;
    m.on("click", (e: L.LeafletMouseEvent) => put(e.latlng));
    if (initial) put([initial.lat, initial.lng]);
    const t = window.setTimeout(() => m.invalidateSize(), 150);
    if (!initial && query.trim()) void go(query);
    return () => { window.clearTimeout(t); m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { // switch the view
    const m = map.current; if (!m) return;
    layers.current.forEach((l) => m.removeLayer(l));
    const v = LAYERS[view]!;
    layers.current = [L.tileLayer(v.base, { maxZoom: MAXZ, maxNativeZoom: MAXZ, crossOrigin: "anonymous" }), ...(v.over ?? []).map((u) => L.tileLayer(u, { maxZoom: MAXZ, maxNativeZoom: MAXZ, crossOrigin: "anonymous" }))];
    layers.current.forEach((l) => l.addTo(m));
  }, [view]);

  const go = async (text: string) => {
    if (!text.trim()) return; setBusy(true); setMsg("");
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ke&accept-language=en&q=${encodeURIComponent(text)}`);
      const d = (await r.json()) as { lat: string; lon: string }[];
      if (d[0]) { map.current?.setView([Number(d[0].lat), Number(d[0].lon)], 16); putPin.current([Number(d[0].lat), Number(d[0].lon)]); } else setMsg("Could not find that place. Drag the map to it instead.");
    } catch { setMsg("Search needs internet. Drag the map to the spot instead."); }
    setBusy(false);
  };
  const goCoords = () => {
    const n = coords.split(/[,\s]+/).map(Number).filter((x) => Number.isFinite(x));
    if (n.length >= 2 && Math.abs(n[0]!) <= 90 && Math.abs(n[1]!) <= 180) { map.current?.setView([n[0]!, n[1]!], 18); putPin.current([n[0]!, n[1]!]); } else setMsg("Type the coordinates like -3.53073, 38.32219");
  };
  const here = () => {
    if (!navigator.geolocation) { setMsg("This device cannot share its location."); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition((p) => { map.current?.setView([p.coords.latitude, p.coords.longitude], 18); putPin.current([p.coords.latitude, p.coords.longitude]); setBusy(false); }, () => { setMsg("Could not get the location. Allow location access, or drag the map."); setBusy(false); }, { enableHighAccuracy: true, timeout: 15000 });
  };

  const shot = async () => {
    const m = map.current; if (!m) return; setBusy(true); setMsg("Taking the screenshot…");
    try {
      // exactly what the frame shows (a wide 16:10 box), saved as a 1600 px wide picture
      const z = m.getZoom(), n = 2 ** z, fs = m.getSize(), SW = 1600, sc = SW / fs.x, SH = Math.round(fs.y * sc), cp = m.project(m.getCenter(), z);
      const b = L.bounds(L.point(cp.x - fs.x / 2, cp.y - fs.y / 2), L.point(cp.x + fs.x / 2, cp.y + fs.y / 2));
      const size = { x: SW, y: SH };
      const cv = document.createElement("canvas"); cv.width = size.x; cv.height = size.y; const g = cv.getContext("2d")!;
      g.fillStyle = "#dfe6ea"; g.fillRect(0, 0, size.x, size.y);
      const v = LAYERS[view]!, urls = [v.base, ...(v.over ?? [])];
      const x0 = Math.floor(b.min!.x / 256), x1 = Math.floor(b.max!.x / 256), y0 = Math.floor(b.min!.y / 256), y1 = Math.floor(b.max!.y / 256);
      for (const tpl of urls) {
        const jobs: Promise<void>[] = [];
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
          if (y < 0 || y >= n) continue; const wx = ((x % n) + n) % n;
          jobs.push(loadTile(fill(tpl, z, wx, y)).then((im) => { if (im) g.drawImage(im, Math.floor((x * 256 - b.min!.x) * sc), Math.floor((y * 256 - b.min!.y) * sc), Math.ceil(256 * sc) + 1, Math.ceil(256 * sc) + 1); }));
        }
        await Promise.all(jobs);
      }
      const W = size.x, H = size.y, pl = pin.current?.getLatLng(), pp = pl ? m.project(pl, z) : null, px = pp ? (pp.x - b.min!.x) * sc : -999, py = pp ? (pp.y - b.min!.y) * sc : -999;
      g.lineWidth = 5; g.strokeStyle = "#fff"; g.fillStyle = "#e11d48"; g.beginPath(); g.arc(px, py, 16, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.arc(px, py, 40, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "rgba(255,255,255,.88)"; g.fillRect(W - 54, 10, 44, 62); g.fillStyle = "#111"; g.beginPath(); g.moveTo(W - 32, 18); g.lineTo(W - 20, 52); g.lineTo(W - 32, 45); g.lineTo(W - 44, 52); g.closePath(); g.fill();
      g.font = "bold 14px sans-serif"; g.textAlign = "center"; g.fillText("N", W - 32, 67);
      const c = m.getCenter(), mpp = (156543.03 * Math.cos((c.lat * Math.PI) / 180)) / n;
      const nice = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].find((x) => x / mpp >= 70) ?? 50000, len = (nice / mpp) * sc;
      g.fillStyle = "rgba(255,255,255,.88)"; g.fillRect(10, H - 56, len + 20, 28); g.fillStyle = "#111"; g.fillRect(20, H - 38, len, 4); g.fillRect(20, H - 44, 2, 10); g.fillRect(20 + len - 2, H - 44, 2, 10);
      g.font = "12px sans-serif"; g.textAlign = "left"; g.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, 24, H - 46);
      g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, H - 20, W, 20); g.fillStyle = "#fff"; g.font = "11px sans-serif"; g.fillText(v.credit, 8, H - 6);
      cv.toBlob((blob) => { setBusy(false); if (blob) { setMsg(""); onShot(blob, NAMES[view] ?? "Map of the site"); } else setMsg("The screenshot could not be saved. Try another view."); }, "image/jpeg", 0.92);
    } catch { setBusy(false); setMsg("The map pictures could not be copied (browser block). Try the Satellite view, or take a normal screenshot and upload it."); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-card" data-testid="map-shot">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground"><MapPin className="h-4 w-4 text-primary" /> Map: pin the place and take a screenshot</h3>
        <button type="button" onClick={onClose} aria-label="Close map" className="rounded-full p-1.5 hover:bg-muted"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex flex-wrap gap-2 px-3 py-2">
        <form onSubmit={(e) => { e.preventDefault(); void go(q); }} className="flex min-w-[220px] flex-1 gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a place e.g. Makindu" className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <button disabled={busy} className="flex items-center gap-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"><Search className="h-4 w-4" /> Go</button>
        </form>
        <form onSubmit={(e) => { e.preventDefault(); goCoords(); }} className="flex min-w-[220px] flex-1 gap-2">
          <input value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="-3.53073, 38.32219" className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <button className="rounded-md border border-primary px-3 text-sm font-semibold text-primary">Go to coordinates</button>
        </form>
        <button type="button" onClick={here} disabled={busy} className="flex items-center gap-1 rounded-md border border-border px-3 text-sm font-semibold"><LocateFixed className="h-4 w-4" /> My location</button>
      </div>
      <div className="flex flex-wrap gap-2 px-3 pb-2">
        {Object.entries(LAYERS).map(([k, v]) => (
          <button key={k} type="button" onClick={() => setView(k)} className={`rounded-full border px-3 py-1 text-xs font-bold ${view === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>{v.label}</button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/40 p-2">
        <div className="relative overflow-hidden rounded-lg border-2 border-primary shadow-lg" style={{ aspectRatio: "16 / 10", width: "min(100%, max(75vw, 620px), calc((100vh - 250px) * 1.6))" }}>
          <div ref={box} className="absolute inset-0" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5">
        <span className="mr-auto text-xs text-muted-foreground">{msg || (centre ? `Pin: ${centre}` : "Tap the map to place the red pin. Drag it to move.")}</span>
        <button type="button" disabled={busy} onClick={() => { const c = pin.current?.getLatLng(); if (!c) { setMsg("Tap the map to place the red pin first."); return; } onUsePin(Math.round(c.lat * 1e5) / 1e5, Math.round(c.lng * 1e5) / 1e5); }} className="flex items-center gap-1 rounded-md border border-primary px-3 py-2 text-sm font-bold text-primary"><Check className="h-4 w-4" /> Use this pin for latitude and longitude</button>
        <button type="button" disabled={busy} onClick={() => void shot()} className="flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"><Camera className="h-4 w-4" /> Take screenshot</button>
      </div>
    </div>,
    document.body,
  );
}
