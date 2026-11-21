import { useEffect, useRef, useState } from "react";
import { Eraser, Upload } from "lucide-react";
import { readFile, removeBackground } from "@/lib/inkImage";

const INKS = [{ n: "Blue", c: "#1c3fb8" }, { n: "Black", c: "#111827" }, { n: "Navy", c: "#0f2a6b" }, { n: "Green", c: "#0f6b3a" }, { n: "Red", c: "#b91c1c" }];

// A box the client signs in with a finger, a phone pen or a mouse, in blue ballpoint ink, like signing in a book. onChange gets a PNG (data URL) or "" when empty.
// Trims the empty space round the ink, so on the contract the signature sits right on the signature line like a real pen signature.
function cropInk(c: HTMLCanvasElement): string {
  try {
    const ctx = c.getContext("2d")!, { width: W, height: H } = c, d = ctx.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return c.toDataURL("image/png");
    const pad = 3, sx = Math.max(0, x0 - pad), sy = Math.max(0, y0 - pad), sw = Math.min(W, x1 + pad) - sx, sh = Math.min(H, y1 + pad) - sy;
    const o = document.createElement("canvas"); o.width = sw; o.height = sh;
    o.getContext("2d")!.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
    return o.toDataURL("image/png");
  } catch { return c.toDataURL("image/png"); }
}

export default function SignaturePad({ onChange, heightClass = "h-40" }: { onChange: (png: string) => void; heightClass?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const pts = useRef<{ x: number; y: number; t: number; w: number }[]>([]);
  const [empty, setEmpty] = useState(true);
  const [ink, setInk] = useState(INKS[0].c), [photo, setPhoto] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), [shown, setShown] = useState("");
  const INK = ink;

  useEffect(() => {   // sharp lines on phone screens
    const c = ref.current; if (!c) return;
    const r = c.getBoundingClientRect(), k = Math.min(window.devicePixelRatio || 1, 3);
    c.width = Math.round(r.width * k); c.height = Math.round(r.height * k);
    const g = c.getContext("2d"); if (g) { g.scale(k, k); g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = INK; g.fillStyle = INK; }
  }, []);

  useEffect(() => { const g = ref.current?.getContext("2d"); if (g) { g.strokeStyle = ink; g.fillStyle = ink; } }, [ink]);
  // upload a picture of a signature: the paper is removed, the ink is repainted in the chosen colour
  useEffect(() => {
    if (!photo) return; let on = true; setBusy(true); setMsg("");
    removeBackground(photo, ink, 700).then((png) => { if (!on) return; setShown(png); setEmpty(false); onChange(png); }).catch((e) => { if (!on) return; setShown(""); onChange(""); setMsg(String(e.message || e)); }).finally(() => on && setBusy(false));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, ink]);
  const pickFile = async (f?: File) => { if (!f) return; try { setPhoto(await readFile(f)); } catch (e) { setMsg(String((e as Error).message)); } };
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp }; };
  // A real pen: the line gets thicker when you press harder (a phone pen) or move slowly (a finger), and thinner when you flick fast.
  const widthFor = (e: React.PointerEvent, p: { x: number; y: number; t: number }, prev?: { x: number; y: number; t: number; w: number }) => {
    if (e.pointerType === "pen" && e.pressure > 0) return 1 + e.pressure * 2.6;
    if (!prev) return 2.2;
    const v = Math.hypot(p.x - prev.x, p.y - prev.y) / Math.max(1, p.t - prev.t);   // pixels per millisecond
    const target = Math.max(1.1, Math.min(3, 3 - v * 1.4));
    return prev.w * 0.7 + target * 0.3;   // smoothed, so the width changes gently
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault(); ref.current?.setPointerCapture(e.pointerId); drawing.current = true;
    const p = pos(e), w = widthFor(e, p); pts.current = [{ ...p, w }];
    const g = ref.current!.getContext("2d")!; g.beginPath(); g.arc(p.x, p.y, w / 2, 0, 7); g.fill();
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const g = ref.current!.getContext("2d")!;
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [];
    for (const ev of evs.length ? evs : [e.nativeEvent as PointerEvent]) {
      const r = ref.current!.getBoundingClientRect();
      const q = { x: ev.clientX - r.left, y: ev.clientY - r.top, t: ev.timeStamp };
      const a = pts.current;
      const prev = a[a.length - 1];
      if (Math.hypot(q.x - prev.x, q.y - prev.y) < 0.8) continue;
      const w = widthFor({ pointerType: ev.pointerType, pressure: ev.pressure } as React.PointerEvent, q, prev);
      const cur = { ...q, w };
      // smooth curve through the midpoints, so strokes look hand-written and not made of straight bits
      const before = a.length > 1 ? a[a.length - 2] : prev;
      const m0 = { x: (before.x + prev.x) / 2, y: (before.y + prev.y) / 2 }, m1 = { x: (prev.x + cur.x) / 2, y: (prev.y + cur.y) / 2 };
      g.lineWidth = (prev.w + cur.w) / 2;
      g.beginPath(); g.moveTo(m0.x, m0.y); g.quadraticCurveTo(prev.x, prev.y, m1.x, m1.y); g.stroke();
      a.push(cur);
    }
  };
  const up = () => { if (!drawing.current) return; drawing.current = false; pts.current = []; setEmpty(false); onChange(cropInk(ref.current!)); };
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setEmpty(true); setPhoto(""); setShown(""); setMsg(""); onChange(""); };

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-primary/40 bg-white shadow-inner">
        <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} className={`block ${heightClass} w-full cursor-crosshair touch-none`} aria-label="Signature box" data-testid="signature-pad" />
        {shown && <div className="absolute inset-0 flex items-center justify-center bg-white p-3"><img src={shown} alt="Your signature" className="max-h-full max-w-full object-contain" /></div>}
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-300">Sign here with your finger or pen</span>}
        <span className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-slate-300" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-muted-foreground">Ink</span>
        {INKS.map((i) => <button key={i.c} type="button" aria-label={i.n} title={i.n} onClick={() => setInk(i.c)} className={`h-6 w-6 rounded-full border-2 transition active:scale-90 ${ink === i.c ? "border-foreground ring-2 ring-primary/40" : "border-white shadow"}`} style={{ background: i.c }} />)}
        <label className="ml-auto flex cursor-pointer items-center gap-1 rounded-full border border-border px-3 py-1 text-[11px] font-bold text-foreground transition active:scale-95"><Upload className="h-3.5 w-3.5" /> Upload a signature picture<input type="file" accept="image/*" className="hidden" onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </div>
      {busy && <p className="mt-1 text-[11px] font-semibold text-muted-foreground">Removing the background...</p>}
      {msg && <p className="mt-1 text-[11px] font-semibold text-red-600" role="alert">{msg}</p>}
      <button type="button" onClick={clear} className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-muted-foreground transition active:scale-95" data-testid="button-clear-signature"><Eraser className="h-3.5 w-3.5" /> Clear and start again</button>
    </div>
  );
}
