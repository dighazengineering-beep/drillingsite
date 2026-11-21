import { useEffect, useRef, useState } from "react";
import { MapPin, LocateFixed } from "lucide-react";

export interface Place { text: string; lat: number | null; lng: number | null }
/* eslint-disable @typescript-eslint/no-explicit-any */
let leaflet: Promise<any> | null = null;
// Leaflet (free map library) is loaded from a CDN only when the client opens the map, so the rest of the site stays light. If it cannot load, typing the place still works.
function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).L) return Promise.resolve((window as any).L);
  leaflet ??= new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = () => resolve((window as any).L);
    js.onerror = () => { leaflet = null; reject(new Error("map failed")); };
    document.head.appendChild(js);
  });
  return leaflet;
}
const KENYA: [number, number] = [-0.5, 37.9];
const inp = "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30";

/** Client says where the site is: tap the map to drop a pin, use the phone's location, or just type it. */
export default function LocationPicker({ value, onChange }: { value: Place; onChange: (p: Place) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const pin = useRef<any>(null);
  const cur = useRef(value);
  cur.current = value;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const place = (lat: number, lng: number, fly = false) => {
    const L = (window as any).L;
    if (!L || !map.current) return;
    if (pin.current) pin.current.setLatLng([lat, lng]); else pin.current = L.marker([lat, lng]).addTo(map.current);
    if (fly) map.current.setView([lat, lng], 15);
    onChange({ ...cur.current, lat: +lat.toFixed(6), lng: +lng.toFixed(6) });
  };

  useEffect(() => {
    if (!open || !box.current || map.current) return;
    let dead = false;
    loadLeaflet().then((L) => {
      if (dead || !box.current) return;
      const m = L.map(box.current).setView(cur.current.lat != null ? [cur.current.lat, cur.current.lng] : KENYA, cur.current.lat != null ? 15 : 6);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      m.on("click", (e: any) => place(e.latlng.lat, e.latlng.lng));
      map.current = m;
      if (cur.current.lat != null) place(cur.current.lat, cur.current.lng!);
      setTimeout(() => m.invalidateSize(), 100);
    }).catch(() => setNote("The map could not load. Please type the place instead."));
    return () => { dead = true; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { map.current?.remove(); map.current = null; pin.current = null; }, []);

  const locate = () => {
    setNote("");
    if (!navigator.geolocation) return setNote("This phone cannot share its location. Please pin the map or type the place.");
    setNote("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setNote("");
        if (map.current) place(p.coords.latitude, p.coords.longitude, true);
        else onChange({ ...cur.current, lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) });
      },
      () => setNote("Could not get your location. Allow location access, or pin the map or type the place."),
      { enableHighAccuracy: true, timeout: 15000 });
  };

  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground" htmlFor="lp-text">Where is the site?</label>
      <input id="lp-text" value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} className={inp} placeholder="Town, area, landmark or plot (e.g. Kitengela, near the market)" autoComplete="street-address" data-testid="input-quote-location" />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={locate} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold text-primary" data-testid="button-use-location"><LocateFixed className="h-3.5 w-3.5" /> Use my current location</button>
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold text-primary" data-testid="button-pin-map"><MapPin className="h-3.5 w-3.5" /> {open ? "Hide map" : "Pin on the map"}</button>
      </div>
      {open && <div ref={box} className="mt-2 h-60 w-full overflow-hidden rounded-xl border border-border" data-testid="quote-map" />}
      {open && <p className="mt-1 text-[11px] text-muted-foreground">Tap the map where the borehole will be.</p>}
      {value.lat != null && <p className="mt-1 text-[11px] font-semibold text-emerald-700">Pin saved ({value.lat}, {value.lng}) · <button type="button" className="underline" onClick={() => { pin.current?.remove(); pin.current = null; onChange({ ...value, lat: null, lng: null }); }}>remove</button></p>}
      {note && <p className="mt-1 text-[11px] font-semibold text-sky-700" role="status">{note}</p>}
    </div>
  );
}
