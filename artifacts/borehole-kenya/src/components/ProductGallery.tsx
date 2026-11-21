import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function ProductGallery({ images, alt, fallback }: { images: string[]; alt: string; fallback: React.ReactNode }) {
  const [i, setI] = useState(0);
  const startX = useRef<number | null>(null);
  const n = images.length;
  if (n === 0) return <div className="rounded-xl bg-muted h-72 lg:h-[420px] flex items-center justify-center">{fallback}</div>;
  const go = (d: number) => setI((v) => (v + d + n) % n);

  return (
    <div className="select-none">
      <div
        className="relative rounded-xl overflow-hidden bg-white border border-border h-72 sm:h-96 lg:h-[420px] flex items-center justify-center"
        onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (startX.current === null) return;
          const dx = e.changedTouches[0].clientX - startX.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          startX.current = null;
        }}
      >
        <img key={images[i]} src={images[i]} alt={`${alt} - photo ${i + 1}`} className="max-h-full max-w-full object-contain p-3 animate-in fade-in-0 duration-300" />
        {n > 1 && (
          <>
            <button aria-label="Previous photo" onClick={() => go(-1)} data-testid="button-prev-photo" className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/90 shadow border border-border flex items-center justify-center hover:bg-white active:scale-95 transition">
              <ChevronLeft className="h-5 w-5 text-primary" />
            </button>
            <button aria-label="Next photo" onClick={() => go(1)} data-testid="button-next-photo" className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/90 shadow border border-border flex items-center justify-center hover:bg-white active:scale-95 transition">
              <ChevronRight className="h-5 w-5 text-primary" />
            </button>
            <span className="absolute bottom-2 right-3 text-[11px] font-medium bg-slate-900/70 text-white rounded-full px-2 py-0.5">{i + 1} / {n}</span>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="flex gap-2 mt-2.5 justify-center">
          {images.map((src, k) => (
            <button key={src} onClick={() => setI(k)} aria-label={`Show photo ${k + 1}`} className={`h-14 w-14 rounded-lg bg-white overflow-hidden border-2 transition ${k === i ? "border-primary" : "border-border opacity-70 hover:opacity-100"}`}>
              <img src={src} alt="" className="h-full w-full object-contain p-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
