import { useLocation } from "wouter";
import { formatKES } from "@/lib/utils";
import { REGULAR_PRICE, OFFER_PRICE } from "@/components/OfferPopup";

// Edit these lines to change what scrolls along the bottom of the site.
const LINES = [
  "Free site visit across Kenya",
  `Hydrogeological survey ${formatKES(OFFER_PRICE)} (was ${formatKES(REGULAR_PRICE)})`,
  "Borehole drilling · Pumps · Solar · Water purification",
  "Call 0110 699 444 or WhatsApp 0719 117 660",
];

/** Pages where the ticker is hidden (full-screen video feed and the admin panel). */
export const tickerHidden = (loc: string) => loc.startsWith("/feed") || loc.startsWith("/admin");

export default function LiveTicker() {
  const [loc] = useLocation();
  if (tickerHidden(loc)) return null;

  // One copy holds the lines three times so it is always wider than the screen; two copies make the loop seamless.
  const copy = [...LINES, ...LINES, ...LINES];
  return (
    <div
      role="region"
      aria-label="Latest offers"
      className="live-ticker fixed inset-x-0 bottom-0 z-40 flex h-8 items-stretch overflow-hidden border-t border-white/10 bg-[hsl(160_46%_6%)] text-white shadow-[0_-4px_14px_rgba(0,0,0,.35)]"
      data-testid="live-ticker"
    >
      <div className="relative z-10 flex shrink-0 items-center bg-[hsl(160_46%_6%)] pl-3 pr-1" aria-hidden="true">
        <span className="live-dot h-2 w-2 rounded-full bg-red-500" />
      </div>
      <div className="relative flex min-w-0 flex-1 items-center overflow-hidden">
        <div className="live-ticker-track flex w-max items-center whitespace-nowrap leading-none">
          {[0, 1].map((n) => (
            <div key={n} className="flex shrink-0 items-center" aria-hidden={n === 1}>
              {copy.map((t, i) => (
                <span key={i} className="flex items-center text-xs font-medium leading-none text-white/90">
                  <span className="px-6">{t}</span>
                  <span className="text-sky-400">◆</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
