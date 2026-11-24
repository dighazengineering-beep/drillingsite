import { ReasonPicker, RecommendToggle, POINT_YES, POINT_NO } from "@/components/ReasonPicker";
import { LiveReport } from "@/pages/Report";
import { lazy, Suspense } from "react";
const MapShot = lazy(() => import("./MapShot"));
import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneField } from "@/components/PhoneField";
import { DateSelect } from "@/components/DateSelect";
import { FileText, Plus, Trash2, Upload, Sparkles, Download, ArrowLeft, Loader2, ImageIcon } from "lucide-react";
import { API } from "@/lib/member";
import { GoogleFill } from "@/components/GoogleFill";
import { MapBoundary } from "@/components/MapBoundary";

type Cal = { y1: number; d1: number; y2: number; d2: number; stationX: number; plot: { x0: number; x1: number; y0: number; y1: number } };
interface Pick { fileId: number; station: string; recommended: boolean; reason: string; yieldText: string; zoneFrom: number; zoneTo: number; cal?: Cal; note?: string; confidence?: string }
interface Layer { from: number; to: number; label: string; kind: string }
type D = Record<string, any> & { picks?: Pick[]; layers?: Layer[] };
interface F { id: number; kind: string; name: string; w: number; h: number }
interface Row { id: number; title: string; ref_no?: string; status: string; progress: string; updated_at: string; has_doc: boolean; owner_phone?: string; released?: boolean }

const inp = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
const lab = "mb-1 block text-xs font-semibold text-muted-foreground";
const box = "rounded-2xl border border-border bg-card p-4 shadow-sm";
const INSTRUMENTS = ["ADMT-600SX-32D", "ADMT-600S-X", "PQWT-500S"];
const ORD = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"];

type Fx = { bright: number; contrast: number; sat: number; gray: boolean; sharp: number };
/** brightness / contrast / saturation / black-and-white / sharpness, applied to the pixels of a canvas */
function applyFx(cv: HTMLCanvasElement, fx: Fx) {
  const g = cv.getContext("2d")!; const im = g.getImageData(0, 0, cv.width, cv.height); const a = im.data;
  const c = fx.contrast * 2.55, f = (259 * (c + 255)) / (255 * (259 - c)), add = fx.bright * 2.55, s = fx.sat / 100;
  for (let i = 0; i < a.length; i += 4) {
    let r = a[i]!, gg = a[i + 1]!, b = a[i + 2]!; const l = 0.299 * r + 0.587 * gg + 0.114 * b;
    if (fx.gray) { r = gg = b = l; } else if (s !== 1) { r = l + (r - l) * s; gg = l + (gg - l) * s; b = l + (b - l) * s; }
    a[i] = f * (r + add - 128) + 128; a[i + 1] = f * (gg + add - 128) + 128; a[i + 2] = f * (b + add - 128) + 128;
  }
  if (fx.sharp > 0) {
    const k = fx.sharp / 50, W = cv.width, H = cv.height, src = new Uint8ClampedArray(a);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const o = (y * W + x) * 4; for (let ch = 0; ch < 3; ch++) { const v = src[o + ch]! * (1 + 4 * k) - k * (src[o - 4 + ch]! + src[o + 4 + ch]! + src[o - W * 4 + ch]! + src[o + W * 4 + ch]!); a[o + ch] = v; } }
  }
  g.putImageData(im, 0, 0);
}

/** Edit a picture: crop, rotate, flip, brightness, contrast, colour, black and white, sharpness. */
function PicEditor({ src, title, onCancel, onDone }: { src: string; title: string; onCancel: () => void; onDone: (blob: Blob) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rot, setRot] = useState(0); const [flip, setFlip] = useState(false);
  const [fx, setFx] = useState<Fx>({ bright: 0, contrast: 0, sat: 100, gray: false, sharp: 0 });
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 1, h: 1 }); // fractions of the rotated picture
  const view = useRef<HTMLCanvasElement>(null); const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: string; px: number; py: number; c: typeof crop } | null>(null);
  useEffect(() => { const i = new Image(); i.onload = () => setImg(i); i.src = src; }, [src]);
  const rotated = useCallback((max: number) => {
    if (!img) return null; const q = rot % 180 !== 0; const k = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * k), h = Math.round(img.height * k); const cv = document.createElement("canvas"); cv.width = q ? h : w; cv.height = q ? w : h;
    const g = cv.getContext("2d")!; g.translate(cv.width / 2, cv.height / 2); g.rotate((rot * Math.PI) / 180); if (flip) g.scale(-1, 1); g.drawImage(img, -w / 2, -h / 2, w, h); return cv;
  }, [img, rot, flip]);
  useEffect(() => { // the preview: the whole picture with the tools applied, the crop frame on top
    const v = view.current; const r = rotated(900); if (!v || !r) return; v.width = r.width; v.height = r.height; v.getContext("2d")!.drawImage(r, 0, 0); applyFx(v, fx);
  }, [rotated, fx]);
  const pt = (e: React.PointerEvent) => { const b = wrap.current!.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height }; };
  const start = (mode: string) => (e: React.PointerEvent) => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); const p = pt(e); drag.current = { mode, px: p.x, py: p.y, c: crop }; };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return; const p = pt(e); const dx = p.x - d.px, dy = p.y - d.py; let { x, y, w, h } = d.c; const MIN = 0.05;
    if (d.mode === "move") { x = Math.min(Math.max(0, x + dx), 1 - w); y = Math.min(Math.max(0, y + dy), 1 - h); }
    else {
      if (d.mode.includes("l")) { const nx = Math.min(Math.max(0, x + dx), x + w - MIN); w = x + w - nx; x = nx; }
      if (d.mode.includes("r")) w = Math.min(Math.max(MIN, w + dx), 1 - x);
      if (d.mode.includes("t")) { const ny = Math.min(Math.max(0, y + dy), y + h - MIN); h = y + h - ny; y = ny; }
      if (d.mode.includes("b")) h = Math.min(Math.max(MIN, h + dy), 1 - y);
    }
    setCrop({ x, y, w, h });
  };
  const save = () => {
    const r = rotated(4000); if (!r) return; const sx = Math.round(crop.x * r.width), sy = Math.round(crop.y * r.height), sw = Math.max(1, Math.round(crop.w * r.width)), sh = Math.max(1, Math.round(crop.h * r.height));
    const out = document.createElement("canvas"); out.width = sw; out.height = sh; out.getContext("2d")!.drawImage(r, sx, sy, sw, sh, 0, 0, sw, sh); applyFx(out, fx);
    out.toBlob((b) => { if (b) onDone(b); }, "image/png");
  };
  const turn = () => { setRot((r) => (r + 90) % 360); setCrop({ x: 0, y: 0, w: 1, h: 1 }); };
  const slider = (label: string, k: "bright" | "contrast" | "sat" | "sharp", min: number, max: number) => (
    <label className="block text-xs font-semibold text-foreground">{label} <span className="text-muted-foreground">{fx[k]}</span>
      <input type="range" min={min} max={max} value={fx[k]} onChange={(e) => setFx((o) => ({ ...o, [k]: Number(e.target.value) }))} className="w-full" /></label>
  );
  const handle = (m: string, cls: string) => <div onPointerDown={start(m)} className={`absolute h-4 w-4 rounded-sm border-2 border-white bg-primary ${cls}`} style={{ touchAction: "none" }} />;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3">
      <div className="w-full max-w-4xl space-y-3 rounded-2xl bg-background p-4">
        <p className="text-sm font-bold text-foreground">Edit picture: {title}</p>
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="flex items-center justify-center rounded-xl bg-neutral-200 p-2 dark:bg-neutral-800">
            <div ref={wrap} className="relative inline-block max-w-full select-none" onPointerMove={move} onPointerUp={() => { drag.current = null; }} style={{ touchAction: "none" }}>
              <canvas ref={view} className="block max-h-[60vh] max-w-full" />
              <div className="pointer-events-none absolute inset-0 bg-black/45" style={{ clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${crop.x * 100}% ${crop.y * 100}%,${crop.x * 100}% ${(crop.y + crop.h) * 100}%,${(crop.x + crop.w) * 100}% ${(crop.y + crop.h) * 100}%,${(crop.x + crop.w) * 100}% ${crop.y * 100}%,${crop.x * 100}% ${crop.y * 100}%)` }} />
              <div onPointerDown={start("move")} className="absolute cursor-move border-2 border-dashed border-white" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%`, touchAction: "none" }}>
                {handle("tl", "-left-2 -top-2 cursor-nwse-resize")}{handle("tr", "-right-2 -top-2 cursor-nesw-resize")}{handle("bl", "-bottom-2 -left-2 cursor-nesw-resize")}{handle("br", "-bottom-2 -right-2 cursor-nwse-resize")}
              </div>
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-1.5 text-[11px] font-bold">
              <button onClick={turn} className="rounded-lg border border-border px-2 py-1.5 text-foreground">Rotate 90°</button>
              <button onClick={() => setFlip((f) => !f)} className="rounded-lg border border-border px-2 py-1.5 text-foreground">Flip</button>
              <button onClick={() => setCrop({ x: 0, y: 0, w: 1, h: 1 })} className="rounded-lg border border-border px-2 py-1.5 text-foreground">Reset crop</button>
            </div>
            {slider("Brightness", "bright", -100, 100)}{slider("Contrast", "contrast", -100, 100)}{slider("Colour", "sat", 0, 200)}{slider("Sharpness", "sharp", 0, 100)}
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground"><input type="checkbox" checked={fx.gray} onChange={(e) => setFx((o) => ({ ...o, gray: e.target.checked }))} /> Black and white</label>
            <button onClick={() => { setFx({ bright: 0, contrast: 0, sat: 100, gray: false, sharp: 0 }); setRot(0); setFlip(false); setCrop({ x: 0, y: 0, w: 1, h: 1 }); }} className="w-full rounded-lg border border-border px-2 py-1.5 text-[11px] font-bold text-foreground">Undo all</button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Drag the frame to move the crop, drag its corners to resize it. Saving replaces the picture.</p>
        <div className="flex justify-end gap-2"><button onClick={onCancel} className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-foreground">Cancel</button><button onClick={save} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Save picture</button></div>
      </div>
    </div>
  );
}

/** Zoom and move a map screenshot (aerial view) to the best framing, then save the framed picture. */
function MapCropper({ src, name: n0, onCancel, onDone }: { src: string; name: string; onCancel: () => void; onDone: (blob: Blob, name: string) => void }) {
  const box = useRef<HTMLDivElement>(null); const [im, setIm] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1); const [c, setC] = useState<{ x: number; y: number } | null>(null); const [vw, setVw] = useState(640); const [name, setName] = useState(n0);
  const drag = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);
  const VH = (w: number) => w * 0.625; // 16:10
  useEffect(() => { const i = new Image(); i.onload = () => { setIm(i); setC({ x: i.width / 2, y: i.height / 2 }); }; i.src = src; }, [src]);
  useEffect(() => { const el = box.current; if (!el) return; const f = () => setVw(el.clientWidth || 640); f(); const o = new ResizeObserver(f); o.observe(el); return () => o.disconnect(); }, []);
  if (!im || !c) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>;
  const vh = VH(vw); const base = Math.min(vw / im.width, vh / im.height); const sc = base * zoom;
  const clamp = (x: number, y: number) => ({ x: im.width * sc <= vw ? im.width / 2 : Math.min(Math.max(x, vw / 2 / sc), im.width - vw / 2 / sc), y: im.height * sc <= vh ? im.height / 2 : Math.min(Math.max(y, vh / 2 / sc), im.height - vh / 2 / sc) });
  const cc = clamp(c.x, c.y);
  const save = () => {
    const W = 1600, H = 1000, k = W / vw; const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d")!;
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); g.imageSmoothingQuality = "high";
    g.drawImage(im, (vw / 2 - cc.x * sc) * k, (vh / 2 - cc.y * sc) * k, im.width * sc * k, im.height * sc * k);
    cv.toBlob((b) => { if (b) onDone(b, name); }, "image/jpeg", 0.92);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div className="w-full max-w-3xl space-y-3 rounded-2xl bg-background p-4">
        <p className="text-sm font-bold text-foreground">Frame the map: drag to move, slide or scroll to zoom</p>
        <div ref={box} className="relative w-full select-none overflow-hidden rounded-xl border border-border bg-white" style={{ height: vh, touchAction: "none", cursor: "grab" }}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, cx: cc.x, cy: cc.y }; }}
          onPointerMove={(e) => { const d = drag.current; if (d) setC(clamp(d.cx - (e.clientX - d.px) / sc, d.cy - (e.clientY - d.py) / sc)); }}
          onPointerUp={() => { drag.current = null; }}
          onWheel={(e) => setZoom((z) => Math.min(12, Math.max(1, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))))}>
          <img src={src} alt="" draggable={false} style={{ position: "absolute", left: vw / 2 - cc.x * sc, top: vh / 2 - cc.y * sc, width: im.width * sc, height: im.height * sc, maxWidth: "none" }} />
        </div>
        <div className="flex items-center gap-3"><span className="text-xs font-semibold text-foreground">Zoom</span><input type="range" min={1} max={12} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1" /><span className="w-10 text-right text-xs text-muted-foreground">{zoom.toFixed(1)}x</span></div>
        <select value="" onChange={(e) => e.target.value && setName(e.target.value)} className="mb-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
          <option value="">Choose the map name (decides where it goes in the report)…</option>
          <option>Aerial view of the site</option>
          <option>Aerial (satellite) view of the site</option>
          <option>Street map of the site area</option>
          <option>Terrain (topographic) map of the site area</option>
          <option>Recommended borehole position map</option>
          <option>Regional location map</option>
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Map name (e.g. Aerial view of the site)" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
        <div className="flex justify-end gap-2"><button onClick={onCancel} className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-foreground">Cancel</button><button disabled={!name.trim()} onClick={save} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">Save map</button></div>
      </div>
    </div>
  );
}

export default function ReportsAdmin({ adminKey, onBadAdmin }: { adminKey: string; onBadAdmin: () => void }) {
  const h = { "x-admin-key": adminKey };
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ai, setAi] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<{ id: number; name: string; phone: string; email: string; where: string; siteRef: string; pics: number; updatedAt: string }[]>([]);

  const load = useCallback(() => fetch(`${API}/api/reports`, { headers: h }).then((r) => { if (r.status === 401 || r.status === 403) { onBadAdmin(); throw new Error("auth"); } return r.json(); }).then((d) => { setRows(d.reports ?? []); setAi(!!d.ai); }).catch(() => setRows((x) => x ?? [])), [adminKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); fetch(`${API}/api/reports/unfinished`, { headers: h }).then((r) => r.json()).then((d) => setDrafts(d.drafts ?? [])).catch(() => {}); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  if (open !== null) return <Editor id={open} adminKey={adminKey} ai={ai} back={() => { setOpen(null); load(); }} />;
  const create = async () => {
    const r = await fetch(`${API}/api/reports`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ data: { instrument: INSTRUMENTS[2], company: "Dighaz Engineering Limited" } }) });
    const d = await r.json(); if (d.id) setOpen(d.id);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-bold text-foreground">Reports</h2><p className="text-xs text-muted-foreground">Hydrogeological survey reports written from your survey data, as a Word file.</p></div>
        <button onClick={create} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><Plus className="h-4 w-4" /> New report</button>
      </div>
      {!ai && <p className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-foreground">The AI key is not set on the server yet (ANTHROPIC_API_KEY on Render). You can fill in the form, but reading pictures and writing the report need it.</p>}
      {drafts.length > 0 && (
        <div className={`${box} space-y-2`}>
          <h3 className="text-sm font-bold text-foreground">Started by clients, not generated yet ({drafts.length})</h3>
          {drafts.map((x) => (
            <button key={x.id} onClick={() => setOpen(x.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-left transition hover:border-primary/50">
              <span className="min-w-0"><span className="block truncate text-sm font-bold text-foreground">{x.name || "(no name yet)"}{x.phone ? ` · ${x.phone}` : ""}</span>
                <span className="block truncate text-xs text-muted-foreground">{[x.where, x.siteRef, x.email].filter(Boolean).join(" · ") || "No site details yet"} · {x.pics} picture{x.pics === 1 ? "" : "s"}</span></span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{new Date(x.updatedAt).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </button>
          ))}
        </div>
      )}
      {rows === null ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className={`${box} text-sm text-muted-foreground`}>No reports yet. Tap “New report”.</p> : (
        <div className="space-y-2">
          {rows.map((r) => (
            <button key={r.id} onClick={() => setOpen(r.id)} className={`${box} flex w-full items-center justify-between text-left transition hover:border-primary/50`}>
              <span className="flex items-center gap-3"><FileText className="h-5 w-5 text-primary" /><span><span className="block text-sm font-bold text-foreground">{r.title || "Untitled"}{r.ref_no ? <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">{r.ref_no}</span> : null}</span><span className="text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleString()}{r.owner_phone ? ` · client ${r.owner_phone}` : ""}</span></span></span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.status === "review" && !r.released ? "bg-sky-500/20 text-sky-800 dark:text-sky-200" : r.status === "done" || r.status === "review" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : r.status === "failed" ? "bg-red-500/15 text-red-700 dark:text-red-300" : r.status === "working" ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "bg-muted text-muted-foreground"}`}>{r.status === "review" ? (r.released ? "Released" : "Needs review") : r.status === "done" ? "Ready" : r.status === "working" ? "Writing…" : r.status === "failed" ? "Failed" : "Draft"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Send the finished report to a client who paid you (cash, M-Pesa, bank...): one link, no login. The client downloads the report PDF and gets a receipt PDF with it. */
function SendLink({ id, h }: { id: number; h: Record<string, string> }) {
  const [f, setF] = useState({ amount: "", method: "cash", reference: "", payerName: "", payerPhone: "", paidAt: "" });
  const [text, setText] = useState(""); const [busy, setBusy] = useState(""); const [msg, setMsg] = useState("");
  const [links, setLinks] = useState<{ token: string; url: string; receiptNo: string; amount: number; method: string; active: boolean; opened: number }[]>([]);
  const load = useCallback(() => fetch(`${API}/api/report-links/by-report/${id}`, { headers: h }).then((r) => r.json()).then((j) => setLinks(j.links ?? [])).catch(() => {}), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  const fill = (j: any) => setF((x) => ({ ...x, amount: j.amount ? String(j.amount) : x.amount, method: j.method && j.method !== "other" ? j.method : x.method, reference: j.reference || x.reference, payerName: j.payerName || x.payerName, payerPhone: j.payerPhone || x.payerPhone, paidAt: j.paidAt || x.paidAt }));
  const read = async (body: BodyInit, type: string) => {
    setBusy("read"); setMsg("Reading the message…");
    try { const r = await fetch(`${API}/api/report-links-read`, { method: "POST", headers: { ...h, "content-type": type }, body }); const j = await r.json(); if (!r.ok) setMsg(j.error ?? "Could not read it."); else { fill(j); setMsg("Details filled in. Check them, then create the link."); } }
    catch { setMsg("Could not reach the server."); } setBusy("");
  };
  const create = async () => {
    setBusy("make"); setMsg("");
    try { const r = await fetch(`${API}/api/report-links`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ reportId: id, ...f, amount: Number(f.amount.replace(/,/g, "")) }) }); const j = await r.json();
      if (!r.ok) setMsg(j.error ?? "Could not make the link."); else { setMsg(`Link ready. Receipt ${j.receiptNo}.`); setF({ amount: "", method: "cash", reference: "", payerName: "", payerPhone: "", paidAt: "" }); setText(""); void load(); try { await navigator.clipboard.writeText(j.url); setMsg(`Link ready and copied. Receipt ${j.receiptNo}.`); } catch { /* copy blocked */ } } }
    catch { setMsg("Could not reach the server."); } setBusy("");
  };
  const flip = async (t: string, active: boolean) => { await fetch(`${API}/api/report-links/${t}/active`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ active }) }); void load(); };
  const inp = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
  return (
    <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
      <h4 className="text-sm font-bold text-foreground">Send to a client who paid you</h4>
      <p className="mb-2 text-xs text-muted-foreground">Making the link means the client has paid. They open it, tap one button, and the report PDF and a receipt PDF download. The link never expires.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="Amount paid (KSh), e.g. 1000" className={inp} />
        <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} className={inp}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank / PayPal / other</option><option value="cheque">Cheque</option></select>
        {f.method !== "cash" && <input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Transaction code / reference" className={inp} />}
        <input value={f.payerName} onChange={(e) => setF({ ...f, payerName: e.target.value })} placeholder="Client name on the receipt (blank = report's client)" className={inp} />
      </div>
      {f.method !== "cash" && <div className="mt-2 rounded-lg bg-background/60 p-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Paste the M-Pesa / PayPal message here, or upload its screenshot" className={inp} />
        <div className="mt-1.5 flex flex-wrap gap-2">
          <button type="button" disabled={!text.trim() || !!busy} onClick={() => void read(JSON.stringify({ text }), "application/json")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground">Read the pasted message</button>
          <label className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground">Upload screenshot<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void read(file, file.type); }} /></label>
        </div>
      </div>}
      <button type="button" disabled={!!busy || !f.amount.trim()} onClick={() => void create()} className="mt-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy === "make" ? "Making…" : "Create download link"}</button>
      {msg && <p className="mt-2 text-xs text-foreground">{msg}</p>}
      {links.length > 0 && <div className="mt-3 space-y-2">{links.map((l) => (
        <div key={l.token} className="rounded-lg border border-border bg-background p-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-foreground">{l.receiptNo} · KSh {Math.round(l.amount).toLocaleString("en-KE")} · {l.method} · opened {l.opened}×</span><span className={l.active ? "text-emerald-600" : "text-red-600"}>{l.active ? "On" : "Off"}</span></div>
          <div className="mt-1 break-all text-muted-foreground">{l.url}</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" onClick={() => void navigator.clipboard.writeText(l.url).then(() => setMsg("Link copied."))} className="rounded-md border border-border px-2 py-1 font-bold">Copy link</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`Your survey report is ready. Download it here: ${l.url}`)}`} target="_blank" rel="noreferrer" className="rounded-md border border-border px-2 py-1 font-bold">Send on WhatsApp</a>
            <button type="button" onClick={() => void flip(l.token, !l.active)} className="rounded-md border border-border px-2 py-1 font-bold">{l.active ? "Switch off" : "Switch on"}</button>
          </div>
        </div>))}</div>}
    </div>
  );
}

function Editor({ id, adminKey, ai, back }: { id: number; adminKey: string; ai: boolean; back: () => void }) {
  const h = { "x-admin-key": adminKey };
  const [d, setD] = useState<D>({});
  const [files, setFiles] = useState<F[]>([]);
  const [st, setSt] = useState({ status: "draft", progress: "", error: "", has: false, owner: "", released: false });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const dirty = useRef(false);
  // Project ID: made automatically as soon as the county is known; it stays editable.
  useEffect(() => {
    const county = String(d.county ?? "").trim();
    if (!county || String(d.projectId ?? "").trim()) return;
    let off = false;
    fetch(`${API}/api/reports/${id}/ref?county=${encodeURIComponent(county)}`, { headers: h }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (!off && j?.ref) { dirty.current = true; setD((x) => (String(x.projectId ?? "").trim() ? x : { ...x, projectId: j.ref })); } }).catch(() => {});
    return () => { off = true; };
  }, [d.county, d.projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Fills the empty boxes from what the same email typed in earlier reports. */
  const fillEmpty = (data: Record<string, string>) => { dirty.current = true; setD((x) => { const n: Record<string, unknown> = { ...x }; for (const [k, v] of Object.entries(data)) if (v && !String(n[k] ?? "").trim()) n[k] = v; return n as typeof x; }); };
  const fromEmail = async (email: string) => { if (!/.+@.+\..+/.test(email)) return; try { const r = await fetch(`${API}/api/reports/prefill?email=${encodeURIComponent(email)}`, { headers: h }); if (r.ok) fillEmpty((await r.json()).data ?? {}); } catch { /* optional */ } };
  const set = (k: string, v: unknown) => { dirty.current = true; setD((x) => ({ ...x, [k]: v })); };

  const load = useCallback(async (keepForm = false) => {
    const r = await fetch(`${API}/api/reports/${id}`, { headers: h }); const j = await r.json();
    if (!j.report) return;
    if (!keepForm) setD(j.report.data ?? {});
    setFiles(j.files ?? []); setSt({ status: j.report.status, progress: j.report.progress, error: j.report.error, has: j.report.has_doc, owner: j.report.owner_phone ?? "", released: !!j.report.released });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (st.status !== "working") return; const t = setInterval(() => void load(true), 4000); return () => clearInterval(t); }, [st.status, load]);

  const save = async (data = d) => { await fetch(`${API}/api/reports/${id}`, { method: "PUT", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ data }) }); dirty.current = false; };
  const upload = async (file: File, kind: string, name = "") => {
    const r = await fetch(`${API}/api/reports/${id}/files?kind=${kind}&name=${encodeURIComponent(name)}`, { method: "POST", headers: { ...h, "content-type": file.type || "image/png" }, body: file });
    const j = await r.json(); if (!r.ok) { setMsg(j.error || "Upload failed"); return null; } await load(true); return j.id as number;
  };
  /** Move a picture to the right place. Leaving "machine screenshot" drops its point; entering it adds a point to fill in. */
  const moveFile = async (fid: number, kind: string, from: string) => {
    const name = kind === "map" ? prompt("Name this map", "Site location map") ?? "" : "";
    if (kind === "map" && !name) return;
    const r = await fetch(`${API}/api/reports/${id}/files/${fid}`, { method: "PATCH", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ kind, name }) });
    if (!r.ok) { setMsg("Could not move the picture."); return; }
    if (from === "section") set("picks", (d.picks ?? []).filter((p) => p.fileId !== fid));
    if (kind === "section") set("picks", [...(d.picks ?? []), { fileId: fid, station: "", recommended: false, reason: "", yieldText: "", zoneFrom: 0, zoneTo: 0 }]);
    await load(true);
  };
  const MoveSel = ({ fid, from }: { fid: number; from: string }) => (
    <select value="" onChange={(e) => e.target.value && void moveFile(fid, e.target.value, from)} className="mt-1 w-full rounded-lg border border-border bg-background px-1.5 py-1 text-[11px] text-foreground">
      <option value="">Move to…</option>
      {[["section", "Machine screenshot"], ["location", "Location picture"], ["photo", "Field photo"], ["map", "Map"]].filter(([k]) => k !== from).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
  const [crop, setCrop] = useState<{ src: string; name: string; replace?: number } | null>(null);
  const [mapOpen, setMapOpen] = useState(false); const [locMsg, setLocMsg] = useState("");
  const useMyLocation = () => {
    if (!navigator.geolocation) { setLocMsg("This device cannot share its location."); return; }
    setLocMsg("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => { set("lat", String(Math.round(p.coords.latitude * 1e5) / 1e5)); set("lng", String(Math.round(p.coords.longitude * 1e5) / 1e5)); setLocMsg("Location added."); },
      () => setLocMsg("Could not get the location. Allow location access, or type the coordinates."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const saveCrop = async (blob: Blob, name: string) => {
    const old = crop?.replace; if (crop && !crop.replace) URL.revokeObjectURL(crop.src); setCrop(null);
    const nid = await upload(new File([blob], "map.jpg", { type: "image/jpeg" }), "map", name);
    if (nid && old) await fetch(`${API}/api/reports/${id}/files/${old}`, { method: "DELETE", headers: h });
    await load(true);
  };
  const [edit, setEdit] = useState<{ fid: number; kind: string; title: string } | null>(null);
  const saveEdit = async (blob: Blob) => {
    if (!edit) return; const { fid, kind } = edit; setEdit(null);
    const r = await fetch(`${API}/api/reports/${id}/files/${fid}`, { method: "PUT", headers: { ...h, "content-type": "image/png" }, body: blob });
    if (!r.ok) { setMsg("Could not save the edited picture."); return; }
    if (kind === "section") set("picks", (d.picks ?? []).map((p) => (p.fileId === fid ? { ...p, cal: undefined } : p)));   // the picture changed, so its depth scale must be read again
    setBlobs((b) => { const n = { ...b }; delete n[fid]; return n; }); await load(true);
  };
  const EditBtn = ({ fid, kind, title }: { fid: number; kind: string; title: string }) => (
    <button onClick={() => setEdit({ fid, kind, title })} className="mt-1 w-full rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-foreground">Edit picture</button>
  );
  const delFile = async (fid: number) => { await fetch(`${API}/api/reports/${id}/files/${fid}`, { method: "DELETE", headers: h }); await load(true); };

  const picks = d.picks ?? [];
  const setPick = (i: number, patch: Partial<Pick>) => { dirty.current = true; setD((x) => ({ ...x, picks: (x.picks ?? []).map((p, j) => (j === i ? { ...p, ...patch } : p)) })); };
  const addSection = async (file: File) => {
    const fid = await upload(file, "section"); if (!fid) return;
    const p: Pick = { fileId: fid, station: "", recommended: !(d.picks ?? []).some((x) => x.recommended), reason: "", yieldText: "", zoneFrom: 0, zoneTo: 0 };
    set("picks", [...(d.picks ?? []), p]);
  };
  const analyse = async (i: number) => {
    const p = picks[i]!; if (!p.station) { setMsg("Type the station number first (the number on the horizontal axis)."); return; }
    setBusy(`an${i}`); setMsg("");
    try {
      const r = await fetch(`${API}/api/reports/${id}/analyse`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ fileId: p.fileId, station: p.station, instrument: d.instrument }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "The AI could not read the picture");
      const z = j.reading.zones?.[0];
      setPick(i, { cal: j.reading.cal, zoneFrom: p.zoneFrom && p.zoneTo ? p.zoneFrom : (z?.from ?? p.zoneFrom), zoneTo: p.zoneFrom && p.zoneTo ? p.zoneTo : (z?.to ?? p.zoneTo), note: [z?.note, j.reading.scaleNote].filter(Boolean).join(" | "), confidence: j.reading.confidence });
      setMsg(`AI read the picture (confidence: ${j.reading.confidence}). The depths the client typed were kept; only empty boxes were filled. Check the preview.`);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(""); }
  };
  const [prev, setPrev] = useState<{ i: number; url: string } | null>(null);
  const preview = async (i: number) => {
    const p = picks[i]!; if (!p.cal) { setMsg("Run “Read with AI” first, or fill the calibration numbers."); return; }
    setBusy(`pv${i}`);
    try {
      await save();
      const r = await fetch(`${API}/api/reports/${id}/preview`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(p) });
      if (!r.ok) throw new Error((await r.json()).error || "Preview failed");
      setPrev({ i, url: URL.createObjectURL(await r.blob()) });
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(""); }
  };
  const generate = async (refresh = false) => {
    setMsg(""); setBusy("gen");
    try {
      await save();
      const r = await fetch(`${API}/api/reports/${id}/generate`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ refreshFacts: refresh }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not start");
      setSt((s) => ({ ...s, status: "working", progress: "Starting…" }));
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(""); }
  };
  const download = async () => {
    let r: Response; try { r = await fetch(`${API}/api/reports/${id}/download`, { headers: h }); } catch { setMsg("Download could not start (network or server error)."); return; } if (!r.ok) { setMsg(r.status === 404 ? "Not generated yet" : `Download failed (error ${r.status}). Try again in a minute.`); return; }
    const b = await r.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `Hydrogeological Survey Report - ${d.siteRef || d.clientName || id}.docx`; a.click();
  };
  const release = async (on: boolean) => { await fetch(`${API}/api/reports/${id}/release`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ released: on }) }); setMsg(on ? "Released. The client was sent an SMS." : "Withdrawn from the client."); await load(true); };
  const remove = async () => { if (!confirm("Delete this report and its pictures?")) return; await fetch(`${API}/api/reports/${id}`, { method: "DELETE", headers: h }); back(); };

  const SEL = (k: string, label: string, opts: string[], ph: string) => (
    <div><label className={lab}>{label}</label>
      <select className={inp} value={!d[k] ? "" : opts.includes(d[k]!) ? d[k] : "__other"} onChange={(e) => set(k, e.target.value === "__other" ? " " : e.target.value)}>
        <option value="">Choose…</option>{opts.map((x) => <option key={x}>{x}</option>)}<option value="__other">Other (type it)</option></select>
      {d[k] && !opts.includes(d[k]!) && <input className={`${inp} mt-1.5`} value={d[k]!.trim() === "" ? "" : d[k]} placeholder={ph} onChange={(e) => set(k, e.target.value || " ")} />}
    </div>);
  const T = (k: string, label: string, ph = "", type = "text") => (<div><label className={lab}>{label}</label><input className={inp} type={type} value={d[k] ?? ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} /></div>);
  const fileInput = (accept: string, onFile: (f: File) => void, text: string) => (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-bold text-primary"><Upload className="h-4 w-4" /> {text}<input type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} /></label>
  );
  const of = (kind: string) => files.filter((f) => f.kind === kind);
  const thumb = (f: F) => <img key={f.id} src={`${API}/api/reports/${id}/files/${f.id}?k=${encodeURIComponent(adminKey)}`} alt="" className="hidden" />;
  void thumb;

  // pictures need the admin key header, so show them from blob URLs
  const [blobs, setBlobs] = useState<Record<number, string>>({});
  useEffect(() => { files.forEach(async (f) => { if (blobs[f.id]) return; const r = await fetch(`${API}/api/reports/${id}/files/${f.id}`, { headers: h }); if (r.ok) { const u = URL.createObjectURL(await r.blob()); setBlobs((b) => ({ ...b, [f.id]: u })); } }); }, [files]); // eslint-disable-line react-hooks/exhaustive-deps
  const Pic = ({ f, cls = "h-24" }: { f: F; cls?: string }) => (blobs[f.id] ? <img src={blobs[f.id]} alt={f.name} className={`${cls} rounded-lg border border-border object-contain`} /> : <div className={`${cls} flex w-24 items-center justify-center rounded-lg bg-muted`}><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={async () => { if (dirty.current) await save(); back(); }} className="flex items-center gap-1.5 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" /> All reports</button>
        <div className="flex gap-2">
          <button onClick={async () => { await save(); setMsg("Saved."); }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground">Save</button>
          <button onClick={remove} className="rounded-lg border border-red-500/40 p-1.5 text-red-600 dark:text-red-300" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {msg && <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">{msg}</p>}

      <section className={box}><h3 className="mb-3 font-bold text-foreground">1. Title page</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={lab}>Project ID</label><input className={inp} value={String(d.projectId ?? "")} onChange={(e) => set("projectId", e.target.value)} placeholder="Fills in by itself once the county is chosen" /></div>{T("siteRef", "Project / site reference", "e.g. Bura Mwatate")}
          <GoogleFill onFill={(g) => fillEmpty({ clientName: g.name, clientEmail: g.email, ...g.data })} />
          {T("clientName", "Client name")}<div><label className={lab}>Client phone</label><PhoneField value={String(d.clientPhone ?? "")} onChange={(v) => set("clientPhone", v)} className={inp} /></div>
          <div><label className={lab}>Client email</label><input className={inp} type="email" value={String(d.clientEmail ?? "")} onChange={(e) => set("clientEmail", e.target.value)} onBlur={() => void fromEmail(String(d.clientEmail ?? ""))} placeholder="Past details fill in from this email" /></div>{T("sponsor", "Project sponsor")}
          {T("supervisor", "Supervising organisation")}{T("representative", "Project representative")}
          {T("company", "Company name")}{T("collectedBy", "Data collected by")}
          <div><label className={lab}>Date of survey</label><DateSelect value={String(d.surveyDate ?? "")} onChange={(v) => set("surveyDate", v)} cls={inp} /></div>
        </div></section>

      <section className={box}><h3 className="mb-3 font-bold text-foreground">2. Location</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {T("village", "Village / unit")}{T("locationName", "Location / ward")}
          {T("subcounty", "Sub-county")}{T("county", "County")}
          {T("landmark", "Nearest landmark")}{T("elevation", "Elevation (m AMSL)")}
          {T("lat", "Latitude (decimal, S is negative)", "-3.53073")}{T("lng", "Longitude (decimal)", "38.32219")}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2"><button type="button" onClick={() => setMapOpen(true)} className="rounded-xl border border-primary px-4 py-2 text-sm font-bold text-primary">Pick the point on the map</button><button type="button" onClick={useMyLocation} className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-foreground">Use my location</button>{locMsg && <span className="text-xs text-muted-foreground">{locMsg}</span>}</div>
          <div className="sm:col-span-2">{T("purpose", "Project purpose", "e.g. Groundwater exploration and borehole siting using PQWT")}</div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Land use, existing water sources and demand are written by the AI from the area research. Type them only if you know specific facts about this plot.</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">{T("landUse", "Land use (optional)")}{T("nearbySource", "Existing water source (optional)")}{T("demand", "Water demand (optional)")}</div>
      </section>

      <section className={box}><h3 className="mb-3 font-bold text-foreground">3. Survey</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={lab}>Instrument</label><select className={inp} value={d.instrument ?? ""} onChange={(e) => set("instrument", e.target.value)}>{INSTRUMENTS.map((x) => <option key={x}>{x}</option>)}</select></div>
          {SEL("stationCount", "Number of points / stations surveyed", Array.from({ length: 12 }, (_, i) => String(i + 1)), "Type the number of points")}{SEL("spacing", "Station spacing (optional)", ["5 m", "10 m", "15 m", "20 m", "25 m", "30 m", "40 m", "50 m", "100 m"], "Type the spacing, e.g. 20 m")}{SEL("lineDirection", "Survey line direction (optional)", ["N–S", "E–W", "NE–SW", "NW–SE", "Scattered points (no single line)"], "Type the direction, e.g. NW–SE")}
        </div></section>

      <section className={box}><h3 className="mb-1 font-bold text-foreground">4. Section pictures</h3>
        <p className="mb-3 text-xs text-muted-foreground">Upload the screenshot from the machine for each point. Type the point number shown on the horizontal axis, tick the recommended one and type the expected yield. “Read with AI” finds the water zone; you check the depths.</p>
        {picks.map((p, i) => {
          const f = files.find((x) => x.id === p.fileId);
          return (
            <div key={i} className="mb-3 rounded-xl border border-border p-3">
              <div className="flex gap-3">
                {f && <div className="shrink-0 text-center"><button type="button" onClick={() => setEdit({ fid: f.id, kind: "section", title: `Point ${p.station || ""}` })} title="Click to edit this picture"><Pic f={f} cls="h-32" /></button><button type="button" onClick={() => setEdit({ fid: f.id, kind: "section", title: `Point ${p.station || ""}` })} className="mt-1 w-full rounded-lg bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground">Edit picture</button></div>}
                <div className="grid flex-1 gap-2 sm:grid-cols-3">
                  <div><label className={lab}>Point / station</label><input className={inp} value={p.station} onChange={(e) => setPick(i, { station: e.target.value })} placeholder="e.g. 7" /></div>
                  <div><label className={lab}>Expected yield (m³/hour)</label><input className={inp} value={p.yieldText} onChange={(e) => setPick(i, { yieldText: e.target.value })} placeholder="e.g. 3 – 6 m³/hour" /></div>
                  <div className="sm:col-span-3"><div className="w-full"><RecommendToggle value={p.recommended} onChange={(v) => { dirty.current = true; setD((x) => ({ ...x, picks: (x.picks ?? []).map((q, j) => ({ ...q, recommended: j === i ? v : v ? false : q.recommended })) })); }} /></div></div>
                  <div><label className={lab}>Water zone from (m)</label><input className={inp} type="number" value={p.zoneFrom || ""} onChange={(e) => setPick(i, { zoneFrom: Number(e.target.value) })} /></div>
                  <div><label className={lab}>Water zone to (m)</label><input className={inp} type="number" value={p.zoneTo || ""} onChange={(e) => setPick(i, { zoneTo: Number(e.target.value) })} /></div>
                  <div className="sm:col-span-3"><label className={lab}>{p.recommended ? "Why this point: tick all that apply" : "Why not recommended: tick all that apply"}</label><ReasonPicker key={p.recommended ? "y" : "n"} value={p.reason} onChange={(v) => setPick(i, { reason: v })} inp={inp} options={p.recommended ? POINT_YES : POINT_NO} /></div>
                </div>
              </div>
              {p.note && <p className="mt-2 text-xs text-muted-foreground">AI note: {p.note}</p>}
              {p.cal && (
                <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold text-primary">Adjust line positions (pixels in the picture)</summary>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([["stationX", "Station line x"], ["y1", "Depth tick 1 y"], ["d1", "…its depth"], ["y2", "Depth tick 2 y"], ["d2", "…its depth"]] as const).map(([k, l]) => (
                      <div key={k}><label className={lab}>{l}</label><input className={inp} type="number" value={(p.cal as any)[k]} onChange={(e) => setPick(i, { cal: { ...p.cal!, [k]: Number(e.target.value) } })} /></div>
                    ))}
                    {(["x0", "x1", "y0", "y1"] as const).map((k) => (
                      <div key={k}><label className={lab}>Plot {k}</label><input className={inp} type="number" value={p.cal!.plot[k]} onChange={(e) => setPick(i, { cal: { ...p.cal!, plot: { ...p.cal!.plot, [k]: Number(e.target.value) } } })} /></div>
                    ))}
                  </div></details>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button disabled={!ai || !!busy} onClick={() => analyse(i)} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">{busy === `an${i}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Read with AI</button>
                <button disabled={!!busy} onClick={() => preview(i)} className="rounded-lg border border-primary/40 px-3 py-2 text-xs font-bold text-primary">{busy === `pv${i}` ? "Drawing…" : "Preview marked picture"}</button>
                <div className="w-40"><EditBtn fid={p.fileId} kind="section" title={`Point ${p.station || ""}`} /><MoveSel fid={p.fileId} from="section" /></div>
                <button onClick={() => { void delFile(p.fileId); set("picks", picks.filter((_, j) => j !== i)); }} className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-600 dark:text-red-300">Remove</button>
              </div>
              {prev?.i === i && <img src={prev.url} alt="Marked section" className="mt-3 w-full rounded-lg border border-border" />}
            </div>
          );
        })}
        {fileInput("image/png,image/jpeg,image/webp", addSection, "Add a section picture")}
      </section>

      <section className={box}><h3 className="mb-3 font-bold text-foreground">5. Borehole advice</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {T("minDepth", "Minimum drilling depth (m)", "180", "number")}{T("maxDepth", "Maximum drilling depth (m)", "220", "number")}
          {T("preferredDepth", "Preferred depth (m)", "220", "number")}{T("surfaceCasingTo", "Surface casing down to (m)", "30", "number")}
          <div className="sm:col-span-2"><label className={lab}>Why the preferred depth: tick all that apply</label><ReasonPicker value={String(d.preferredReason ?? "")} onChange={(v) => set("preferredReason", v)} inp={inp} /></div>
          {SEL("casing", "Casing type and diameter", ["6-inch uPVC Class 12 plastic casing", "8-inch uPVC Class 12 plastic casing", "6-inch steel casing", "8-inch steel casing", "6-inch uPVC plastic casing or 6-inch steel casing, as the client's budget allows", "8-inch uPVC plastic casing or 8-inch steel casing, as the client's budget allows"], "Type the casing type and diameter")}{SEL("quality", "Water quality tests wanted", ["Full physico-chemical and bacteriological", "Physico-chemical only", "Bacteriological only", "Basic tests (pH, TDS, conductivity, hardness)", "Fluoride and heavy metals", "None"], "Type the tests wanted")}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Optional: layers for the borehole drawing and table (depth from, to, material). If left empty, the drawing uses the water zone only.</p>
        {(d.layers ?? []).map((l, i) => (
          <div key={i} className="mt-2 grid grid-cols-[70px_70px_1fr_110px_36px] gap-2">
            <input className={inp} type="number" placeholder="from" value={l.from} onChange={(e) => set("layers", (d.layers ?? []).map((x, j) => (j === i ? { ...x, from: Number(e.target.value) } : x)))} />
            <input className={inp} type="number" placeholder="to" value={l.to} onChange={(e) => set("layers", (d.layers ?? []).map((x, j) => (j === i ? { ...x, to: Number(e.target.value) } : x)))} />
            <input className={inp} placeholder="material" value={l.label} onChange={(e) => set("layers", (d.layers ?? []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <select className={inp} value={l.kind} onChange={(e) => set("layers", (d.layers ?? []).map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}>{["soil", "weathered", "aquifer", "deep", "rock"].map((k) => <option key={k}>{k}</option>)}</select>
            <button onClick={() => set("layers", (d.layers ?? []).filter((_, j) => j !== i))} className="text-red-600" aria-label="Remove layer"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button onClick={() => set("layers", [...(d.layers ?? []), { from: 0, to: 0, label: "", kind: "weathered" }])} className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground">+ Add layer</button>
      </section>

      <section className={box}><h3 className="mb-1 font-bold text-foreground">6. Other pictures</h3>
        <p className="mb-3 text-xs text-muted-foreground">Area pictures or other places where data were taken. They are named First Location, Second Location… in the order you add them. Maps go in the location section; photos in the fieldwork section.</p>
        <div className="mb-3 flex flex-wrap gap-3">{of("location").map((f, i) => (<div key={f.id} className="text-center"><Pic f={f} /><div className="mt-1 text-xs font-semibold text-foreground">{ORD[i] ?? `Location ${i + 1}`} Location</div><EditBtn fid={f.id} kind="location" title={f.name} /><MoveSel fid={f.id} from="location" /><button onClick={() => delFile(f.id)} className="text-xs text-red-600">Remove</button></div>))}</div>
        {of("photo").length > 0 && <div className="mb-3 flex flex-wrap gap-3">{of("photo").map((f) => (<div key={f.id} className="text-center"><Pic f={f} /><div className="mt-1 text-xs font-semibold text-foreground">{f.name || "Field photo"}</div><EditBtn fid={f.id} kind="photo" title={f.name || "Field photo"} /><MoveSel fid={f.id} from="photo" /><button onClick={() => delFile(f.id)} className="text-xs text-red-600">Remove</button></div>))}</div>}
        {fileInput("image/png,image/jpeg,image/webp", (f) => void upload(f, "location", `${ORD[of("location").length] ?? `Location ${of("location").length + 1}`} Location`), "Add a location picture")}
        <div className="mb-3 mt-4 flex flex-wrap gap-3">{of("map").map((f) => (<div key={f.id} className="text-center"><Pic f={f} /><div className="mt-1 text-xs font-semibold text-foreground">{f.name}</div><button onClick={() => blobs[f.id] && setCrop({ src: blobs[f.id]!, name: f.name, replace: f.id })} className="mt-1 w-full rounded-lg border border-primary/40 px-2 py-1 text-[11px] font-bold text-primary">Zoom / reframe</button><EditBtn fid={f.id} kind="map" title={f.name} /><MoveSel fid={f.id} from="map" /><button onClick={() => delFile(f.id)} className="text-xs text-red-600">Remove</button></div>))}</div>
        <button type="button" onClick={() => setMapOpen(true)} className="mb-3 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"><ImageIcon className="h-4 w-4" /> Open the full map: pin, views, screenshot</button>
        {fileInput("image/png,image/jpeg,image/webp", (f) => setCrop({ src: URL.createObjectURL(f), name: "Aerial view of the site" }), "Add a map or aerial screenshot (you can zoom it)")}
        {mapOpen && <MapBoundary onClose={() => setMapOpen(false)}><Suspense fallback={null}><MapShot initial={d.lat && d.lng && Number.isFinite(Number(d.lat)) ? { lat: Number(d.lat), lng: Number(d.lng) } : null} query={[d.village, d.locationName, d.subcounty, d.county].filter(Boolean).join(", ")} onClose={() => setMapOpen(false)} onShot={(b, nm) => { setMapOpen(false); setCrop({ src: URL.createObjectURL(b), name: nm }); }} onUsePin={(la, ln) => { set("lat", String(la)); set("lng", String(ln)); setMapOpen(false); setMsg("Pin saved as the latitude and longitude. Press Save."); }} /></Suspense></MapBoundary>}
        {edit && blobs[edit.fid] && <PicEditor src={blobs[edit.fid]!} title={edit.title} onCancel={() => setEdit(null)} onDone={(b) => void saveEdit(b)} />}
        {crop && <MapCropper src={crop.src} name={crop.name} onCancel={() => { if (!crop.replace) URL.revokeObjectURL(crop.src); setCrop(null); }} onDone={saveCrop} />}
      </section>

      <section className={box}><h3 className="mb-3 font-bold text-foreground">7. Signature page (you can add these later)</h3>
        <div className="grid gap-3 sm:grid-cols-2">{T("geologistName", "Geologist name")}{T("geologistTitle", "Title / registration")}</div>
        <div className="mt-3 flex flex-wrap gap-4">
          {(["logo", "stamp", "signature"] as const).map((k) => (<div key={k}><div className="mb-1 text-xs font-semibold capitalize text-foreground">{k}</div>{of(k)[0] ? <div className="flex items-end gap-2"><Pic f={of(k)[0]!} cls="h-16" /><button onClick={() => delFile(of(k)[0]!.id)} className="text-xs text-red-600">Remove</button></div> : fileInput("image/png,image/jpeg,image/webp", (f) => void upload(f, k), `Upload ${k}`)}</div>))}
        </div>
      </section>

      <section className={`${box} border-primary/40`}>
        <h3 className="mb-2 font-bold text-foreground">Write the report</h3>
        {st.status === "working" && <p className="mb-2 flex items-center gap-2 text-sm text-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {st.progress || "Working…"} <span className="text-xs text-muted-foreground">(a few minutes; you can leave this page)</span> <button onClick={async () => { if (!confirm("Stop writing this report?")) return; await fetch(`${API}/api/reports/${id}/stop`, { method: "POST", headers: h }); void load(); }} className="ml-auto rounded-lg border border-red-500/60 px-3 py-1 text-xs font-bold text-red-600">Stop</button></p>}
        {st.status === "working" && <LiveReport id={id} url={`${API}/api/reports/${id}/live`} headers={h} />}
        {st.status === "failed" && <p className="mb-2 rounded-lg bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">Failed: {st.error}</p>}
        <div className="flex flex-wrap gap-2">
          <button disabled={!ai || busy === "gen" || st.status === "working"} onClick={() => generate(false)} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"><Sparkles className="h-4 w-4" /> {st.has ? "Write it again" : "Write the report"}</button>
          {st.has && <button onClick={download} className="flex items-center gap-1.5 rounded-xl border border-primary px-4 py-2.5 text-sm font-bold text-primary"><Download className="h-4 w-4" /> Download Word file</button>}
          {st.has && <button disabled={!ai || st.status === "working"} onClick={() => generate(true)} className="rounded-xl border border-border px-3 py-2.5 text-xs font-bold text-foreground">Write again with fresh area research</button>}
        </div>
        {st.has && st.status !== "working" && <SendLink id={id} h={h} />}
        {st.owner && <div className="mt-3 rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-foreground">Paid client report from {st.owner}. Read the Word file, fix anything above (then “Write it again”), add your stamp details, and release it. The client cannot download it until you release it.
          <div className="mt-2">{st.released ? <button onClick={() => release(false)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold">Withdraw from client</button> : <button disabled={!st.has} onClick={() => release(true)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Release to client</button>}</div></div>}
        {!ai && <p className="mt-2 text-xs text-muted-foreground">Needs the AI key on the server.</p>}
        <p className="mt-2 text-xs text-muted-foreground">When you open the Word file, Word asks to update fields. Choose Yes so the contents, figure list and table list fill in. Read the report before it goes out; it carries your stamp.</p>
      </section>
    </div>
  );
}
