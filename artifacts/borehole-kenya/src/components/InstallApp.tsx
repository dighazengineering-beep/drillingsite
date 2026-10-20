import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, Share, PlusSquare, X, Smartphone } from "lucide-react";
import { useInstall, APK_URL, HAS_APK } from "@/lib/install";

/**
 * "Install app" button. On Android Chrome one tap installs the app. Where that is not offered, Android downloads the app file,
 * and on iPhone a short two-step guide opens (Apple does not allow app files).
 */
/** True in the real Chrome browser (many phone-maker browsers also say "Chrome" in their name tag, so those are left out). */
const inChrome = () => /Chrome\//.test(navigator.userAgent) && !/(OPR|OPiD|EdgA|SamsungBrowser|HeyTap|OppoBrowser|VivoBrowser|MiuiBrowser|UCBrowser|Firefox|Brave|DuckDuckGo|; wv\))/i.test(navigator.userAgent);
const chromeLink = () => `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(window.location.href)};end`;

export default function InstallApp({ variant = "hero", onDone }: { variant?: "hero" | "menu" | "footer"; onDone?: () => void }) {
  const { available, platform, install } = useInstall();
  const [steps, setSteps] = useState(false);
  const [apkSteps, setApkSteps] = useState(false);
  if (!available) return null;

  const click = async () => {
    const r = await install();
    if (r === "ios") setSteps(true);
    if (r === "apk") setApkSteps(true); // the file is downloading; Android needs a few taps from the person to finish
    onDone?.();
  };

  const cls =
    variant === "hero"
      ? "inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/20 active:scale-[.98]"
      : variant === "menu"
        ? "flex w-full items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10"
        : "inline-flex items-center gap-1.5 whitespace-nowrap text-white/80 transition-colors hover:text-white";

  return (
    <>
      <button type="button" onClick={click} className={cls} data-testid={`button-install-${variant}`}>
        <Download className={variant === "footer" ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4"} /> Install app
      </button>
      {variant === "footer" && platform === "android" && HAS_APK && (
        <a href={APK_URL} className="whitespace-nowrap text-white/60 underline-offset-2 transition-colors hover:text-white hover:underline">Download APK</a>
      )}

      <Dialog.Root open={apkSteps} onOpenChange={setApkSteps}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-[hsl(160_46%_6%)]/65 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-[71] mx-auto w-full max-w-md rounded-t-2xl bg-card p-5 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white"><Download className="h-5 w-5" /></span>
                <div>
                  <Dialog.Title className="font-bold text-foreground">Finish installing the app</Dialog.Title>
                  <Dialog.Description className="text-xs text-muted-foreground">Your download has started</Dialog.Description>
                </div>
              </div>
              <Dialog.Close className="rounded-full p-1.5 hover:bg-muted" aria-label="Close"><X className="h-5 w-5" /></Dialog.Close>
            </div>
            {!inChrome() && (
              <a href={chromeLink()} data-testid="link-open-in-chrome"
                className="mt-4 block rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3 text-sm text-foreground">
                <b className="text-primary">Easiest way, no warnings:</b> open this site in <b>Chrome</b> and tap <b>Install app</b>. Chrome installs it as a real app in one tap. <span className="font-semibold text-primary underline underline-offset-2">Open in Chrome</span>
              </a>
            )}
            <ol className="mt-4 space-y-3 text-sm text-foreground">
              <li className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">1</span>
                <span>When the download ends, tap <b>Open</b> (or open the file from your notifications or <b>Downloads</b>).</span></li>
              <li className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">2</span>
                <span>If Android asks, tap <b>Settings</b> and switch on <b>Allow from this source</b>, then press back.</span></li>
              <li className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">3</span>
                <span>Tap <b>Install</b>, then <b>Open</b>.</span></li>
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">Android never lets a website install an app by itself, so these taps are needed once. If it says the app is <b>not trusted</b> or unrecognised (Play Protect), that is because the app is not on the Play Store yet: tap <b>More details</b>, then <b>Install anyway</b>.</p>
            <a href={APK_URL} download className="mt-3 inline-block text-xs font-semibold text-primary underline underline-offset-2">Download did not start? Tap here</a>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={steps} onOpenChange={setSteps}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-[hsl(160_46%_6%)]/65 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-[71] mx-auto w-full max-w-md rounded-t-2xl bg-card p-5 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white"><Smartphone className="h-5 w-5" /></span>
                <div>
                  <Dialog.Title className="font-bold text-foreground">Install on your iPhone</Dialog.Title>
                  <Dialog.Description className="text-xs text-muted-foreground">Two quick steps in Safari</Dialog.Description>
                </div>
              </div>
              <Dialog.Close className="rounded-full p-1.5 hover:bg-muted" aria-label="Close"><X className="h-5 w-5" /></Dialog.Close>
            </div>
            <ol className="mt-4 space-y-3 text-sm text-foreground">
              <li className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">1</span>
                <span>Tap the <Share className="mx-0.5 inline h-4 w-4 text-primary" /> <b>Share</b> button at the bottom of Safari.</span></li>
              <li className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">2</span>
                <span>Choose <PlusSquare className="mx-0.5 inline h-4 w-4 text-primary" /> <b>Add to Home Screen</b>, then tap <b>Add</b>.</span></li>
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">The Dighaz Engineering icon then appears with your other apps.</p>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
