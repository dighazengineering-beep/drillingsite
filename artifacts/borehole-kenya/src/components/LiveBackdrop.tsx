import { useEffect, useRef } from "react";
import { IMAGES } from "@/lib/images";
import { isLite } from "@/lib/lite";

/** Pages listen for this to show the name of the clip that is playing. */
export const LIVE_TITLE_EVENT = "live-title";

const ROOT_CLASS = "live-on"; // while set on <html>, page photo backdrops turn clear so the video shows through
const START_DELAY_MS = 900; // wait until the page has settled so the first paint stays instant
const MIN_CLIP_MS = 4000;
const MAX_CLIP_MS = 5000;
const MAX_WAIT_MS = 7000; // a clip that is not fully loaded by then is skipped, so the picture never stalls
const MAX_CONSECUTIVE_FAILS = 6;

interface Clip { file: string; url?: string; title: string }

const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");
const base = import.meta.env.BASE_URL;
const previewOf = (file: string) => `${base}videos/preview/${file}`;

/** Videos posted from /admin on Cloudinary: a clean H.264 MP4 at a phone-friendly size (no sound, first 8 seconds, up to 540 px wide). */
function cloudinaryClip(url: string): string | null {
  if (!/^https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\//.test(url)) return null;
  return url.replace("/video/upload/", "/video/upload/c_limit,w_540,q_auto:good,vc_h264,f_mp4,ac_none,so_0,du_8/").replace(/\.\w+$/, ".mp4");
}

/**
 * Skip the live video only when the visitor has asked their device for less motion, or the device is weak
 * (see lib/lite.ts). The photo stays when the video is skipped. `?live=1` forces the video on, for testing.
 */
function shouldPlay() {
  try {
    if (new URLSearchParams(window.location.search).get("live") === "1") return true;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
    return !isLite();
  } catch {
    return false;
  }
}

/**
 * Silent "live channel" background for the whole site: random clips, 4 to 5 seconds each, from every video on the site
 * plus everything posted from /admin. It is built never to stutter:
 *  - clips are light, sharp 8-second copies (the full-quality originals stay on the Successful Boreholes page);
 *  - the next clip loads completely in a hidden player, and the picture only switches once it is ready to play;
 *  - if a clip is slow to load, the current one just keeps playing and the slow one is skipped.
 */
export default function LiveBackdrop() {
  const onTitle = (title: string) => window.dispatchEvent(new CustomEvent(LIVE_TITLE_EVENT, { detail: title }));
  const box = useRef<HTMLDivElement>(null);
  const v0 = useRef<HTMLVideoElement>(null);
  const v1 = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!shouldPlay()) return;
    const els = [v0.current, v1.current];
    if (!els[0] || !els[1] || !box.current) return;
    const vids = els as HTMLVideoElement[];
    vids.forEach((v) => { v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = true; });

    let dead = false;
    let clips: Clip[] = [];
    let cur = 0; // which element is visible
    let nextPos = 1; // position in `order` of the clip that is loading in the hidden element
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fails = 0;
    let inView = true;
    let tabVisible = !document.hidden;
    const root = document.documentElement;
    let modal = root.classList.contains("modal-open");
    const running = () => inView && tabVisible && !modal;

    // Random order: clips are shuffled, and a new shuffle is chained on when the list runs out, never repeating back to back.
    let order: number[] = [];
    const extendOrder = () => {
      const bag = clips.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      if (order.length && bag.length > 1 && bag[0] === order[order.length - 1]) bag.push(bag.shift() as number);
      order = order.concat(bag);
    };
    const clipAt = (i: number) => {
      while (order.length <= i) extendOrder();
      return clips[order[i]];
    };
    const load = (el: HTMLVideoElement, clip: Clip) => {
      el.preload = "auto";
      el.src = clip.url ?? previewOf(clip.file);
      el.load();
    };

    const schedule = () => {
      clearTimeout(timer);
      if (dead || !running()) return;
      timer = setTimeout(advance, MIN_CLIP_MS + Math.random() * (MAX_CLIP_MS - MIN_CLIP_MS));
    };

    const giveUp = () => {
      root.classList.remove(ROOT_CLASS);
      dead = true;
      clearTimeout(timer);
      vids.forEach((v) => { v.style.opacity = "0"; v.pause(); });
    };

    function advance() {
      if (dead || !running()) return; // resumes from the observers below
      const out = vids[cur];
      const inc = vids[1 - cur];
      let waited = 0;

      const skip = () => {
        fails += 1;
        if (fails >= MAX_CONSECUTIVE_FAILS) { giveUp(); return; }
        nextPos += 1; // leave out the clip that would not load
        load(inc, clipAt(nextPos));
        timer = setTimeout(advance, 800);
      };

      const swap = () => {
        inc.currentTime = 0;
        inc.play().then(() => {
          if (dead) return;
          fails = 0;
          inc.style.opacity = "1";
          out.style.opacity = "0";
          cur = 1 - cur;
          onTitle(clipAt(nextPos).title);
          nextPos += 1;
          // After the fade, park the old player and load the following clip into it.
          setTimeout(() => { if (!dead) { out.pause(); load(out, clipAt(nextPos)); } }, 1300);
          schedule();
        }).catch(skip);
      };

      // Only switch when the next clip is fully ready; until then the current clip keeps playing.
      const check = () => {
        if (dead || !running()) return;
        if (inc.error) { skip(); return; }
        if (inc.readyState >= 4) { swap(); return; }
        waited += 250;
        if (waited >= MAX_WAIT_MS) { skip(); return; }
        timer = setTimeout(check, 250);
      };
      check();
    }

    const start = async () => {
      try {
        const res = await fetch(`${base}videos/feed.json`);
        const list = (await res.json()) as Clip[];
        clips = list.filter((c) => c && c.file);
      } catch { return; }
      if (dead || clips.length === 0) return;

      const first = vids[0];
      first.addEventListener("playing", () => {
        if (dead) return;
        first.style.opacity = "1";
        root.classList.add(ROOT_CLASS);
        onTitle(clipAt(0).title);
        if (clips.length > 1) { load(vids[1], clipAt(1)); schedule(); }
      }, { once: true });

      // Videos posted from /admin join the mix as soon as the server answers (it can take a while to wake up).
      fetch(`${API}/api/feed-videos`)
        .then((r) => r.json())
        .then((d: { url?: string; title?: string; source?: string; createdAt?: string }[]) => {
          if (dead || !Array.isArray(d)) return;
          const known = new Set(clips.map((c) => c.url ?? c.file));
          const fresh: Clip[] = [];
          for (const v of d) {
            if (!v?.url) continue;
            const title = v.title ?? "Successful Borehole";
            const light = cloudinaryClip(v.url);
            let clip: Clip | null = null;
            if (light) clip = { file: light, url: light, title };
            else if (v.source === "github") {
              // a GitHub upload goes live after the site rebuilds (about 4 minutes)
              const readyAt = v.createdAt ? new Date(v.createdAt + "Z").getTime() + 4 * 60_000 : 0;
              if (Date.now() > readyAt) { const u = `${base}${v.url}`; clip = { file: u, url: u, title }; }
            } else { clip = { file: v.url, url: v.url, title }; }
            if (clip && !known.has(clip.url as string)) { known.add(clip.url as string); fresh.push(clip); }
          }
          if (!fresh.length) return;
          const startAt = clips.length;
          clips.push(...fresh);
          // play the new ones within the next few clips, in random places, then they join every shuffle
          fresh.forEach((_, k) => {
            const at = nextPos + 2 + Math.floor(Math.random() * Math.max(3, fresh.length * 2));
            while (order.length < at) extendOrder();
            order.splice(at, 0, startAt + k);
          });
        })
        .catch(() => {});

      load(first, clipAt(0));
      // If the browser refuses to autoplay (battery saver, strict phone settings), try again on the first touch, click or scroll.
      first.play().catch(() => {
        const retry = () => {
          ["pointerdown", "keydown", "scroll", "touchstart"].forEach((t) => window.removeEventListener(t, retry));
          if (!dead) first.play().catch(() => {});
        };
        ["pointerdown", "keydown", "scroll", "touchstart"].forEach((t) => window.addEventListener(t, retry, { passive: true }));
      });
    };

    // Pause (and save battery and data) while the hero is off-screen or the tab is hidden
    const pauseResume = () => {
      if (dead || !clips.length) return;
      if (running()) { vids[cur].play().catch(() => {}); schedule(); }
      else { vids[cur].pause(); clearTimeout(timer); }
    };
    const io = new IntersectionObserver(([en]) => { inView = en.isIntersecting; pauseResume(); }, { threshold: 0.05 });
    io.observe(box.current);
    const onVis = () => { tabVisible = !document.hidden; pauseResume(); };
    document.addEventListener("visibilitychange", onVis);
    // pause while a pop-up is open on top of the page
    const mo = new MutationObserver(() => {
      const now = root.classList.contains("modal-open");
      if (now !== modal) { modal = now; pauseResume(); }
    });
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });

    let begin: ReturnType<typeof setTimeout> | undefined;
    const go = () => { begin = setTimeout(start, START_DELAY_MS); };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });

    return () => {
      dead = true;
      root.classList.remove(ROOT_CLASS);
      clearTimeout(timer);
      clearTimeout(begin);
      window.removeEventListener("load", go);
      document.removeEventListener("visibilitychange", onVis);
      io.disconnect();
      mo.disconnect();
      vids.forEach((v) => { v.pause(); v.removeAttribute("src"); v.load(); });
    };
  }, []);

  const cls = "absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-1000 ease-in-out";
  return (
    <div
      ref={box}
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ background: `hsl(160 52% 8%) url(${IMAGES.rig}) center 60% / cover` }}
      aria-hidden="true"
    >
      <video ref={v0} className={cls} style={{ objectPosition: "center 45%" }} muted playsInline preload="none" tabIndex={-1} disablePictureInPicture disableRemotePlayback />
      <video ref={v1} className={cls} style={{ objectPosition: "center 45%" }} muted playsInline preload="none" tabIndex={-1} disablePictureInPicture disableRemotePlayback />
      {/* Dark blue wash keeps every page easy to read over moving pictures */}
      <div className="absolute inset-0" style={{ background: "hsl(160 52% 8% / .42)" }} />
    </div>
  );
}
