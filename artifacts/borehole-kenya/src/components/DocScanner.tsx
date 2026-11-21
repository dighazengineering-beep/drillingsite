import { useCallback, useEffect, useRef, useState } from "react";
import { X, Loader2, Camera, AlertTriangle } from "lucide-react";

/** A simple document scanner: live camera, a guide frame, and a photo taken by itself once the paper is steady and clear.
 *  The picture is cropped to the frame. If the camera is blocked, the client can take a photo instead. */
export default function DocScanner({ title, hint, ratio = 2.3, onClose, onDone }: { title: string; hint: string; ratio?: number; onClose: () => void; onDone: (jpeg: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const steady = useRef(0), prev = useRef<Uint8ClampedArray | null>(null), done = useRef(false);
  const [camErr, setCamErr] = useState(false), [msg, setMsg] = useState("Starting the camera..."), [good, setGood] = useState(false), [warn, setWarn] = useState(false), [busy, setBusy] = useState(false);

  // the guide frame, as a share of the video picture (centred, 88% wide)
  const frame = useCallback((vw: number, vh: number) => {
    const w = vw * 0.88, h = Math.min(vh * 0.8, w / ratio), ww = Math.min(w, h * ratio);
    return { x: (vw - ww) / 2, y: (vh - h) / 2, w: ww, h };
  }, [ratio]);

  const grab = useCallback(() => {
    const v = video.current; if (!v || !v.videoWidth || done.current) return;
    done.current = true; setBusy(true);
    const f = frame(v.videoWidth, v.videoHeight), k = Math.min(1, 1500 / f.w);
    const c = document.createElement("canvas"); c.width = Math.round(f.w * k); c.height = Math.round(f.h * k);
    c.getContext("2d")!.drawImage(v, f.x, f.y, f.w, f.h, 0, 0, c.width, c.height);
    stream.current?.getTracks().forEach((t) => t.stop());
    onDone(c.toDataURL("image/jpeg", 0.8));
  }, [frame, onDone]);

  useEffect(() => {
    let timer = 0, dead = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s; const v = video.current!; v.srcObject = s; await v.play().catch(() => {});
        setMsg("Put the cheque inside the frame");
        const cv = document.createElement("canvas"); cv.width = 160; cv.height = Math.round(160 / ratio); const cx = cv.getContext("2d", { willReadFrequently: true })!;
        timer = window.setInterval(() => {
          if (done.current || !v.videoWidth) return;
          const f = frame(v.videoWidth, v.videoHeight); cx.drawImage(v, f.x, f.y, f.w, f.h, 0, 0, cv.width, cv.height);
          const d = cx.getImageData(0, 0, cv.width, cv.height).data, n = cv.width * cv.height, g = new Uint8ClampedArray(n);
          let sum = 0; for (let i = 0; i < n; i++) { g[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10; sum += g[i]; }
          const mean = sum / n; let edge = 0; for (let y = 0; y < cv.height - 1; y++) for (let x = 0; x < cv.width - 1; x++) { const i = y * cv.width + x; edge += Math.abs(g[i] - g[i + 1]) + Math.abs(g[i] - g[i + cv.width]); }
          edge /= n; let move = 0; if (prev.current) { for (let i = 0; i < n; i += 4) move += Math.abs(g[i] - prev.current[i]); move /= n / 4; } prev.current = g;
          if (mean < 70) { setWarn(true); setGood(false); setMsg("Too dark. Move to a brighter place."); steady.current = 0; return; }
          setWarn(false);
          if (edge < 6) { setGood(false); setMsg("Put the cheque inside the frame"); steady.current = 0; return; }
          if (move > 6) { setGood(false); setMsg("Hold still..."); steady.current = 0; return; }
          steady.current++; setGood(true); setMsg("Hold still, scanning...");
          if (steady.current >= 5) grab(); // about 1.3 seconds steady
        }, 260);
      } catch { setCamErr(true); }
    })();
    return () => { dead = true; window.clearInterval(timer); stream.current?.getTracks().forEach((t) => t.stop()); };
  }, [frame, grab, ratio]);

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const im = new Image(); setBusy(true);
    im.onload = () => { const k = Math.min(1, 1500 / Math.max(im.width, im.height)); const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(im.src); onDone(c.toDataURL("image/jpeg", 0.8)); };
    im.onerror = () => { setBusy(false); setMsg("Could not read that photo."); };
    im.src = URL.createObjectURL(f);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white" data-testid="doc-scanner">
      <div className="flex items-center justify-between px-4 py-3"><b className="text-sm">{title}</b><button type="button" onClick={onClose} aria-label="Close" className="rounded-full bg-white/15 p-2"><X className="h-4 w-4" /></button></div>
      {!camErr ? (
        <div className="relative flex-1 overflow-hidden">
          <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border-4 transition-colors" style={{ width: "88%", maxHeight: "80%", aspectRatio: String(ratio), borderColor: good ? "#34d399" : "#fff", boxShadow: "0 0 0 100vmax rgba(0,0,0,.55)" }} />
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/85 to-transparent px-4 pb-6 pt-10">
            <p className={`text-center text-sm font-bold ${good ? "text-emerald-300" : ""} ${warn ? "flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2 text-black" : ""}`} role={warn ? "alert" : undefined}>{warn && <AlertTriangle className="h-4 w-4" />}{msg}</p>
            <p className="text-center text-xs text-white/75">{hint}</p>
            <button type="button" onClick={grab} className="grid h-16 w-16 place-items-center rounded-full border-4 border-white bg-white/25 active:scale-95" aria-label="Take the picture now"><Camera className="h-6 w-6" /></button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="max-w-sm text-sm">The camera could not open here. Take a clear photo of the cheque instead.</p>
          <label className="cursor-pointer rounded-2xl bg-white px-6 py-3 text-sm font-extrabold text-black">Take a photo<input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} /></label>
        </div>
      )}
      {busy && <div className="absolute inset-0 grid place-items-center bg-black/70"><Loader2 className="h-8 w-8 animate-spin" /></div>}
    </div>
  );
}
