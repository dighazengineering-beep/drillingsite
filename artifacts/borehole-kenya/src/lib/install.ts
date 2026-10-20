import { useEffect, useState } from "react";

/** Where the Android app file is downloaded from. Leave VITE_APK_URL empty until the Android app has been built; the Android download is then hidden and Chrome's own "Install app" is used. */
export const APK_URL = ((import.meta.env.VITE_APK_URL as string | undefined) ?? "").trim();
export const HAS_APK = APK_URL.length > 0;

interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferred: InstallPrompt | null = null;
let installed = false;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

// The browser offers the install prompt early, so it is caught here and kept until the visitor taps "Install app"
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallPrompt; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; installed = true; notify(); });
}

export type Platform = "ios" | "android" | "other";
const platformNow = (): Platform => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
};
// Already running as an installed app (or inside the Android app)
const standaloneNow = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true ||
  /DighazApp/.test(navigator.userAgent);

export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  const platform = platformNow();
  const standalone = installed || standaloneNow();
  const canPrompt = !!deferred;
  // Show the button where installing is possible: Android (prompt or app file), iPhone (steps), or a computer that offers the prompt
  const available = !standalone && (platform === "ios" || canPrompt || (platform === "android" && HAS_APK));

  /** Returns what happened so the button can react: "ios" means show the steps. */
  const install = async (): Promise<"prompted" | "apk" | "ios" | "none"> => {
    if (deferred) {
      const d = deferred;
      deferred = null;
      await d.prompt();
      notify();
      return "prompted";
    }
    if (platform === "ios") return "ios";
    if (platform === "android" && HAS_APK) { window.location.href = APK_URL; return "apk"; }
    return "none";
  };
  return { available, platform, canPrompt, install };
}
