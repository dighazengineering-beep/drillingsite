import { useEffect, useRef, useState, type ReactNode } from "react";
import { isLite } from "@/lib/lite";

/**
 * Letter-by-letter headings. The headings land, fade and land again every few seconds, forever, using a different effect each time. One is picked at random for each visit (so the site feels different every time)
 * and every heading on the page uses it, which keeps the look consistent. The effect starts when the text scrolls
 * into view and then keeps a gentle motion going. Reduced-motion visitors get plain text (see index.css).
 */
const EFFECTS = [
  "bounce", "collide", "typewriter", "scramble", "drop", "wave", "flip",
  "spin", "blur", "rain", "elastic", "neon", "scatter",
] as const;
export type Effect = (typeof EFFECTS)[number];

const forced = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("fx") : null;
// On phones the effects that need blur filters or constant redrawing are left out, the rest keep the headings alive
const PHONE = typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 639px)").matches;
const POOL: readonly Effect[] = PHONE ? EFFECTS.filter((e) => e !== "scramble" && e !== "blur" && e !== "neon") : EFFECTS;
export const FX: Effect = (EFFECTS as readonly string[]).includes(forced ?? "")
  ? (forced as Effect)
  : POOL[Math.floor(Math.random() * POOL.length)];
const CYCLE_MS = 4200;
let epoch = 0; // when the current landing started

/**
 * Every landing uses a different effect: bounce, then crash, then drop, and so on, in a shuffled order that starts
 * somewhere new each visit. (`?fx=name` in the address pins one effect for previewing.)
 */
if (typeof document !== "undefined") {
  document.documentElement.dataset.fx = FX;
  epoch = performance.now();
  const noMotion = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!forced && !noMotion && !isLite()) {
    const order = [FX, ...POOL.filter((e) => e !== FX).sort(() => Math.random() - 0.5)];
    let n = 0;
    setInterval(() => {
      if (document.hidden) return;
      n = (n + 1) % order.length;
      document.documentElement.dataset.fx = order[n];
      epoch = performance.now();
    }, CYCLE_MS);
  }
}

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver((e) => { const last = e[e.length - 1]; if (last) setSeen(last.isIntersecting); }, { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZabdefghjkmnqrstuwxyz0123456789#%&";

/**
 * `level="heading"` (default) gives the full effect. `level="sub"` is a calmer, smaller version for small titles.
 * `hi` is the colour of the light that keeps running through the letters.
 */
export function LiveTitle({ text, hi, className, level = "heading" }: { text: string; hi?: string; className?: string; level?: "heading" | "sub" }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const words = text.split(" ");
  let c = 0;

  // "scramble": letters flicker through random characters, then lock onto the real ones (only on landings that use it)
  useEffect(() => {
    if (!seen || reduced() || isLite()) return;
    const root = ref.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>(".live-ch"));
    let scrambled = false;
    // the random characters are drawn on top (absolutely positioned), so the real letters keep their exact size
    const timer = setInterval(() => {
      if (document.documentElement.dataset.fx !== "scramble") {
        if (scrambled) { els.forEach((el) => el.removeAttribute("data-s")); scrambled = false; }
        return;
      }
      scrambled = true;
      const t = performance.now() - epoch;
      els.forEach((el, i) => {
        if (t >= 350 + i * 45 || el.dataset.c === " ") el.removeAttribute("data-s");
        else el.dataset.s = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      });
    }, 45);
    return () => clearInterval(timer);
  }, [seen, ref]);

  return (
    <span
      ref={ref}
      className={`live-t ${level === "sub" ? "live-sub" : ""} ${seen ? "in" : ""} ${className ?? ""}`}
      aria-label={text}
      style={{ ["--st" as string]: `${Math.min(level === "sub" ? 28 : 45, 1000 / Math.max(1, text.length))}ms`, ...(hi ? { ["--hi" as string]: hi } : {}) } as React.CSSProperties}
    >
      {words.map((w, wi) => (
        <span key={wi}>
          <span aria-hidden="true" className="live-w">
            {Array.from(w).map((ch, k) => {
              const i = c++;
              return (
                <span
                  key={k}
                  className="live-ch"
                  data-c={ch}
                  style={{
                    ["--c" as string]: i,
                    ["--s" as string]: i % 2 ? 1 : -1,
                    ["--rx" as string]: `${(((i * 37) % 11) - 5) / 2.5}em`,
                    ["--ry" as string]: `${(((i * 53) % 9) - 4) / 2}em`,
                  } as React.CSSProperties}
                ><span className="r">{ch}</span></span>
              );
            })}
          </span>
          {wi < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

/** A key word or term inside a sentence: it fades in with a soft glow and a slow shine when it scrolls into view. */
export function Key({ children, hi }: { children: ReactNode; hi?: string }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  return (
    <span ref={ref} className={`live-key ${seen ? "in" : ""}`} style={hi ? ({ ["--hi" as string]: hi } as React.CSSProperties) : undefined}>
      {children}
    </span>
  );
}

/** One line that swaps through phrases: the old phrase slides up and out while the next slides up into place. */
export function RotatingWords({ words, every = 2800, className }: { words: string[]; every?: number; className?: string }) {
  const [i, setI] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);

  useEffect(() => {
    if (words.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      setI((cur) => { setPrev(cur); return (cur + 1) % words.length; });
    }, every);
    return () => clearInterval(t);
  }, [words.length, every]);

  useEffect(() => {
    if (prev === null) return;
    const t = setTimeout(() => setPrev(null), 700);
    return () => clearTimeout(t);
  }, [prev]);

  return (
    <span className={`relative block h-[1.25em] overflow-hidden whitespace-nowrap ${className ?? ""}`} aria-label={words[0]}>
      {prev !== null && <span key={`o${prev}`} aria-hidden="true" className="live-rot-out absolute left-0 top-0">{words[prev]}</span>}
      <span key={`i${i}`} aria-hidden="true" className={`${prev !== null ? "live-rot-in" : ""} absolute left-0 top-0`}>{words[i]}</span>
    </span>
  );
}
