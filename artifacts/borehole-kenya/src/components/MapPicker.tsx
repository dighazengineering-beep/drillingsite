import { useEffect, useRef, useState } from "react";
import { X, LocateFixed, Search, Check, MapPin } from "lucide-react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Full-screen map to pick where the work was done. Drag the map so the pin sits on the spot, or jump to your own location,
 * or search a place name. Free OpenStreetMap map, no key needed.
 */
export default function MapPicker({ initial, query, onClose, onConfirm }: {
  initial: { lat: number; lng: number } | null;
  query: string;
  onClose: () => void;
  onConfirm: (lat: number, lng: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [q, setQ] = useState(query);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ke&accept-language=en&q=${encodeURIComponent(text)}`);
      const d = (await r.json()) as { lat: string; lon: string }[];
      if (d[0]) map.current?.setView([Number(d[0].lat), Number(d[0].lon)], 15);
      else setMsg("Could not find that place. Drag the map to it instead.");
    } catch { setMsg("Search needs internet. Drag the map to the spot instead."); }
    setBusy(false);
  };

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(initial ? [initial.lat, initial.lng] : [0.4, 37.9], initial ? 16 : 6);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    map.current = m;
    const t = window.setTimeout(() => m.invalidateSize(), 120);
    if (!initial && query.trim()) void go(query);
    return () => { window.clearTimeout(t); m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const here = () => {
    if (!navigator.geolocation) { setMsg("This phone cannot share its location."); return; }
    setBusy(true); setMsg("");
    navigator.geolocation.getCurrentPosition(
      (p) => { map.current?.setView([p.coords.latitude, p.coords.longitude], 17); setBusy(false); },
      () => { setMsg("Could not get the location. Allow location access, or drag the map."); setBusy(false); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const confirm = () => {
    const c = map.current?.getCenter();
    if (!c) return;
    if (map.current!.getZoom() < 11) { setMsg("Zoom in closer so the pin is on the right place."); return; }
    onConfirm(Math.round(c.lat * 1e5) / 1e5, Math.round(c.lng * 1e5) / 1e5);
  };

  // Rendered on the page itself, not inside the upload form, so its Go button never submits the form
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-card" data-testid="map-picker">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground"><MapPin className="h-4 w-4 text-primary" /> Pick the place on the map</h3>
        <button type="button" onClick={onClose} aria-label="Close map" className="rounded-full p-1.5 hover:bg-muted"><X className="h-5 w-5" /></button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void go(q); }} className="flex gap-2 px-3 py-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a place e.g. Makindu"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        <button disabled={busy} className="flex items-center gap-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"><Search className="h-4 w-4" /> Go</button>
      </form>
      <div className="relative min-h-0 flex-1">
        <div ref={box} className="absolute inset-0" />
        {/* The pin stays in the middle; you move the map underneath it */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full">
          <svg width="36" height="46" viewBox="0 0 36 46" aria-hidden="true">
            <path d="M18 45C18 45 3 28.5 3 17a15 15 0 0 1 30 0c0 11.5-15 28-15 28z" fill="#dc2626" stroke="#fff" strokeWidth="2.5" />
            <circle cx="18" cy="17" r="5.5" fill="#fff" />
          </svg>
        </div>
        <button type="button" onClick={here} disabled={busy} aria-label="Go to my location"
          className="absolute bottom-4 right-3 z-[600] flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900 shadow-lg disabled:opacity-60">
          <LocateFixed className="h-4 w-4 text-primary" /> My location
        </button>
      </div>
      <div className="space-y-1.5 border-t border-border px-3 py-2.5">
        {msg && <p className="text-xs text-red-600">{msg}</p>}
        <p className="text-xs text-muted-foreground">Drag the map until the red pin is on the exact spot.</p>
        <button type="button" onClick={confirm} data-testid="map-confirm"
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground"><Check className="h-4 w-4" /> Use this place</button>
      </div>
    </div>,
    document.body,
  );
}
