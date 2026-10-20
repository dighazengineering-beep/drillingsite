import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Play, ChevronLeft, ChevronRight, ArrowRight, MessageCircle, MapPin } from "lucide-react";
import { LiveTitle, Key } from "@/components/LiveTitle";
import { whatsappLink } from "@/lib/utils";

export interface Item { key: string; title: string; place: string; poster?: string; src: string; preview: string }

/** Videos posted from /admin on Cloudinary: a small clean H.264 MP4 for the floating video and hover previews (no sound, first 8 seconds, at most 360 px wide). */
function cloudinaryPreview(url: string): string | null {
  if (!/^https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\//.test(url)) return null;
  return url.replace("/video/upload/", "/video/upload/c_limit,w_360,q_auto:good,vc_h264,f_mp4,ac_none,so_0,du_8/").replace(/\.\w+$/, ".mp4");
}

const base = import.meta.env.BASE_URL;
const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");
const MAX_CARDS = 12;

const placeOf = (title: string) => title.replace(/^successful borehole in\s*/i, "").trim() || title;

/** Newest uploads from /admin first, then the videos that ship with the site. Loaded once and shared. */
let cache: Promise<Item[]> | null = null;
export function loadItems(): Promise<Item[]> {
  cache ??= (async () => {
    const staticList: Item[] = await fetch(`${base}videos/feed.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: { file?: string; poster?: string; title: string }[]) =>
        (Array.isArray(d) ? d : []).filter((v) => v.file).map((v) => ({
          key: v.file as string, title: v.title, place: placeOf(v.title),
          src: `${base}videos/${v.file}`, preview: `${base}videos/preview/${v.file}`, poster: v.poster ? `${base}videos/${v.poster}` : undefined,
        })))
      .catch(() => []);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 7000); // the free server can be slow to wake up
    const uploaded: Item[] = await fetch(`${API}/api/feed-videos`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((d: { id: number; url: string; poster?: string; title: string; source?: string; createdAt?: string; category?: string }[]) =>
        (Array.isArray(d) ? d : [])
          // the Home showcase shows finished boreholes only; the other groups live on the Project Videos page
          .filter((v) => !v.category || v.category === "boreholes")
          // a GitHub upload goes live after the site rebuilds (about 4 minutes)
          .filter((v) => v.source !== "github" || !v.createdAt || Date.now() > new Date(v.createdAt + "Z").getTime() + 4 * 60_000)
          .map((v) => ({
            key: `db-${v.id}`, title: v.title, place: placeOf(v.title),
            src: v.source === "github" ? `${base}${v.url}` : v.url, poster: v.poster ?? undefined,
            preview: (v.source === "github" ? null : cloudinaryPreview(v.url)) ?? (v.source === "github" ? `${base}${v.url}` : v.url),
          })))
      .catch(() => [])
      .finally(() => clearTimeout(timer));
    return [...uploaded, ...staticList].slice(0, MAX_CARDS);
  })();
  return cache;
}

function Card({ item }: { item: Item }) {
  const vid = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  // Hover preview on computers only; phones just show the picture and open the video on tap
  const canHover = typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches;
  const start = () => {
    const v = vid.current;
    if (!v || !canHover) return;
    if (!v.src) { v.src = item.preview; }
    v.currentTime = 0;
    v.play().then(() => setPlaying(true)).catch(() => {});
  };
  const stop = () => {
    const v = vid.current;
    if (!v) return;
    v.pause();
    setPlaying(false);
  };

  return (
    <Link
      href={`/feed?v=${encodeURIComponent(item.key)}`}
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
      data-testid="showcase-card"
      aria-label={`Watch: ${item.title}`}
      className="group relative block aspect-[9/14] w-[168px] shrink-0 snap-start overflow-hidden rounded-2xl bg-[hsl(160_40%_9%)] shadow-[0_12px_30px_-12px_rgba(0,0,0,.7)] ring-1 ring-white/10 transition duration-300 hover:-translate-y-1 hover:ring-sky-300/60 sm:w-[200px]"
    >
      {item.poster ? (
        <img src={item.poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, hsl(155 56% 22%), hsl(160 52% 9%))" }} />
      )}
      <video
        ref={vid}
        muted loop playsInline preload="none"
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${playing ? "opacity-100" : "opacity-0"}`}
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, hsl(160 52% 6% / .35) 0%, transparent 28%, transparent 48%, hsl(160 52% 6% / .92) 100%)" }} />

      <span className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-md transition group-hover:bg-sky-300">
        <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
      </span>

      <div className="absolute inset-x-0 bottom-0 p-3.5 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">Successful borehole</p>
        <p className="mt-0.5 flex items-start gap-1 text-sm font-bold leading-snug">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/70" />
          <span className="line-clamp-2">{item.place}</span>
        </p>
      </div>
    </Link>
  );
}

export default function SuccessShowcase() {
  const [items, setItems] = useState<Item[]>([]);
  const row = useRef<HTMLDivElement>(null);

  useEffect(() => { loadItems().then(setItems); }, []);
  if (items.length === 0) return null;

  const slide = (dir: number) => row.current?.scrollBy({ left: dir * 420, behavior: "smooth" });

  return (
    <section className="px-4 py-8 sm:px-6" aria-labelledby="showcase-title" data-testid="success-showcase">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl ring-1 ring-white/10 shadow-[0_30px_70px_-30px_rgba(0,0,0,.8)]"
        style={{ background: "linear-gradient(135deg, hsl(160 52% 7% / .86) 0%, hsl(158 54% 12% / .80) 55%, hsl(155 56% 17% / .74) 100%)" }}>
        <div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-xl">
              <p className="live-fade text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300">Proven results</p>
              <h2 id="showcase-title" className="mt-1.5 text-2xl font-extrabold leading-tight text-white sm:text-3xl">
                <LiveTitle text="Successful Boreholes Across Kenya" hi="#bae6fd" />
              </h2>
              <p className="live-fade mt-2 text-sm text-white/75 sm:text-base" style={{ ["--d" as string]: "0.5s" }}>
                <Key hi="#bae6fd">Real drilling, real water.</Key> Watch boreholes our crews have recently completed for homes, farms and businesses.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => slide(-1)} aria-label="Previous videos" className="hidden h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition hover:bg-white/20 md:flex"><ChevronLeft className="h-5 w-5" /></button>
              <button onClick={() => slide(1)} aria-label="Next videos" className="hidden h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition hover:bg-white/20 md:flex"><ChevronRight className="h-5 w-5" /></button>
              <Link href="/feed" data-testid="showcase-watch-all" className="inline-flex items-center gap-2 rounded-full bg-sky-400 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-sky-300 active:scale-[.98]">
                Watch all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div
            ref={row}
            className="-mx-5 mt-6 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {items.map((it) => <Card key={it.key} item={it} />)}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
            <p className="text-sm font-medium text-white/85">Want your borehole to be the next success story?</p>
            <div className="flex flex-wrap gap-2.5">
              <Link href="/contact" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow transition hover:bg-white/90">
                Get a free quote <ArrowRight className="h-4 w-4" />
              </Link>
              <a href={whatsappLink("Hello, I saw your successful boreholes and would like a free quote.")} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-[#20bd5a]">
                <MessageCircle className="h-4 w-4" /> WhatsApp us
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
