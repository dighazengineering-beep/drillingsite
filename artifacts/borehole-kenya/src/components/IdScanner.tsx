import { useCallback, useEffect, useRef, useState } from "react";
import { X, CheckCircle2, Loader2, Camera, AlertTriangle } from "lucide-react";
import { sameSide, type IdMatch } from "@/lib/idMatch";
import { readIdFields } from "@/lib/idRead";
import { getOcr } from "@/lib/ocr";
import { loadCv, findCard, flattenCard, type Pt, type Quad } from "@/lib/cardDetect";
const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");

// Backup: when the phone could not read the card, ask the online readers (the server tries them one after another).
async function askOnline(back: string, front: string): Promise<{ name: string; idNo: string; text: string }> {
  try {
    const r = await fetch(`${API}/api/id-read`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ back, front: front.length + back.length < 1_300_000 ? front : undefined }), signal: AbortSignal.timeout(14000) });
    const d = await r.json().catch(() => ({}));
    return { name: String(d.name ?? ""), idNo: String(d.idNo ?? ""), text: String(d.text ?? "") };
  } catch { return { name: "", idNo: "", text: "" }; }
}

/** Which side of a Kenyan ID is this text from? Only says "front" or "back" when it is clear, otherwise "" (then the card is accepted). */
function sideOf(t: string): "front" | "back" | "" {
  const u = t.toUpperCase(), back = /IDKEN|<<|\bKEN\d{6}/.test(u), front = /FULL\s*NAMES?|SERIAL\s*N|REPUBLIC\s*OF\s*KENYA|JAMHURI|HOLDER|DATE\s*OF\s*BIRTH/.test(u);
  return back && !front ? "back" : front && !back ? "front" : "";
}

/** A smaller copy of the card photo for the AI reader: quick to send, and small enough for the server. */
function aiJpeg(c: HTMLCanvasElement): string {
  const k = Math.min(1, 1100 / c.width), o = document.createElement("canvas"); o.width = Math.round(c.width * k); o.height = Math.round(c.height * k);
  o.getContext("2d")!.drawImage(c, 0, 0, o.width, o.height);
  let q = 0.78, d = o.toDataURL("image/jpeg", q); while (d.length > 900_000 && q > 0.4) { q -= 0.1; d = o.toDataURL("image/jpeg", q); }
  return d;
}

export interface ScanResult { front: string; back: string; match: IdMatch; source: "scan" | "photo"; name: string; idNo: string }
type Phase = "front" | "reading" | "frontOk" | "back" | "done";
const ASPECT = 1.586; // an ID card is 85.6 x 54 mm

const gray = (d: Uint8ClampedArray) => { const g = new Float32Array(d.length / 4); for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; return g; };
function toJpeg(c: HTMLCanvasElement) { let q = 0.85, out = c.toDataURL("image/jpeg", q); while (out.length > 1_200_000 && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); } return out; }
// The red channel with the contrast stretched: removes the green and blue patterns on new cards so the print stands out.
function redChannel(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
  const x = c.getContext("2d")!; x.drawImage(src, 0, 0);
  const im = x.getImageData(0, 0, c.width, c.height), d = im.data, hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
  const total = d.length / 4; let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
  const span = Math.max(30, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span)); d[i] = d[i + 1] = d[i + 2] = v; }
  x.putImageData(im, 0, 0); return c;
}
// A white margin around the picture: the text reader loses words that touch the edge of an image.
function withMargin(src: HTMLCanvasElement): HTMLCanvasElement {
  const m = Math.round(src.width * 0.07), o = document.createElement("canvas"); o.width = src.width + 2 * m; o.height = src.height + 2 * m;
  const x = o.getContext("2d")!; x.fillStyle = "#fff"; x.fillRect(0, 0, o.width, o.height); x.drawImage(src, m, m); return o;
}
const RANK = { unverified: 0, weak: 1, strong: 2 } as const;

function fingerprint(src: HTMLCanvasElement): number[] {
  const c = document.createElement("canvas"); c.width = 16; c.height = 16; const x = c.getContext("2d")!; x.drawImage(src, 0, 0, 16, 16);
  return Array.from(gray(x.getImageData(0, 0, 16, 16).data));
}

/** Full-screen ID scanner: guide frame, checks the picture is sharp and steady, snaps by itself, reads the card and compares it with the typed name and ID number. Front first, then back. */
export default function IdScanner({ purpose, onClose, onDone }: { purpose: string; onClose: () => void; onDone: (r: ScanResult) => void }) {
  const [phase, setPhase] = useState<Phase>("front");
  type Best = { c: HTMLCanvasElement; s: number; fq?: { full: HTMLCanvasElement; q: Quad } };
  const bestShot = useRef<Best | null>(null), seen = useRef(0), missed = useRef(0);
  // card finder (OpenCV): outlines the ID live and flattens it after the snap, like a document-scanner app
  const cvRef = useRef<any>(null), noQuad = useRef(0), smallCv = useRef<HTMLCanvasElement | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [outline, setOutline] = useState<{ pts: Pt[]; fits: boolean; vw: number; vh: number } | null>(null);
  const cvFail = useRef(false), cvT0 = useRef(Date.now());
  useEffect(() => { let on = true; loadCv().then((c) => { if (on) cvRef.current = c; }).catch(() => { cvFail.current = true; }); return () => { on = false; }; }, []);
  const [shot, setShot] = useState(""); // the picture just taken, shown while it is being read
  const [step, setStep] = useState(0);
  useEffect(() => { if (phase !== "reading") { setStep(0); return; } const t = window.setInterval(() => setStep((n) => n + 1), 1800); return () => window.clearInterval(t); }, [phase]);
  const [hint, setHint] = useState("Starting the camera...");
  const [good, setGood] = useState(false), [warn, setWarn] = useState(false);
  const [camErr, setCamErr] = useState(false);
  const [msg, setMsg] = useState("");
  const [attempts, setAttempts] = useState(0);
  const video = useRef<HTMLVideoElement>(null), guide = useRef<HTMLDivElement>(null), stream = useRef<MediaStream | null>(null);
  const frontRead = useRef<Promise<string> | null>(null); // the front is read in the background while the client scans the back
  const phaseRef = useRef<Phase>("front"), busy = useRef(false);
  const lq = useRef<{ x: number; y: number }[] | null>(null);
  const backRead = useRef<Promise<string> | null>(null);
  const front = useRef<{ img: string; print: number[]; match: IdMatch; text: string; ai: string } | null>(null);
  const source = useRef<"scan" | "photo">("scan");
  const prev = useRef<Float32Array | null>(null), best = useRef(0), steady = useRef(0), pauseUntil = useRef(0);
  phaseRef.current = phase;

  // start the camera, and warm up the text reader while the client frames the card
  useEffect(() => {
    let dead = false;
    void getOcr().catch(() => {}); // normally already loaded by the form
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
        setHint("Put the FRONT of the ID inside the frame");
      } catch { if (!dead) setCamErr(true); }
    })();
    return () => { dead = true; stream.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // the part of the live picture inside the guide frame, in the camera's own pixels
  const region = useCallback(() => {
    const v = video.current, g = guide.current; if (!v || !g || !v.videoWidth) return null;
    const vr = v.getBoundingClientRect(), gr = g.getBoundingClientRect();
    const s = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
    const ox = (v.videoWidth * s - vr.width) / 2, oy = (v.videoHeight * s - vr.height) / 2;
    let sx = (gr.left - vr.left + ox) / s, sy = (gr.top - vr.top + oy) / s, sw = gr.width / s, sh = gr.height / s;
    sx = Math.max(0, sx); sy = Math.max(0, sy); sw = Math.min(sw, v.videoWidth - sx); sh = Math.min(sh, v.videoHeight - sy);
    return { v, sx, sy, sw, sh };
  }, []);

  // One quick read of a card side. Never waits longer than `ms`.
  const readOnce = useCallback(async (canvas: HTMLCanvasElement, look: "plain" | "boost", ms: number): Promise<string> => {
    try {
      const w = await Promise.race([getOcr(), new Promise<never>((_, no) => setTimeout(() => no(new Error("slow")), ms))]);
      const c = look === "plain" ? canvas : withMargin(redChannel(canvas));
      return await Promise.race([w.recognize(c).then((r) => r.data.text), new Promise<string>((ok) => setTimeout(() => ok(""), ms))]);
    } catch { return ""; }
  }, []);

  const finishSide = useCallback(async (canvas: HTMLCanvasElement, side: "front" | "back") => {
    if (busy.current) return; busy.current = true;
    try {
      const img = toJpeg(canvas), print = fingerprint(canvas);
      if (side === "front") {
        // is this really the FRONT? A quick read of the card (up to 3.5 s); if it clearly says "back", ask for the front first
        const fr = readOnce(canvas, "plain", 20000);
        const sd = sideOf(await Promise.race([fr, new Promise<string>((ok) => setTimeout(() => ok(""), 3500))]));
        if (sd === "back") { setMsg("That is the BACK of the ID. Please show the FRONT first."); steady.current = 0; setGood(false); bestShot.current = null; pauseUntil.current = Date.now() + 3000; return; }
        // approve the front straight away; the reading happens in the background while the client turns the card over
        front.current = { img, print, match: "unverified", text: "", ai: aiJpeg(canvas) }; setShot(img);
        frontRead.current = fr;
        setPhase("frontOk"); setHint(""); setMsg("");
        setTimeout(() => { setPhase("back"); setHint("Now turn the ID over and put the BACK inside the frame"); setGood(false); setWarn(false); steady.current = 0; prev.current = null; best.current = 0; bestShot.current = null; seen.current = 0; pauseUntil.current = Date.now() + 800; }, 1500);
      } else {
        const f = front.current!;
        const bk = readOnce(canvas, "plain", 12000);
        const sdb = sideOf(await Promise.race([bk, new Promise<string>((ok) => setTimeout(() => ok(""), 3500))]));
        if (sdb === "front") { setMsg("That is the FRONT again. Turn the card over to show the BACK."); steady.current = 0; setGood(false); bestShot.current = null; pauseUntil.current = Date.now() + 3000; return; }
        backRead.current = bk;
        if (sameSide(f.print, print)) { setMsg("That looks like the front again. Turn the card over."); steady.current = 0; setGood(false); pauseUntil.current = Date.now() + 3000; }
        else {
          // read the back (it carries the checked ID number and the names), add the front, and finish. Hard limit: 12 seconds.
          setShot(img); setPhase("reading");
          // the AI reads first (both sides together, about 2 to 4 seconds). The phone reading below is only the backup.
          const ai = await askOnline(aiJpeg(canvas), f.ai);
          if (ai.name && /^\d{7,9}$/.test(ai.idNo.replace(/\D/g, ""))) { setPhase("done"); onDone({ front: f.img, back: img, match: "strong", name: ai.name, idNo: ai.idNo.replace(/\D/g, ""), source: source.current }); return; }
          const deadline = Date.now() + 12000;
          const left = () => Math.max(1500, deadline - Date.now());
          let text = "";
          const [backText, frontText] = await Promise.all([(backRead.current ?? readOnce(canvas, "plain", 12000)), (frontRead.current ?? Promise.resolve("")).then((t) => t || "")]);
          text = frontText + "\n" + backText;
          // only when the first reads did not give both the name and a checked ID number, and there is still time, try the contrast-boosted look
          let fields = readIdFields(text);
          if (!(fields.confidence === "strong" && fields.name) && Date.now() < deadline - 2500) { text += "\n" + (await readOnce(canvas, "boost", left())); fields = readIdFields(text); }
          let name = fields.name, idNo = fields.idNo, match: IdMatch = fields.confidence === "strong" ? "strong" : fields.confidence === "weak" ? "weak" : "unverified";
          if (!(fields.confidence === "strong" && name)) {
            const o = ai;
            if (o.text) { const f2 = readIdFields(o.text); if (f2.name && !name) name = f2.name; if (f2.idNo && (!idNo || f2.confidence === "strong")) idNo = f2.idNo; if (f2.confidence === "strong") match = "strong"; }
            if (o.name && !name) name = o.name;
            if (o.idNo && !idNo) idNo = o.idNo;
            if (match === "unverified" && (o.name || o.idNo)) match = "weak";
          }
          setPhase("done");
          onDone({ front: f.img, back: img, match, source: source.current, name, idNo });
        }
      }
    } finally { busy.current = false; }
  }, [onDone, readOnce]);

  const shoot = useCallback(() => {
    const r = region(); if (!r) return null;
    const k = r.sw < 1000 ? 1000 / r.sw : Math.min(1, 1400 / r.sw), c = document.createElement("canvas"); c.width = Math.round(r.sw * k); c.height = Math.round(r.sh * k);
    c.getContext("2d")!.drawImage(r.v, r.sx, r.sy, r.sw, r.sh, 0, 0, c.width, c.height);
    return c;
  }, [region]);
  // the button, or the auto-snap: use the sharpest picture seen in the last moment (a shaky hand still gives one good frame)
  const snap = useCallback(() => {
    if (busy.current) return;
    const b = bestShot.current; bestShot.current = null; seen.current = 0; missed.current = 0;
    let c = b?.c ?? null;
    const cv = cvRef.current;
    if (cv) { try { // the card is cut out and flattened (the button does a quick search for the card first)
      let full = b?.fq?.full, q = b?.fq?.q;
      if (!q) { const r = region(); if (r) { const sc = 320 / r.v.videoWidth, sm = document.createElement("canvas"); sm.width = 320; sm.height = Math.round(r.v.videoHeight * sc); sm.getContext("2d")!.drawImage(r.v, 0, 0, sm.width, sm.height); const f = findCard(cv, sm); if (f) { full = document.createElement("canvas"); full.width = r.v.videoWidth; full.height = r.v.videoHeight; full.getContext("2d")!.drawImage(r.v, 0, 0); q = f.map((t) => ({ x: t.x / sc, y: t.y / sc })) as Quad; } } }
      if (full && q) c = flattenCard(cv, full, q);
    } catch { /* keep the plain crop */ } }
    c ??= shoot(); if (!c) return;
    void finishSide(c, phaseRef.current === "back" ? "back" : "front");
  }, [shoot, finishSide, region]);

  // every quarter second: is a card in the frame, sharp, steady, not too dark, without glare? When so for a second, snap.
  useEffect(() => {
    if (camErr) return;
    const small = document.createElement("canvas"); small.width = 240; small.height = 151;
    const x = small.getContext("2d", { willReadFrequently: true })!;
    const t = window.setInterval(() => {
      if ((phaseRef.current !== "front" && phaseRef.current !== "back") || busy.current || Date.now() < pauseUntil.current) return;
      const r = region(); if (!r) return;
      x.drawImage(r.v, r.sx, r.sy, r.sw, r.sh, 0, 0, 240, 151);
      const g = gray(x.getImageData(0, 0, 240, 151).data), W = 240, H = 151;
      let sum = 0, sq = 0, grad = 0, edges = 0, glare = 0, n = 0;
      for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
        const p = j * W + i, v = g[p]; sum += v; sq += v * v; if (v >= 250) glare++;
        const d = Math.abs(v - g[p + 1]) + Math.abs(v - g[p + W]); grad += d; if (d > 40) edges++; n++;
      }
      const mean = sum / n, sd = Math.sqrt(Math.max(0, sq / n - mean * mean)), sharp = grad / n, edgeFrac = edges / n, glareFrac = glare / n;
      let motion = 0; if (prev.current) { for (let p = 0; p < g.length; p += 7) motion += Math.abs(g[p] - prev.current[p]); motion /= g.length / 7; }
      prev.current = g;
      const side = phaseRef.current === "back" ? "BACK" : "FRONT";
      let h = "", ok = false, warnNow = false;
      const dark = mean < 70, noCard = sd < 20 || edgeFrac < 0.02, shiny = glareFrac > 0.06;
      // 1. the card finder: is the whole ID inside the box, and big enough?
      let fits = false, quadSeen = false, quadSteady = false, fq: Best["fq"];
      const cv = cvRef.current;
      // the card finder is a big file: wait for it only a moment (1.8 seconds) so the very first picture is already straightened
      if (!cv && !cvFail.current && Date.now() - cvT0.current < 1800) { setHint("Getting the scanner ready..."); setGood(false); setWarn(false); return; }
      if (cv && !dark) {
        const sc = 320 / r.v.videoWidth, sm = smallCv.current ?? (smallCv.current = document.createElement("canvas"));
        sm.width = 320; sm.height = Math.round(r.v.videoHeight * sc); sm.getContext("2d")!.drawImage(r.v, 0, 0, sm.width, sm.height);
        let q: Quad | null = null; try { q = findCard(cv, sm); } catch { q = null; }
        if (q) {
          quadSeen = true; noQuad.current = 0;
          const pts = q.map((t) => ({ x: t.x / sc, y: t.y / sc })) as Quad, tol = r.sw * 0.06;
          const inside = pts.every((t) => t.x >= r.sx - tol && t.x <= r.sx + r.sw + tol && t.y >= r.sy - tol && t.y <= r.sy + r.sh + tol);
          let area = 0; for (let i = 0; i < 4; i++) { const u = pts[i], w2 = pts[(i + 1) % 4]; area += u.x * w2.y - w2.x * u.y; }
          const fill = Math.abs(area) / 2 / (r.sw * r.sh);
          const sd2 = (u: { x: number; y: number }, v: { x: number; y: number }) => Math.hypot(u.x - v.x, u.y - v.y), qw = (sd2(pts[0], pts[1]) + sd2(pts[2], pts[3])) / 2, qh = (sd2(pts[1], pts[2]) + sd2(pts[3], pts[0])) / 2, asp = Math.max(qw, qh) / Math.max(1, Math.min(qw, qh));
          fits = inside && fill >= 0.68 && asp > 1.25 && asp < 2.0; // must be shaped like an ID card
          h = !inside ? "Move back a little. The whole ID must be inside the box." : fill < 0.68 ? "Move closer until the ID fills the box." : "";
          if (lq.current && lq.current.length === pts.length) { let dsum = 0; pts.forEach((p, i) => { dsum += Math.hypot(p.x - lq.current![i].x, p.y - lq.current![i].y); }); quadSteady = dsum / pts.length < r.v.videoWidth * 0.015; }
          lq.current = pts.map((p) => ({ x: p.x, y: p.y }));
          setOutline({ pts, fits, vw: r.v.videoWidth, vh: r.v.videoHeight });
          if (fits) { const full = document.createElement("canvas"); full.width = r.v.videoWidth; full.height = r.v.videoHeight; full.getContext("2d")!.drawImage(r.v, 0, 0); fq = { full, q: pts }; }
        } else { noQuad.current++; lq.current = null; setOutline(null); }
      }
      // 2. the safety net: without the finder (not loaded yet, or no card edges found for a moment), use the picture inside the box
      const useFinder = !!cv && !dark;
      if (dark) { h = "Too dark. Move to a brighter place or switch on a light."; warnNow = true; }
      else if (shiny) { h = "Too much shine. Tilt the card a little to remove the reflection."; warnNow = true; }
      else if (sharp < 5) h = "Move a little closer or farther until the writing is clear.";
      else if (useFinder) { if (fits) ok = true; else if (!quadSeen) h = `Put the ${side} of the ID inside the box`; else if (!h) h = "That does not look like an ID card. Show the whole card flat."; }
      else if (noCard) h = `Put the ${side} of the ID inside the frame`;
      else ok = true;
      const still = quadSeen ? quadSteady : motion > 0 && motion < 12; // the green outline must stop moving before it snaps
      if (ok && !still) { seen.current = 0; bestShot.current = null; h = "Hold steady..."; ok = false; }
      if (ok) {
        // keep the sharpest good frame so far, and snap very quickly. Shaky hands are fine.
        h = "Got it, scanning..."; missed.current = 0; seen.current++;
        if (!bestShot.current || sharp > bestShot.current.s * 0.98) { const c = shoot(); if (c) bestShot.current = { c, s: sharp, fq }; }
        if (seen.current >= 3) { setGood(true); setHint(h); setWarn(false); setMsg(""); setOutline(null); snap(); return; }
      } else { if (++missed.current > 4) { seen.current = 0; bestShot.current = null; } }
      setGood(ok); setHint(h); setWarn(warnNow);
    }, 140);
    return () => window.clearInterval(t);
  }, [camErr, region, snap]);

  // no camera: take a photo with the phone's own camera instead (still read and compared)
  const onPhoto = (side: "front" | "back") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    source.current = "photo";
    const url = URL.createObjectURL(f);
    try {
      const im = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("bad")); i.src = url; });
      const k = im.width < 1000 ? 1000 / im.width : Math.min(1, 1400 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height); void finishSide(c, side);
    } catch { setMsg("That picture could not be opened. Try again."); } finally { URL.revokeObjectURL(url); }
  };

  const side = phase === "back" ? "back" : "front";
  return (
    <div className="fixed inset-0 z-[70] bg-black text-white" role="dialog" aria-label="Scan your ID" data-testid="id-scanner">
      {!camErr && <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />}
      {!camErr && outline && <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${outline.vw} ${outline.vh}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true"><polygon points={outline.pts.map((t) => `${t.x},${t.y}`).join(" ")} fill={outline.fits ? "rgba(52,211,153,.18)" : "rgba(56,189,248,.10)"} stroke={outline.fits ? "#34d399" : "#38bdf8"} strokeWidth={outline.vw * 0.006} strokeLinejoin="round" /></svg>}
      {!camErr && <div ref={guide} className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[3px] transition-colors duration-200 ${good ? "border-emerald-400" : "border-white/80"}`} style={{ width: "min(90vw, calc(56vh * 1.586))", aspectRatio: String(ASPECT), boxShadow: "0 0 0 100vmax rgba(0,0,0,.6)" }}>
        {["left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl", "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl"].map((c) => <span key={c} className={`absolute h-6 w-6 ${good ? "border-emerald-300" : "border-white"} ${c}`} />)}
      </div>}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 pb-6 pt-4">
        <div><p className="text-base font-extrabold">Scan the {side.toUpperCase()} of your ID</p>
          <div className="mt-1 flex gap-2 text-[11px] font-bold"><span className={`rounded-full px-2 py-0.5 ${phase === "front" || phase === "reading" ? "bg-white text-black" : "bg-emerald-500 text-white"}`}>{phase === "back" || phase === "done" || phase === "frontOk" ? "✓ " : ""}Front</span><span className={`rounded-full px-2 py-0.5 ${phase === "back" ? "bg-white text-black" : "bg-white/20"}`}>Back</span></div></div>
        <button type="button" onClick={onClose} className="rounded-full bg-white/20 p-2" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>

      {!camErr && (phase === "front" || phase === "back") && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/85 to-transparent px-4 pb-6 pt-10">
          {msg && <p className="flex max-w-sm items-start gap-1.5 rounded-xl bg-red-600/90 px-3 py-2 text-center text-xs font-semibold" role="alert"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {msg}</p>}
          <p className={`text-center text-sm font-bold ${good ? "text-emerald-300" : ""} ${warn ? "rounded-xl bg-sky-500 px-4 py-2 text-base text-black" : ""}`} role={warn ? "alert" : undefined}>{hint}</p>
          <button type="button" onClick={snap} className="grid h-16 w-16 place-items-center rounded-full border-4 border-white bg-white/25 active:scale-95" aria-label="Capture now"><Camera className="h-6 w-6" /></button>
          {phase === "front" && attempts >= 2 && front.current && <button type="button" onClick={() => { setPhase("back"); setMsg(""); setHint("Now turn the ID over and put the BACK inside the frame"); }} className="text-xs font-bold underline">Continue anyway (marked as not matched)</button>}
          <p className="text-center text-[10px] text-white/70">We use your ID only for this {purpose}. It is kept private. If your phone cannot read it, a secure online reader may help.</p>
        </div>
      )}

      {(phase === "reading" || phase === "frontOk") && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 px-6" style={{ background: "radial-gradient(120% 90% at 50% 20%, #0f2a52 0%, #060d1c 70%)" }} data-testid="id-reading">
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl" style={{ aspectRatio: "1.586", boxShadow: "0 0 0 1px rgba(255,255,255,.18), 0 20px 60px -10px rgba(239,68,68,.35), 0 0 80px -20px rgba(56,189,248,.5)" }}>
            {shot && <img src={shot} alt="" className="h-full w-full object-cover" style={{ filter: "brightness(.85) saturate(1.1)" }} />}
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(255,255,255,.06), transparent 40%, rgba(0,0,0,.25))" }} />
            {/* the red beam sweeps left to right and back, without stopping */}
            <div className="idbeam absolute inset-y-0 left-0 w-full">
              <div className="absolute inset-y-0 right-0 w-24" style={{ background: "linear-gradient(90deg, transparent, rgba(239,68,68,.28))" }} />
              <div className="absolute inset-y-0 right-0 w-[3px] rounded-full" style={{ background: "linear-gradient(180deg, transparent, #ff4d4d 15%, #ff2d2d 50%, #ff4d4d 85%, transparent)", boxShadow: "0 0 14px 4px rgba(255,60,60,.85), 0 0 40px 10px rgba(255,60,60,.4)" }} />
            </div>
            {[["left-2 top-2", "border-l-2 border-t-2 rounded-tl-xl"], ["right-2 top-2", "border-r-2 border-t-2 rounded-tr-xl"], ["left-2 bottom-2", "border-l-2 border-b-2 rounded-bl-xl"], ["right-2 bottom-2", "border-r-2 border-b-2 rounded-br-xl"]].map(([pos, cls]) => <span key={pos} className={`absolute h-5 w-5 border-white/90 ${pos} ${cls}`} />)}
          </div>
          <div className="text-center">
            {phase === "frontOk" ? (<><p className="flex items-center justify-center gap-2 text-lg font-extrabold tracking-wide text-emerald-300"><CheckCircle2 className="h-5 w-5" /> Front captured</p><p className="mt-1 h-4 text-xs font-semibold text-sky-200/90">Now turn the ID over</p></>) : (<><p className="text-lg font-extrabold tracking-wide">Reading your ID<span className="iddots" /></p>
            <p className="mt-1 h-4 text-xs font-semibold text-sky-200/90 transition-opacity">{["Finding your name", "Checking your ID number", "Filling in the form", "Almost there"][Math.min(step, 3)]}</p></>)}
          </div>
          <p className="max-w-xs text-center text-[10px] text-white/50">Your ID is private. Only our office can see it.</p>
        </div>
      )}

      {camErr && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-auto p-6 pt-20 text-center">
          <p className="max-w-sm text-sm">The camera could not open here. Take a clear photo of each side with your phone instead.</p>
          {msg && <p className="rounded-xl bg-red-600/90 px-3 py-2 text-xs font-semibold" role="alert">{msg}</p>}
          {phase === "reading" ? <p className="flex items-center gap-2 text-sm font-bold"><Loader2 className="h-4 w-4 animate-spin" /> Reading your ID...</p> : phase === "frontOk" ? <p className="font-extrabold text-emerald-300">Front approved</p> : (
            <label className="cursor-pointer rounded-2xl bg-white px-6 py-3 text-sm font-extrabold text-black">
              Take a photo of the {side.toUpperCase()}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto(side)} />
            </label>
          )}
          {phase === "front" && attempts >= 2 && front.current && <button type="button" onClick={() => { setPhase("back"); setMsg(""); }} className="text-xs font-bold underline">Continue anyway (marked as not matched)</button>}
          <p className="text-[10px] text-white/70">We use your ID only for this {purpose}. It is kept private. If your phone cannot read it, a secure online reader may help.</p>
        </div>
      )}
    </div>
  );
}
