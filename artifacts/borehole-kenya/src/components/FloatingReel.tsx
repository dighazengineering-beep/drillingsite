import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { X, Play, MapPin } from "lucide-react";
import { loadItems, type Item } from "@/components/SuccessShowcase";
import { isLite, isPhone } from "@/lib/lite";

const CLIP_MS = 6000;
const SHOW_AFTER_MS = 2600;
const KEY = "sab_reel_closed";

const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
// Phones and weak devices see the picture only (the video opens when tapped), so a second video never competes with the backdrop
const stillOnly = () => isLite() || isPhone();
const closedBefore = () => { try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; } };

/**
 * A small portrait video that stays on the home page and plays random Successful Boreholes clips, one after another.
 * Tapping it opens that exact video on the Successful Boreholes page. It can be closed for the rest of the visit.
 */
export default function FloatingReel() {
  const [items, setItems] = useState<Item[]>([]);
  const [shown, setShown] = useState(false);
  const [closed, setClosed] = useState(closedBefore);
  const [cur, setCur] = useState<Item | null>(null);
  const [ready, setReady] = useState(false);
  const vid = useRef<HTMLVideoElement>(null);
  const bag = useRef<Item[]>([]);
  const fails = useRef(0);
  const [still] = useState(stillOnly);

  useEffect(() => { loadItems().then(setItems); }, []);
  useEffect(() => { const t = setTimeout(() => setShown(true), SHOW_AFTER_MS); return () => clearTimeout(t); }, []);

  // random order without repeats until every clip has been shown
  const next = useCallback(() => {
    if (items.length === 0) return;
    if (bag.current.length === 0) {
      const b = [...items].sort(() => Math.random() - 0.5);
      if (cur && b.length > 1 && b[0].key === cur.key) b.push(b.shift() as Item);
      bag.current = b;
    }
    setReady(false);
    setCur(bag.current.shift() as Item);
  }, [items, cur]);

  useEffect(() => { if (items.length && !cur) next(); }, [items, cur, next]);

  // change clip every few seconds while the tab is visible
  useEffect(() => {
    if (!cur || closed || !shown || reduced()) return;
    const t = setInterval(() => { if (!document.hidden) next(); }, CLIP_MS);
    return () => clearInterval(t);
  }, [cur, closed, shown, next]);

  useEffect(() => {
    const v = vid.current;
    if (!v || !cur || closed || reduced() || still) return;
    v.src = cur.preview;
    v.muted = true;
    v.play().catch(() => {});
  }, [cur, closed]);

  if (closed || !cur || items.length === 0) return null;

  return (
    <div
      data-testid="floating-reel"
      className={`fixed bottom-11 right-3 z-30 w-[104px] transition-all duration-700 sm:bottom-12 sm:right-5 sm:w-[148px] ${shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"}`}
    >
      <Link
        href={`/feed?v=${encodeURIComponent(cur.key)}`}
        aria-label={`Watch: ${cur.title}`}
        className="group relative block aspect-[9/16] overflow-hidden rounded-2xl bg-[hsl(160_40%_9%)] shadow-[0_18px_40px_-12px_rgba(0,0,0,.75)] ring-2 ring-white/70 transition hover:ring-sky-300"
      >
        {cur.poster && <img src={cur.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        {!still && <video
          ref={vid}
          muted loop playsInline preload="auto"
          onPlaying={() => { fails.current = 0; setReady(true); }}
          onError={() => { if (++fails.current < 6) next(); }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`}
        />}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, hsl(160 52% 6% / .5) 0%, transparent 25%, transparent 55%, hsl(160 52% 6% / .9) 100%)" }} />
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-red-500" /> Watch
        </span>
        <span className="absolute inset-x-0 bottom-0 p-2 text-white">
          <span className="block text-[8px] font-semibold uppercase tracking-[0.12em] text-sky-300">Successful borehole</span>
          <span className="mt-0.5 flex items-start gap-0.5 text-[10px] font-bold leading-tight sm:text-xs">
            <MapPin className="mt-px h-3 w-3 shrink-0 text-white/70" />
            <span className="line-clamp-2">{cur.place}</span>
          </span>
        </span>
        <span className="absolute right-2 top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-900 opacity-0 transition group-hover:opacity-100 sm:flex">
          <Play className="ml-0.5 h-3 w-3 fill-current" />
        </span>
      </Link>
      <button
        onClick={() => { setClosed(true); try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ } }}
        aria-label="Close video"
        className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(160_40%_9%)] text-white shadow ring-1 ring-white/50 transition hover:bg-slate-700"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
