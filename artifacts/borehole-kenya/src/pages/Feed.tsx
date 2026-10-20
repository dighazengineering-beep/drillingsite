import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VIDEO_CATS, catOf, type VideoCat } from "@/lib/videoCats";
import { memberToken, memberApi, signOutMember, claimAdmin } from "@/lib/member";
import { Link } from "wouter";
import { MessageCircle, MapPin, Volume2, VolumeX, X, Droplets, Construction, Sun, Gauge, Search, Compass, FlaskConical, Send, Trash2, ThumbsUp, MoreHorizontal, Reply, Play, Pause, ShieldCheck, LocateFixed, Heart, Share2, Eye, Plus, UploadCloud, ChevronsDown } from "lucide-react";
import { whatsappLink } from "@/lib/utils";
import PlaceInput from "@/components/PlaceInput";
import { countySuggestions, subCountySuggestions, wardSuggestions, villageSuggestions, rememberVillage, whereAmI, reverseGeocode, loadAreas } from "@/lib/places";
const MapPicker = lazy(() => import("@/components/MapPicker"));

export interface FeedVideo {
  key: string; // id used for likes, comments and share links
  src: string;
  poster?: string;
  title: string;
  location?: string;
  village?: string;
  lat?: number;
  lng?: number;
  mine?: boolean; // posted by the signed-in poster, who may delete it
  category?: VideoCat;
  dbId?: number; // set for videos uploaded from the website (admin can delete these)
  publishingUntil?: number; // GitHub uploads take ~2 minutes to appear on the site
}
interface Comment { id: number; name: string; body: string; createdAt: string; parentId?: number | null; replyTo?: string | null; likes: number; liked: boolean; mine: boolean }
interface Stat { likes: number; views: number; shares: number; comments: number }
const ZERO: Stat = { likes: 0, views: 0, shares: 0, comments: 0 };

const base = import.meta.env.BASE_URL;
export const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");
export const api = (path: string) => `${API}/api/video-comments${path}`;
const statsApi = (path: string) => `${API}/api/video-stats${path}`;

export const store = {
  get: (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } },
  set: (k: string, v: string) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* ignore */ } },
};
// anonymous id so one visitor = one like per video
const clientId = (() => {
  let id = store.get("kws_client");
  if (!id) { id = (crypto?.randomUUID?.() ?? String(Math.random()).slice(2) + Date.now()); store.set("kws_client", id); }
  return id;
})();

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

const ago = (iso: string) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

const CAT_ICON: Record<VideoCat, typeof Droplets> = {
  boreholes: Droplets, drilling: Construction, solar: Sun, pump: Gauge, inspection: Search, survey: Compass, purification: FlaskConical,
};

export default function Feed() {
  const [allVideos, setVideos] = useState<FeedVideo[] | null>(null);
  // opens on Water Found unless a link asks for another group
  const [cat, setCat] = useState<VideoCat>(() => catOf(new URLSearchParams(window.location.search).get("cat")));
  const [edge, setEdge] = useState({ l: false, r: true }); // is there more to swipe to on the left / right of the tab bar
  const tabsRef = useRef<HTMLDivElement>(null);
  const readEdges = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    const l = el.scrollLeft > 4, r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdge((e) => (e.l === l && e.r === r ? e : { l, r }));
  }, []);
  useEffect(() => { readEdges(); }, [readEdges]);
  // Bring the chosen tab to the middle of the bar, only when the chosen tab changes (never while the person is swiping the bar)
  useEffect(() => {
    const bar = tabsRef.current;
    const btn = bar?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!bar || !btn) return;
    const b = btn.getBoundingClientRect(), r = bar.getBoundingClientRect();
    bar.scrollTo({ left: Math.max(0, bar.scrollLeft + (b.left - r.left) - (r.width - b.width) / 2), behavior: "smooth" });
  }, [cat]);
  const catRef = useRef(cat);
  catRef.current = cat;
  const videos = useMemo(() => (allVideos ? allVideos.filter((v) => (v.category ?? "boreholes") === cat) : allVideos), [allVideos, cat]);
  // switching tab: back to the first video of that group
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); setActive(0); }, [cat]);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(() => store.get("kws_feed_muted") === "1"); // sound is ON unless the visitor muted it
  const [blocked, setBlocked] = useState(false); // the browser refused sound until the first tap
  const [auto, setAuto] = useState(() => store.get("kws_feed_auto") !== "0"); // auto-scroll to the next video when one ends
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number; slide: number }[]>([]);
  const [flash, setFlash] = useState<{ slide: number; paused: boolean; n: number } | null>(null);
    const [toast, setToast] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState(() => store.get("kws_admin"));
  // A signed-in member on the poster list can post (and delete their own) videos, like the admin can
  const [memberTok] = useState(() => memberToken());
  useEffect(() => { if (!adminKey) claimAdmin().then((k) => { if (k) setAdminKey(k); }); }, []);
  const [canPost, setCanPost] = useState(false);
  const [needsGoogle, setNeedsGoogle] = useState(false);
  useEffect(() => {
    if (adminKey || !memberTok) return;
    fetch(`${API}/api/feed-videos/can-upload`, { headers: { Authorization: `Bearer ${memberTok}` } })
      .then((r) => r.json()).then((d) => { setCanPost(!!d.canUpload); setNeedsGoogle(!!d.needsGoogle); }).catch(() => {});
  }, [adminKey, memberTok]);
  const [uploading, setUploading] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const els = useRef<(HTMLVideoElement | null)[]>([]);
  const mutedRef = useRef(muted);
  const autoRef = useRef(auto);
  const unlockedAt = useRef(0);
  const bars = useRef<(HTMLDivElement | null)[]>([]);
  const lastTap = useRef({ t: 0, i: -1 });
  const tapTimer = useRef<number | undefined>(undefined);
  const viewed = useRef<Set<string>>(new Set());
  const likedRef = useRef(liked);
  mutedRef.current = muted;
  autoRef.current = auto;
  likedRef.current = liked;

  const stat = (id: string) => stats[id] ?? ZERO;
  const bump = useCallback((id: string, key: keyof Stat, d: number) =>
    setStats((s) => ({ ...s, [id]: { ...(s[id] ?? ZERO), [key]: Math.max(0, (s[id]?.[key] ?? 0) + d) } })), []);
  const say = (m: string) => { setToast(m); window.setTimeout(() => setToast(""), 1800); };

  useEffect(() => {
    const loadAll = async () => {
      const staticList: FeedVideo[] = await fetch(`${base}videos/feed.json`, { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => (Array.isArray(d) ? d : []))
        .catch(() => [])
        .then((d: { file?: string; poster?: string; title: string; location?: string; category?: string }[]) =>
          d.filter((v) => v.file).map((v) => ({
            key: v.file as string, src: `${base}videos/${v.file}`, poster: v.poster ? `${base}videos/${v.poster}` : undefined,
            title: v.title, location: v.location, category: "boreholes" as VideoCat,
          })));
      const tok = memberToken();
      const uploaded: FeedVideo[] = await fetch(`${API}/api/feed-videos`, tok ? { headers: { Authorization: `Bearer ${tok}` } } : undefined)
        .then((r) => r.json())
        .then((d: { id: number; url: string; poster?: string; title: string; location?: string; village?: string | null; lat?: number | null; lng?: number | null; mine?: boolean; source?: string; createdAt?: string; category?: string }[]) =>
          (Array.isArray(d) ? d : []).map((v) => ({
            key: `db-${v.id}`, dbId: v.id, title: v.title, location: v.location ?? undefined, category: catOf(v.category),
            village: v.village ?? undefined, lat: v.lat ?? undefined, lng: v.lng ?? undefined, mine: !!v.mine,
            src: v.source === "github" ? `${base}${v.url}` : v.url, poster: v.poster ?? undefined,
            publishingUntil: v.source === "github" && v.createdAt ? new Date(v.createdAt + "Z").getTime() + 4 * 60_000 : undefined,
          })))
        .catch(() => []);
      // a GitHub upload is hidden from visitors until the site has rebuilt (about 2 minutes); admin sees it straight away
      const adminNow = !!store.get("kws_admin");
      const list = [...uploaded.filter((v) => adminNow || !v.publishingUntil || Date.now() > v.publishingUntil), ...staticList];
      setVideos(list);
      // shared link: /feed?v=key opens that video
      const want = new URLSearchParams(window.location.search).get("v");
      // a shared video link opens in that video's own group
      const target = want ? list.find((v) => v.key === want) : undefined;
      if (target && (target.category ?? "boreholes") !== catRef.current) { catRef.current = target.category ?? "boreholes"; setCat(catRef.current); }
      const shown = list.filter((v) => (v.category ?? "boreholes") === catRef.current);
      const idx = want ? shown.findIndex((v) => v.key === want) : -1;
      if (idx > 0) window.setTimeout(() => scroller.current?.scrollTo({ top: idx * scroller.current.clientHeight }), 60);
    };
    loadAll();
    fetch(statsApi(`?clientId=${encodeURIComponent(clientId)}`))
      .then((r) => r.json())
      .then((d) => { setStats(d.stats ?? {}); setLiked(new Set(d.liked ?? [])); })
      .catch(() => {});
  }, []);

  // Admin sign-in: open the page once with ?admin=1
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("admin")) return;
    const key = window.prompt("Admin key");
    if (!key) return;
    fetch(api("/admin-check"), { method: "POST", headers: { "x-admin-key": key } })
      .then((r) => r.json())
      .then((d) => {
        if (d.admin) { store.set("kws_admin", key); setAdminKey(key); }
        else window.alert("Wrong admin key");
      })
      .catch(() => window.alert("Could not reach the server"));
  }, []);

  // Keep only the video on screen and its neighbours loaded. Loading five videos at once starves the one that is playing
  // (it stops halfway), and a half-loaded video can get stuck. Far-away videos are fully unloaded to free memory.
  const loadWindow = useCallback((center: number) => {
    (videos ?? []).forEach((v, i) => {
      const el = els.current[i];
      if (!el) return;
      const near = i >= center - 1 && i <= center + 1;
      if (near) {
        if (el.getAttribute("src") !== v.src) { el.src = v.src; }
        el.preload = i === center || i === center + 1 ? "auto" : "metadata";
      } else if (el.getAttribute("src")) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
    });
  }, [videos]);
  useEffect(() => { loadWindow(active); }, [active, loadWindow]);

  // Start the video again from the beginning when it comes back on screen
  const rewind = useRef<Set<number>>(new Set());
  const [buffering, setBuffering] = useState(false);

  // If the playing video freezes (a slow connection, or the phone paused its download), reload it and carry on from the same spot
  useEffect(() => {
    let lastT = -1; let still = 0;
    const id = window.setInterval(() => {
      const v = els.current[activeRef.current];
      if (!v || v.paused || v.ended || document.hidden) { still = 0; lastT = -1; return; }
      if (v.currentTime === lastT) still += 1; else { still = 0; lastT = v.currentTime; }
      if (still >= 3 && v.readyState < 3) {
        still = 0;
        const t = v.currentTime;
        const src = videos?.[activeRef.current]?.src;
        if (!src) return;
        v.src = src; v.load();
        v.addEventListener("loadedmetadata", () => { try { v.currentTime = t; } catch { /* ignore */ } v.play().catch(() => {}); }, { once: true });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [videos]);

  // Play the video that is on screen, pause the rest
  useEffect(() => {
    const root = scroller.current;
    if (!root || !videos?.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const i = Number((e.target as HTMLElement).dataset.i);
          const v = els.current[i];
          if (!v) return;
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            setActive(i);
            const want = videos[i]?.src;
            if (want && v.getAttribute("src") !== want) v.src = want; // a fast scroll can land on a video that is not loaded yet
            if (rewind.current.has(i)) { rewind.current.delete(i); try { v.currentTime = 0; } catch { /* not loaded yet */ } }
            v.muted = mutedRef.current;
            v.play().catch(() => {
              // Browser blocked playing with sound: play silently and offer a "Tap for sound" button
              if (!mutedRef.current) { v.muted = true; setBlocked(true); }
              v.play().catch(() => {});
            });
          } else {
            v.pause();
            if (e.intersectionRatio === 0) rewind.current.add(i);
          }
        });
      },
      { root, threshold: [0, 0.6, 1] },
    );
    root.querySelectorAll("[data-i]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [videos]);

  useEffect(() => {
    els.current.forEach((v) => { if (v) v.muted = muted; });
    store.set("kws_feed_muted", muted ? "1" : "");
    if (muted) setBlocked(false);
  }, [muted]);

  // The first tap or key press lets the browser play sound: turn it on for the video on screen
  useEffect(() => {
    if (!blocked) return;
    const unlock = () => {
      unlockedAt.current = Date.now();
      setBlocked(false);
      const v = els.current[activeRef.current];
      if (!v) return;
      v.muted = false;
      v.play().catch(() => { v.muted = true; setBlocked(true); v.play().catch(() => {}); });
    };
    window.addEventListener("click", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => { window.removeEventListener("click", unlock, true); window.removeEventListener("keydown", unlock, true); };
  }, [blocked]);

  const toggleAuto = () => {
    const next = !auto;
    setAuto(next);
    store.set("kws_feed_auto", next ? "" : "0");
    say(next ? "Auto-scroll on" : "Auto-scroll off");
  };
  // When a video finishes, glide to the next one (back to the first after the last)
  const goNext = (i: number) => {
    const s = scroller.current;
    const n = videos?.length ?? 0;
    if (!s || n < 2) return;
    if (i + 1 < n) s.scrollTo({ top: (i + 1) * s.clientHeight, behavior: "smooth" });
    else s.scrollTo({ top: 0, behavior: "auto" });
  };

  // Keyboard: arrow keys / space like on desktop reels
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (openId || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const s = scroller.current;
      if (!s) return;
      if (e.key === "ArrowDown") { e.preventDefault(); s.scrollBy({ top: s.clientHeight, behavior: "smooth" }); }
      if (e.key === "ArrowUp") { e.preventDefault(); s.scrollBy({ top: -s.clientHeight, behavior: "smooth" }); }
      if (e.key === " ") { e.preventDefault(); togglePlay(activeRef.current); }
      if (e.key.toLowerCase() === "m") setMuted((m) => !m);
      if (e.key.toLowerCase() === "l") likeVideo(activeRef.current, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const activeRef = useRef(0);
  activeRef.current = active;

  // A view counts after 3 seconds of watching (once per visit)
  useEffect(() => {
    const v = videos?.[active];
    if (!v || viewed.current.has(v.key)) return;
    const id = window.setTimeout(() => {
      viewed.current.add(v.key);
      bump(v.key, "views", 1);
      fetch(statsApi(`/${encodeURIComponent(v.key)}/view`), { method: "POST" }).catch(() => {});
    }, 3000);
    return () => window.clearTimeout(id);
  }, [active, videos, bump]);

  const togglePlay = (i: number) => {
    const v = els.current[i];
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
    setFlash({ slide: i, paused: v.paused, n: Date.now() });
    window.setTimeout(() => setFlash((f) => (f && Date.now() - f.n >= 600 ? null : f)), 650);
  };

  const likeVideo = (i: number, only = false) => {
    const v = videos?.[i];
    if (!v) return;
    const isLiked = likedRef.current.has(v.key);
    if (only && isLiked) return;
    const next = !isLiked;
    setLiked((s) => { const n = new Set(s); next ? n.add(v.key) : n.delete(v.key); return n; });
    bump(v.key, "likes", next ? 1 : -1);
    fetch(statsApi(`/${encodeURIComponent(v.key)}/like`), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, liked: next }),
    }).catch(() => {});
  };

  const burst = (slide: number, x: number, y: number) => {
    const id = Date.now() + Math.random();
    setHearts((h) => [...h, { id, x, y, slide }]);
    window.setTimeout(() => setHearts((h) => h.filter((p) => p.id !== id)), 900);
  };

  // single tap = pause/play, double tap = like (with heart burst)
  const onTap = (e: React.MouseEvent, i: number) => {
    const now = Date.now();
    if (now - unlockedAt.current < 500) return; // this tap only turned the sound on
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (lastTap.current.i === i && now - lastTap.current.t < 300) {
      window.clearTimeout(tapTimer.current);
      lastTap.current = { t: 0, i: -1 };
      burst(i, e.clientX - r.left, e.clientY - r.top);
      likeVideo(i, true);
      return;
    }
    lastTap.current = { t: now, i };
    tapTimer.current = window.setTimeout(() => togglePlay(i), 300);
  };

  const share = async (v: FeedVideo) => {
    const url = `${window.location.origin}${base}feed?v=${encodeURIComponent(v.key)}`.replace(/([^:])\/\//g, "$1/");
    const data = { title: v.title, text: `${v.title} | Dighaz Engineering Limited`, url };
    let done = false;
    if (navigator.share) {
      try { await navigator.share(data); done = true; } catch (e) { if ((e as Error)?.name === "AbortError") return; }
    }
    if (!done) {
      try { await navigator.clipboard.writeText(url); say("Link copied"); done = true; }
      catch { window.prompt("Copy this link", url); done = true; }
    }
    bump(v.key, "shares", 1);
    fetch(statsApi(`/${encodeURIComponent(v.key)}/share`), { method: "POST" }).catch(() => {});
  };

  const removeVideo = async (v: FeedVideo) => {
    if (!v.dbId || !window.confirm(`Delete "${v.title}" from the page?`)) return;
    const r = await fetch(`${API}/api/feed-videos/${v.dbId}`, { method: "DELETE", headers: adminKey ? { "x-admin-key": adminKey } : { Authorization: `Bearer ${memberTok}` } });
    if (r.status === 403) {
      if (adminKey) { store.set("kws_admin", ""); setAdminKey(""); window.alert("Admin key no longer valid"); }
      else window.alert("You can only delete your own videos.");
      return;
    }
    if (r.ok) setVideos((l) => (l ?? []).filter((x) => x.key !== v.key));
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>, i: number) => {
    const v = els.current[i];
    if (!v || !v.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - r.left) / r.width) * v.duration;
  };

  return (
    <div className="fixed inset-0 bg-black pt-16">
      <div
        ref={scroller}
        className="h-full overflow-y-scroll snap-y snap-mandatory overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {videos === null && <div className="grid h-full place-items-center text-sm text-white/70">Loading…</div>}
        {videos?.length === 0 && (
          <div className="grid h-full place-items-center px-6 text-center text-white">
            <div><Play className="mx-auto mb-2 h-8 w-8" /><p className="font-bold">{`No ${VIDEO_CATS.find((c) => c.id === cat)?.label} videos yet`}</p><p className="text-sm text-white/70">Check back soon.</p></div>
          </div>
        )}
        {videos?.map((v, i) => {
          const s = stat(v.key);
          const isLiked = liked.has(v.key);
          return (
            <section key={v.key} data-i={i} className="relative flex h-full snap-start snap-always justify-center bg-black">
              <div className="relative h-full w-full select-none md:max-w-[440px]">
                <video
                  ref={(el) => { els.current[i] = el; }}
                  poster={v.poster}
                  loop={!auto}
                  muted={muted}
                  playsInline
                  disablePictureInPicture
                  preload="none"
                  onClick={(e) => onTap(e, i)}
                  onWaiting={() => { if (i === activeRef.current) setBuffering(true); }}
                  onPlaying={() => { if (i === activeRef.current) setBuffering(false); }}
                  onCanPlay={() => { if (i === activeRef.current) setBuffering(false); }}
                  onError={(e) => { const el = e.currentTarget; if (el.getAttribute("src")) window.setTimeout(() => { el.load(); if (i === activeRef.current) el.play().catch(() => {}); }, 800); }}
                  onEnded={() => { if (autoRef.current && i === activeRef.current) goNext(i); }}
                  onTimeUpdate={(e) => {
                    const b = bars.current[i]; const d = e.currentTarget.duration;
                    if (b && d) b.style.width = `${(e.currentTarget.currentTime / d) * 100}%`;
                  }}
                  className="h-full w-full cursor-pointer object-cover"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 to-transparent" />
                {buffering && i === active && (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-label="Loading video">
                    <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
                  </div>
                )}

                {/* play / pause flash */}
                {flash?.slide === i && (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <span key={flash.n} className="grid h-16 w-16 animate-ping place-items-center rounded-full bg-black/40 text-white [animation-iteration-count:1] [animation-duration:.6s]">
                      {flash.paused ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
                    </span>
                  </div>
                )}

                {/* double-tap hearts */}
                {hearts.filter((h) => h.slide === i).map((h) => (
                  <Heart key={h.id} className="pointer-events-none absolute h-24 w-24 -translate-x-1/2 -translate-y-1/2 animate-bounce fill-red-500 text-red-500 drop-shadow-lg [animation-iteration-count:1] [animation-duration:.8s]"
                    style={{ left: h.x, top: h.y }} />
                ))}

                <div className="pointer-events-none absolute bottom-6 left-4 right-20 text-white">
                  <h2 className="text-base font-bold leading-tight drop-shadow">{v.title}</h2>
                  {(v.location || v.village) && (
                    <a
                      href={v.lat != null && v.lng != null
                        ? `https://www.google.com/maps?q=${v.lat},${v.lng}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([v.village, v.location, "Kenya"].filter(Boolean).join(", "))}`}
                      target="_blank" rel="noopener noreferrer" aria-label="Open this place on the map" data-testid="link-video-map"
                      className="pointer-events-auto mt-1 inline-flex max-w-full items-center gap-1 text-xs text-white/80 underline-offset-2 hover:underline"
                    >
                      <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{[v.location, v.village].filter(Boolean).join(" · ")}</span>
                    </a>
                  )}
                  <p className="mt-1 flex items-center gap-2 text-[11px] text-white/60">
                    Dighaz Engineering Limited
                    <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" /> {fmt(s.views)}</span>
                  </p>
                </div>

                <div className="absolute bottom-8 right-3 flex flex-col items-center gap-3.5 text-white">
                  <button onClick={() => likeVideo(i)} className="flex flex-col items-center gap-0.5" aria-label={isLiked ? "Unlike" : "Like"}>
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur">
                      <Heart className={`h-6 w-6 transition-transform ${isLiked ? "scale-110 fill-red-500 text-red-500" : ""}`} />
                    </span>
                    <span className="text-[11px] font-semibold">{fmt(s.likes)}</span>
                  </button>
                  <button onClick={() => setOpenId(v.key)} className="flex flex-col items-center gap-0.5" aria-label="Comments">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur"><MessageCircle className="h-5 w-5" /></span>
                    <span className="text-[11px] font-semibold">{fmt(s.comments)}</span>
                  </button>
                  <button onClick={() => share(v)} className="flex flex-col items-center gap-0.5" aria-label="Share">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur"><Share2 className="h-5 w-5" /></span>
                    <span className="text-[11px] font-semibold">{s.shares ? fmt(s.shares) : "Share"}</span>
                  </button>
                  <a
                    href={whatsappLink(`Hello, I saw "${v.title}" on your Project Videos page and would like a quote for something similar.`)}
                    target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-0.5" aria-label="Get a quote"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-green-600"><Send className="h-5 w-5" /></span>
                    <span className="text-[11px] font-semibold">Quote</span>
                  </a>
                  <button onClick={() => { if (Date.now() - unlockedAt.current < 500) return; setMuted((m) => !m); }} className="flex flex-col items-center gap-0.5" aria-label={muted || blocked ? "Unmute" : "Mute"}>
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur">
                      {muted || blocked ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    </span>
                    <span className="text-[11px] font-semibold">{muted || blocked ? "Sound" : "Mute"}</span>
                  </button>
                  <button onClick={toggleAuto} aria-pressed={auto} aria-label={auto ? "Turn auto-scroll off" : "Turn auto-scroll on"} className="flex flex-col items-center gap-0.5">
                    <span className={`grid h-11 w-11 place-items-center rounded-full backdrop-blur ${auto ? "bg-primary" : "bg-white/15"}`}>
                      <ChevronsDown className="h-5 w-5" />
                    </span>
                    <span className="text-[11px] font-semibold">{auto ? "Auto on" : "Auto off"}</span>
                  </button>
                </div>

                {/* progress bar (tap to seek) */}
                <div className="absolute inset-x-0 bottom-0 h-3 cursor-pointer" onClick={(e) => seek(e, i)}>
                  <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
                    <div ref={(el) => { bars.current[i] = el; }} className="h-full bg-white" style={{ width: 0 }} />
                  </div>
                </div>

                {v.dbId && (adminKey || v.mine) && (
                  <button onClick={() => removeVideo(v)} aria-label="Delete video"
                    className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white">
                    <Trash2 className="h-3 w-3" /> Delete video
                  </button>
                )}
                {i === 0 && (
                  <div className="pointer-events-none absolute left-0 right-0 top-[3.1rem] text-center text-[11px] font-semibold uppercase tracking-wider text-white/70">
                    Project Videos · swipe up · double-tap to like
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="absolute left-0 right-0 top-[4.2rem] z-20 px-2" data-testid="video-tabs">
        {/* The ends fade out while there is more to swipe to, so a word is never sliced off hard. Tabs snap into place. */}
        <div
          ref={tabsRef}
          onScroll={readEdges}
          className="mx-auto flex max-w-fit snap-x snap-proximity gap-1.5 overflow-x-auto rounded-full bg-black/45 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            maxWidth: "100%",
            WebkitMaskImage: `linear-gradient(to right, ${edge.l ? "transparent 0, #000 22px" : "#000 0"}, ${edge.r ? "#000 calc(100% - 30px), transparent 100%" : "#000 100%"})`,
            maskImage: `linear-gradient(to right, ${edge.l ? "transparent 0, #000 22px" : "#000 0"}, ${edge.r ? "#000 calc(100% - 30px), transparent 100%" : "#000 100%"})`,
          }}
        >
          {VIDEO_CATS.map((c) => {
            const Icon = CAT_ICON[c.id];
            return (
              <button key={c.id}
                onClick={() => setCat(c.id)} aria-pressed={cat === c.id}
                className={`flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${cat === c.id ? "bg-white text-slate-900 shadow" : "text-white/90 active:bg-white/15"}`}>
                <Icon className="h-3.5 w-3.5" /> {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {blocked && !muted && (
        <button className="absolute left-1/2 top-[7.2rem] z-30 flex -translate-x-1/2 animate-pulse items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-xl">
          <Volume2 className="h-4 w-4" /> Tap for sound
        </button>
      )}

      {toast && <div className="pointer-events-none absolute left-1/2 top-[7.2rem] z-30 -translate-x-1/2 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-slate-900 shadow-lg">{toast}</div>}

      {adminKey && (
        <button
          onClick={() => { store.set("kws_admin", ""); setAdminKey(""); }}
          className="absolute left-3 top-[4.5rem] z-20 flex items-center gap-1 rounded-full bg-sky-400 px-2.5 py-1 text-[11px] font-bold text-slate-900"
        >
          <ShieldCheck className="h-3 w-3" /> Admin · log out
        </button>
      )}

      {!adminKey && needsGoogle && (
        <Link href="/join?mode=login&next=/feed" data-testid="link-verify-google"
          className="absolute bottom-40 left-3 z-20 flex items-center gap-1.5 rounded-full bg-sky-400 px-3.5 py-2 text-xs font-bold text-slate-900 shadow-lg md:left-[calc(50%-210px)]">
          <ShieldCheck className="h-4 w-4" /> Sign in with Google to post videos
        </Link>
      )}

      {(adminKey || canPost) && (
        <button onClick={() => setUploading(true)} aria-label="Upload video"
          className="absolute bottom-40 left-3 z-20 flex items-center gap-1.5 rounded-full bg-sky-400 px-3.5 py-2 text-xs font-bold text-slate-900 shadow-lg md:left-[calc(50%-210px)]">
          <Plus className="h-4 w-4" /> Upload video
        </button>
      )}

      {uploading && (
        <UploadSheet
          adminKey={adminKey}
          memberTok={memberTok}
          onClose={() => setUploading(false)}
          onBadAdmin={() => { store.set("kws_admin", ""); setAdminKey(""); setUploading(false); }}
          onDone={(v) => { setVideos((l) => [v, ...(l ?? [])]); setCat(v.category ?? "boreholes"); setUploading(false); scroller.current?.scrollTo({ top: 0 }); }}
        />
      )}

      {openId && (
        <CommentSheet
          videoId={openId}
          title={videos?.find((v) => v.key === openId)?.title ?? ""}
          adminKey={adminKey}
          onClose={() => setOpenId(null)}
          onCount={(d) => bump(openId, "comments", d)}
          onBadAdmin={() => { store.set("kws_admin", ""); setAdminKey(""); }}
        />
      )}
    </div>
  );
}

function CommentSheet({ videoId, title, adminKey, onClose, onCount, onBadAdmin }: {
  videoId: string; title: string; adminKey: string; onClose: () => void; onCount: (d: number) => void; onBadAdmin: () => void;
}) {
  const [list, setList] = useState<Comment[] | null>(null);
  const [token, setToken] = useState(() => memberToken());
  const [who, setWho] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [replying, setReplying] = useState<{ id: number; name: string } | null>(null);
  const [menu, setMenu] = useState<{ id: number; top: number; right: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(api(`/${encodeURIComponent(videoId)}?clientId=${encodeURIComponent(clientId)}`), token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      .then((r) => r.json()).then((d) => setList(Array.isArray(d) ? d : [])).catch(() => setList([]));
  }, [videoId, token]);

  useEffect(() => {
    if (!token) return;
    memberApi<{ member: { name: string } }>("/me").then((d) => setWho(d.member.name)).catch((e) => { if (e.status === 401) { signOutMember(); setToken(""); } });
  }, [token]);

  // the little menu closes when you tap anywhere else
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const patch = (id: number, p: Partial<Comment>) => setList((l) => l && l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setErr(""); setNote("");
    try {
      const r = await fetch(api(`/${encodeURIComponent(videoId)}`), {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: text, parentId: replying?.id, clientId }),
      });
      const d = await r.json();
      if (r.status === 401) { signOutMember(); setToken(""); }
      if (!r.ok) throw new Error(d.error || "Could not post");
      setList((l) => [d, ...(l ?? [])]); onCount(1); setText(""); setReplying(null);
    } catch (x) { setErr(x instanceof Error ? x.message : "Could not post"); }
    setBusy(false);
  };

  const like = async (c: Comment) => {
    const prev = { liked: c.liked, likes: c.likes };
    patch(c.id, { liked: !c.liked, likes: Math.max(0, c.likes + (c.liked ? -1 : 1)) });
    try {
      const r = await fetch(api(`/${c.id}/like`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId }) });
      const d = await r.json();
      if (!r.ok) throw new Error();
      patch(c.id, { liked: d.liked, likes: d.likes });
    } catch { patch(c.id, prev); }
  };

  const reply = (c: Comment) => {
    if (!token) { setNote("Log in to reply to a comment."); return; }
    setNote(""); setReplying({ id: c.id, name: c.name });
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const del = async (c: Comment) => {
    setMenu(null);
    if (!window.confirm("Delete this comment?")) return;
    const headers: Record<string, string> = {};
    if (adminKey) headers["x-admin-key"] = adminKey;
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(api(`/${c.id}`), { method: "DELETE", headers });
    if (r.status === 403) {
      const d = await r.json().catch(() => ({}));
      if (adminKey && !c.mine) onBadAdmin();
      window.alert(d.error || "You cannot delete this comment");
      return;
    }
    if (r.ok) {
      const d = await r.json().catch(() => ({ ids: [] as number[] }));
      const gone = new Set<number>([c.id, ...((d.ids as number[]) ?? [])]);
      const n = (list ?? []).filter((x) => gone.has(x.id)).length;
      setList((l) => (l ?? []).filter((x) => !gone.has(x.id)));
      onCount(-n);
      if (replying && gone.has(replying.id)) setReplying(null);
    }
  };

  const tops = (list ?? []).filter((c) => !c.parentId);
  const repliesOf = (id: number) => (list ?? []).filter((c) => c.parentId === id).sort((a, b) => a.id - b.id);

  const row = (c: Comment, isReply: boolean) => (
    <div key={c.id} className="flex items-start gap-2.5">
      <span className={`grid shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary ${isReply ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs"}`}>{c.name.charAt(0).toUpperCase()}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{c.name} <span className="font-normal text-muted-foreground">· {ago(c.createdAt)}</span></p>
        <p className="break-words text-sm text-foreground/90">
          {c.replyTo && <span className="font-semibold text-primary">{c.replyTo} </span>}{c.body}
        </p>
        <div className="mt-1 flex items-center gap-5 text-[13px] text-muted-foreground">
          <button onClick={() => like(c)} aria-label={c.liked ? "Unlike comment" : "Like comment"} data-testid={`button-like-comment-${c.id}`}
            className={`flex items-center gap-1.5 py-1.5 font-semibold ${c.liked ? "text-primary" : "hover:text-foreground"}`}>
            <ThumbsUp className={`h-4 w-4 ${c.liked ? "fill-primary" : ""}`} />Like{c.likes > 0 && <span className="font-normal">· {c.likes}</span>}
          </button>
          <button onClick={() => reply(c)} data-testid={`button-reply-comment-${c.id}`} className="flex items-center gap-1.5 py-1.5 font-semibold hover:text-foreground">
            <Reply className="h-4 w-4" />Reply
          </button>
        </div>
        {!isReply && repliesOf(c.id).length > 0 && (
          <div className="mt-3 space-y-3">{repliesOf(c.id).map((r) => row(r, true))}</div>
        )}
      </div>
      {(adminKey || c.mine) && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            const b = e.currentTarget.getBoundingClientRect();
            setMenu((m) => (m?.id === c.id ? null : { id: c.id, top: b.bottom + 4, right: Math.max(8, window.innerWidth - b.right) }));
          }}
          aria-label="Comment options" data-testid={`button-comment-options-${c.id}`}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
        ><MoreHorizontal className="h-4 w-4" /></button>
      )}
    </div>
  );

  const menuTarget = menu ? (list ?? []).find((x) => x.id === menu.id) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
      <div className="flex max-h-[78dvh] w-full flex-col rounded-t-2xl bg-card shadow-2xl md:max-w-md md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="font-bold text-foreground">Comments {list ? `(${list.length})` : ""}</h3>
            <p className="truncate text-xs text-muted-foreground">{title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" onScroll={() => menu && setMenu(null)}>
          {list === null && <p className="text-sm text-muted-foreground">Loading…</p>}
          {list?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No comments yet. Be the first.</p>}
          {tops.map((c) => row(c, false))}
        </div>

        {note && <p className="px-4 pb-1 text-xs text-red-600">{note}</p>}

        {token ? (
          <form onSubmit={post} className="space-y-2 border-t border-border p-3">
            {replying ? (
              <p className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="min-w-0 truncate">Replying to <b className="text-foreground">{replying.name}</b></span>
                <button type="button" onClick={() => setReplying(null)} aria-label="Cancel reply" className="rounded-full p-0.5 hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
              </p>
            ) : who ? <p className="text-[11px] text-muted-foreground">Commenting as <b className="text-foreground">{who}</b></p> : null}
            <div className="flex gap-2">
              <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={replying ? `Reply to ${replying.name}…` : "Add a comment…"}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <button disabled={busy || !text.trim()} className="rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Post</button>
            </div>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <p className="text-[11px] text-muted-foreground">Be respectful. Offensive comments are removed.</p>
          </form>
        ) : (
          <div className="space-y-2 border-t border-border p-3 text-center">
            <p className="text-sm text-foreground">Log in to join the conversation.</p>
            <div className="flex gap-2">
              <Link href="/join?mode=login&next=/feed" data-testid="link-comment-login" className="flex-1 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground">Log in</Link>
              <Link href="/join?next=/feed" className="flex-1 rounded-md border border-border py-2.5 text-sm font-semibold text-foreground">Sign up free</Link>
            </div>
            <p className="text-[11px] text-muted-foreground">Everyone can read comments and like videos. Commenting needs an account.</p>
          </div>
        )}
      </div>

      {menu && menuTarget && (
        <div
          className="fixed z-[60] min-w-[9rem] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-xl"
          style={{ top: menu.top, right: menu.right }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => del(menuTarget)} data-testid="button-delete-comment" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

const CHUNK = 20 * 1024 * 1024; // 20 MB pieces, so even large originals upload reliably

export function UploadSheet({ adminKey, memberTok, onClose, onBadAdmin, onDone }: {
  adminKey: string; memberTok?: string; onClose: () => void; onBadAdmin: () => void; onDone: (v: FeedVideo) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [county, setCounty] = useState("");
  const [sub, setSub] = useState("");
  const [ward, setWard] = useState("");
  const [village, setVillage] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [, setAreasReady] = useState(0);
  useEffect(() => { void loadAreas().then(() => setAreasReady((n) => n + 1)); }, []);
  const [category, setCategory] = useState<VideoCat>("boreholes");
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewRef = useRef<HTMLVideoElement>(null);

  // Play the chosen video right here (with sound and controls) before it is posted, like TikTok
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const u = URL.createObjectURL(file);
    setPreviewUrl(u);
    setPreviewFailed(false);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  useEffect(() => { if (busy) previewRef.current?.pause(); }, [busy]);

  const title = VIDEO_CATS.find((c) => c.id === category)!.titleOf([county.trim(), sub.trim()].filter(Boolean).join(", ") || "Kenya");

  // The admin signs in with the admin password; an approved poster with their member login
  const auth: Record<string, string> = adminKey ? { "x-admin-key": adminKey } : memberTok ? { Authorization: `Bearer ${memberTok}` } : {};

  // One tap fills county, town and village from where the phone is, and keeps the map pin
  const useMyLocation = async () => {
    setLocating(true); setErr("");
    try {
      const w = await whereAmI();
      if (w.county) setCounty(w.county);
      if (w.sub) setSub(w.sub);
      if (w.ward) setWard(w.ward);
      if (w.village) setVillage(w.village);
      setCoords({ lat: w.lat, lng: w.lng });
      if (!w.county && !w.sub && !w.ward) setErr("Map pin saved, but the place name could not be found. Please type the county, sub-county and ward.");
    } catch (x) { setErr(x instanceof Error ? x.message : "Could not get the location"); }
    setLocating(false);
  };

  const pickedOnMap = async (lat: number, lng: number) => {
    setCoords({ lat, lng }); setMapOpen(false);
    const w = await reverseGeocode(lat, lng); // fills the empty boxes only, never overwrites what was typed
    if (w.county) setCounty((c) => c || w.county);
    if (w.sub) setSub((t) => t || w.sub);
    if (w.ward) setWard((t) => t || w.ward);
    if (w.village) setVillage((v) => v || w.village);
  };

  const sendChunk = (url: string, form: FormData, uid: string, start: number, end: number, total: number, onProg: (loaded: number) => void) =>
    new Promise<{ secure_url?: string; public_id?: string; error?: { message: string } }>((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("POST", url);
      x.setRequestHeader("X-Unique-Upload-Id", uid);
      x.setRequestHeader("Content-Range", `bytes ${start}-${end - 1}/${total}`);
      x.upload.onprogress = (e) => onProg(e.loaded);
      x.onload = () => { try { const d = JSON.parse(x.responseText); x.status < 300 ? resolve(d) : reject(new Error(d.error?.message ?? "Upload failed")); } catch { reject(new Error("Upload failed")); } };
      x.onerror = () => reject(new Error("Network error during upload"));
      x.send(form);
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true); setErr(""); setPct(0);
    try {
      const sr = await fetch(`${API}/api/feed-videos/sign`, { method: "POST", headers: auth });
      if (sr.status === 403) {
        if (adminKey) { onBadAdmin(); window.alert("Admin key no longer valid"); return; }
        throw new Error("Your account is not approved to post videos yet.");
      }
      const s = await sr.json();
      if (!sr.ok) throw new Error(s.error ?? "Could not start upload");
      if (s.mode === "github") {
        if (!/\.(mp4|webm)$/i.test(file.name)) throw new Error("Please choose an .mp4 or .webm video");
        if (file.size > s.maxMB * 1048576) throw new Error(`Video is too big (max ${s.maxMB} MB). Compress it or split it.`);
        const q = new URLSearchParams({ name: file.name, title, category, location: [county.trim(), sub.trim(), ward.trim()].filter(Boolean).join(", "), village: village.trim(), lat: coords ? String(coords.lat) : "", lng: coords ? String(coords.lng) : "" });
        const d = await new Promise<{ id: number; url: string; title: string; location?: string; createdAt?: string; error?: string }>((resolve, reject) => {
          const x = new XMLHttpRequest();
          x.open("POST", `${API}/api/feed-videos/upload?${q}`);
          Object.entries(auth).forEach(([k, val]) => x.setRequestHeader(k, val));
          x.setRequestHeader("Content-Type", file.type || "video/mp4");
          x.upload.onprogress = (ev) => setPct(Math.round((ev.loaded / ev.total) * 100));
          x.onload = () => { try { const j = JSON.parse(x.responseText); x.status < 300 ? resolve(j) : reject(new Error(j.error ?? "Upload failed")); } catch { reject(new Error("Upload failed")); } };
          x.onerror = () => reject(new Error("Network error during upload"));
          x.send(file);
        });
        window.alert("Saved to GitHub. It shows for visitors in about 2 minutes, after the site rebuilds.");
        rememberVillage(village);
        onDone({ key: `db-${d.id}`, dbId: d.id, src: `${base}${d.url}`, title: d.title, location: d.location ?? undefined, village: village.trim() || undefined, lat: coords?.lat, lng: coords?.lng, mine: true, category });
        return;
      }
      const url = `https://api.cloudinary.com/v1_1/${s.cloudName}/video/upload`;
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let last: Awaited<ReturnType<typeof sendChunk>> = {};
      for (let start = 0; start < file.size || start === 0; start += CHUNK) {
        const end = Math.min(start + CHUNK, file.size);
        const form = new FormData();
        form.append("file", file.slice(start, end), file.name);
        form.append("api_key", s.apiKey);
        form.append("timestamp", String(s.timestamp));
        form.append("signature", s.signature);
        form.append("folder", s.folder);
        last = await sendChunk(url, form, uid, start, end, file.size, (l) => setPct(Math.round(((start + l) / file.size) * 100)));
        if (end >= file.size) break;
      }
      if (!last.secure_url || !last.public_id) throw new Error("Upload did not finish");
      // Original file is served untouched. Only non-MP4 phone formats (e.g. .MOV) are converted to H.264 so browsers can play them.
      const isMp4 = /\.mp4$/i.test(file.name);
      const root = last.secure_url.replace(/\/upload\/.*$/, "/upload/");
      const play = isMp4 ? last.secure_url : `${root}f_mp4,vc_h264/${last.public_id}.mp4`;
      const poster = `${root}so_1,w_720,f_jpg/${last.public_id}.jpg`;
      const loc = [county.trim(), sub.trim(), ward.trim()].filter(Boolean).join(", ");
      const r = await fetch(`${API}/api/feed-videos`, {
        method: "POST", headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ publicId: last.public_id, url: play, poster, title, location: loc, village: village.trim(), lat: coords?.lat, lng: coords?.lng, category }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not save video");
      rememberVillage(village);
      onDone({ key: `db-${d.id}`, dbId: d.id, src: d.url, poster: d.poster ?? undefined, title: d.title, location: d.location ?? undefined, village: village.trim() || undefined, lat: coords?.lat, lng: coords?.lng, mine: true, category });
    } catch (x) { setErr(x instanceof Error ? x.message : "Upload failed"); }
    setBusy(false);
  };

  const input = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={() => !busy && onClose()}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[94dvh] w-full space-y-3 overflow-y-auto rounded-t-2xl bg-card p-4 shadow-2xl md:max-w-md md:rounded-2xl">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold text-foreground"><UploadCloud className="h-5 w-5 text-primary" /> Post a new video</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-full p-1.5 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        {previewUrl && (
          <div className="mx-auto w-full max-w-[220px] overflow-hidden rounded-xl bg-black shadow-lg ring-1 ring-border">
            {previewFailed ? (
              <div className="grid aspect-[9/16] place-items-center p-4 text-center text-xs text-white/80">
                This phone cannot show a preview of this video, but it will still upload and play for visitors.
              </div>
            ) : (
              <video
                key={previewUrl}
                ref={previewRef}
                src={previewUrl}
                controls autoPlay playsInline loop
                onError={() => setPreviewFailed(true)}
                className="aspect-[9/16] max-h-[46dvh] w-full bg-black object-contain"
              />
            )}
          </div>
        )}
        <label className="block cursor-pointer rounded-lg border-2 border-dashed border-border p-3 text-center text-sm text-muted-foreground">
          <input type="file" accept="video/*" className="sr-only" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file
            ? <><span className="block truncate font-semibold text-foreground">{file.name} · {(file.size / 1048576).toFixed(1)} MB</span><span className="text-xs text-primary">Tap to choose a different video</span></>
            : "Tap to choose a video (.mp4 recommended, original quality is kept)"}
        </label>
        <div>
          <p className="mb-1 text-xs font-semibold text-foreground">What is this video?</p>
          <div className="flex flex-wrap gap-1.5">
            {VIDEO_CATS.map((c) => (
              <button type="button" key={c.id} disabled={busy} onClick={() => setCategory(c.id)} aria-pressed={category === c.id}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${category === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted"}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={useMyLocation} disabled={busy || locating} data-testid="button-use-location"
            className="flex items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 py-2 text-[13px] font-semibold text-primary disabled:opacity-60">
            <LocateFixed className="h-4 w-4" /> {locating ? "Finding…" : "My location"}
          </button>
          <button type="button" onClick={() => setMapOpen(true)} disabled={busy} data-testid="button-pick-map"
            className="flex items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 py-2 text-[13px] font-semibold text-primary disabled:opacity-60">
            <MapPin className="h-4 w-4" /> Pick on map
          </button>
        </div>
        {coords && <p className="-mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700"><MapPin className="h-3 w-3" /> Map pin saved ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})</p>}
        <div className="grid grid-cols-2 gap-2">
          <PlaceInput className={input} placeholder="County e.g. Makueni" value={county} onChange={setCounty} suggest={countySuggestions} disabled={busy} testId="input-county" />
          <PlaceInput className={input} placeholder="Sub-county e.g. Kibwezi West" value={sub} onChange={setSub} suggest={(q) => subCountySuggestions(q, county)} maxLength={50}
            onPick={(sg) => { if (sg.county) setCounty(sg.county); }} disabled={busy} testId="input-sub" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PlaceInput className={input} placeholder="Ward e.g. Makindu" value={ward} onChange={setWard} suggest={(q) => wardSuggestions(q, county, sub)} maxLength={50}
            onPick={(sg) => { if (sg.county) setCounty(sg.county); if (sg.sub) setSub(sg.sub); }} disabled={busy} testId="input-ward" />
          <PlaceInput className={input} placeholder="Village (optional)" value={village} onChange={setVillage} suggest={(q) => villageSuggestions(q, county)} maxLength={60} disabled={busy} testId="input-village" />
        </div>
        <p className="text-xs text-muted-foreground">Title: <span className="font-semibold text-foreground">{title}</span></p>
        {busy && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
            <p className="mt-1 text-xs text-muted-foreground">Uploading {pct}%. Keep this page open.</p>
          </div>
        )}
        {err && <p className="text-xs text-red-600">{err}</p>}
        {mapOpen && (
          <Suspense fallback={<div className="fixed inset-0 z-[70] grid place-items-center bg-card text-sm text-muted-foreground">Opening the map…</div>}>
            <MapPicker initial={coords} query={[village, ward, sub, county].filter(Boolean).join(", ")} onClose={() => setMapOpen(false)} onConfirm={pickedOnMap} />
          </Suspense>
        )}
        <button disabled={!file || busy} className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Uploading…" : "Post video"}</button>
      </form>
    </div>
  );
}
