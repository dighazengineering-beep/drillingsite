import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, X } from "lucide-react";

/** Scans a cheque (or a signed cash receipt): a live camera with a cheque-shaped frame. The picture is cut to the frame, shrunk and handed back. */
export default function ChequeScanner({ title = "Scan the cheque", onClose, onDone }: { title?: string; onClose: () => void; onDone: (dataUrl: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); setLive(true); }
      } catch { setErr("The camera could not open here. Use the button below to take or choose a photo."); }
    })();
    return () => { dead = true; stream.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const shrink = (src: CanvasImageSource, sw: number, sh: number, sx = 0, sy = 0, cw = sw, ch = sh) => {
    const max = 1400, k = Math.min(1, max / cw);
    const c = document.createElement("canvas"); c.width = Math.round(cw * k); c.height = Math.round(ch * k);
    c.getContext("2d")!.drawImage(src, sx, sy, cw, ch, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  };
  const snap = () => {
    const v = video.current; if (!v || !v.videoWidth) return;
    // the guide frame is 90% of the width and 2.2 : 1, centred
    const cw = v.videoWidth * 0.9, ch = Math.min(v.videoHeight * 0.9, cw / 2.2);
    onDone(shrink(v, v.videoWidth, v.videoHeight, (v.videoWidth - cw) / 2, (v.videoHeight - ch) / 2, cw, ch));
  };
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const img = new Image(); const url = URL.createObjectURL(f);
    img.onload = () => { onDone(shrink(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(url); };
    img.onerror = () => setErr("That picture could not be read. Try another one.");
    img.src = url;
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-black" style={{ pointerEvents: "auto" }} data-testid="cheque-scanner" data-radix-focus-guard onPointerDownCapture={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between p-3 text-white"><p className="text-sm font-extrabold">{title}</p><button type="button" onClick={onClose} aria-label="Close" className="rounded-full bg-white/15 p-2"><X className="h-5 w-5" /></button></div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        {live && <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-[2.2/1] w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.55)]" />}
        {live && <p className="absolute inset-x-0 bottom-3 text-center text-xs font-semibold text-white">Fit the whole cheque inside the frame, then tap the button.</p>}
        {err && <p className="absolute inset-x-4 top-6 rounded-xl bg-sky-100 p-3 text-xs font-semibold text-sky-900">{err}</p>}
      </div>
      <div className="flex items-center justify-center gap-3 p-4">
        {live && <button type="button" onClick={snap} className="flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-extrabold text-black" data-testid="cheque-snap"><Camera className="h-5 w-5" /> Take picture</button>}
        <label className="cursor-pointer rounded-full border border-white/50 px-4 py-3 text-xs font-bold text-white">Take or choose a photo<input type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} data-testid="cheque-file" /></label>
      </div>
    </div>,
    document.body,
  );
}
