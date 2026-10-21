/**
 * Weak devices (little memory, few processor cores, data saver on, or a very slow connection) get a calmer site:
 * still pictures instead of moving video, and plain headings. Everything still looks good, it just never lags.
 * `?lite=1` forces this on and `?lite=0` forces it off, so you can compare on your own phone.
 */
export function isLite(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get("lite");
    if (q === "1") return true;
    if (q === "0") return false;
    const n = navigator as unknown as {
      deviceMemory?: number;
      hardwareConcurrency?: number;
      connection?: { saveData?: boolean; effectiveType?: string };
    };
    if (n.connection?.saveData) return true;
    if (n.connection?.effectiveType === "slow-2g" || n.connection?.effectiveType === "2g") return true;
    if (typeof n.deviceMemory === "number" && n.deviceMemory <= 2) return true;
    if (typeof n.hardwareConcurrency === "number" && n.hardwareConcurrency <= 2) return true;
  } catch { /* ignore */ }
  return false;
}

/** Small phone screens: the floating video stays a picture here (the video opens when tapped). */
export const isPhone = () => {
  try { return !!window.matchMedia?.("(max-width: 639px)").matches; } catch { return false; }
};

/** Marks the page so the stylesheet can switch off the costly letter effects on weak devices. */
export function applyLite() {
  if (typeof document !== "undefined" && isLite()) document.documentElement.dataset.lite = "1";
}
