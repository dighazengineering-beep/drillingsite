import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useGetService } from "@workspace/api-client-react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Check, MessageCircle, BadgePercent } from "lucide-react";
import { IMAGES } from "@/lib/images";
import BlendedPhoto from "@/components/BlendedPhoto";
import { formatKES, whatsappLink } from "@/lib/utils";
import { LiveTitle, Key } from "@/components/LiveTitle";

// Edit these two numbers to change the offer.
export const REGULAR_PRICE = 36842;
export const OFFER_PRICE = 35000;

// Every other service: this percent off when the customer contacts us today.
export const DISCOUNT_PCT = 5;

// Drilling offer, KES per metre. Edit these to change it.
export const DRILL_WAS = 6500;
export const DRILL_STEEL = 5800;
export const DRILL_PLASTIC = 5400;

const SHOW_DELAY_MS = 1800;

export interface PopupSpec {
  key: string;
  badge: string;
  image: string;
  alt: string;
  title: string;
  desc: string;
  bullets: ReactNode[];
  cta: string;
  message: string;
  /** survey offer only */
  offer?: boolean;
  /** per-metre price offer (drilling) */
  /** percent off when they contact us today */
  pct?: number;
  deal?: { was: number; rows: { label: string; price: number }[] };
}

const SURVEY: PopupSpec = {
  key: "survey",
  badge: "Today's offer",
  image: IMAGES.survey,
  alt: "Hydrogeological survey for a new borehole",
  title: "Find water before you drill",
  desc: "Get our hydrogeological survey at a special price.",
  bullets: [<>Advanced <Key>geophysical</Key> survey</>, <>Pinpoints best <Key>drill site, depth and water quality</Key></>],
  cta: "Claim this offer on WhatsApp",
  message: `Hello, I would like to book the hydrogeological survey offer at ${formatKES(OFFER_PRICE)}.`,
  offer: true,
};

// One pop-up per kind of page. Wording is plain and makes no price promises, only the survey has an offer.
const SPECS: Record<string, PopupSpec> = {
  survey: SURVEY,
  drilling: {
    key: "drilling", badge: "Drilling offer", image: IMAGES.drilling, alt: "Borehole drilling rig on site",
    title: "Borehole drilling, now cheaper", desc: "Our price per metre has dropped. Pick your casing.",
    bullets: [<>Drilled to the agreed <Key>depth and casing</Key></>, <>Ask for your <Key>quote on WhatsApp</Key> in minutes</>],
    cta: "Claim this offer on WhatsApp",
    message: `Hello, I would like to book borehole drilling at the new rate: steel casing ${formatKES(DRILL_STEEL)} per metre, or plastic casing ${formatKES(DRILL_PLASTIC)} per metre.`,
    deal: { was: DRILL_WAS, rows: [{ label: "Steel casing", price: DRILL_STEEL }, { label: "Plastic casing", price: DRILL_PLASTIC }] },
  },
  testPumping: {
    key: "testPumping", badge: "Test pumping", image: IMAGES.testPumping, alt: "Pump test on a borehole",
    title: "Know your borehole's real yield", desc: "A proper pump test before you choose your pump.",
    bullets: [<>Measures <Key>yield and drawdown</Key></>, <>Helps you pick the <Key>right pump size</Key></>],
    cta: "Book a pump test", message: "Hello, I would like to book a borehole test pumping.",
  },
  pump: {
    key: "pump", badge: "Pumps", image: IMAGES.pumpInstall, alt: "Borehole pump installation",
    title: "The right pump, fitted properly", desc: "Supply and installation for your borehole.",
    bullets: [<>Sized to your <Key>borehole and tank</Key></>, <>Submersible and <Key>solar pump</Key> options</>],
    cta: "Ask about pumps", message: "Hello, I would like help choosing and installing a borehole pump.",
  },
  solar: {
    key: "solar", badge: "Solar power", image: IMAGES.solarTower, alt: "Solar powered borehole pump",
    title: "Run your pump on the sun", desc: "Solar pumping to cut your power bill.",
    bullets: [<>Panels and pump matched to your <Key>water needs</Key></>, <>Ask for a <Key>solar pumping quote</Key></>],
    cta: "Get a solar quote", message: "Hello, I would like a quote for a solar borehole pump system.",
  },
  purification: {
    key: "purification", badge: "Water treatment", image: IMAGES.purification, alt: "Water purification system",
    title: "Safe, clean water to drink", desc: "Treatment and filtration for your water.",
    bullets: [<>Chosen from your <Key>water test</Key> results</>, <>Filtration, softening and <Key>purification</Key></>],
    cta: "Ask about purification", message: "Hello, I would like help with water purification for my borehole.",
  },
  inspection: {
    key: "inspection", badge: "Camera inspection", image: IMAGES.inspection, alt: "Borehole camera inspection",
    title: "See inside your borehole", desc: "Find problems before they get expensive.",
    bullets: [<>Camera check of <Key>casing and screens</Key></>, <>Spots <Key>blockages and damage</Key></>],
    cta: "Book a camera inspection", message: "Hello, I would like to book a borehole camera inspection.",
  },
  maintenance: {
    key: "maintenance", badge: "Maintenance", image: IMAGES.pumpInstall, alt: "Borehole pump servicing",
    title: "Keep your borehole running", desc: "Servicing and repairs that stop small faults growing.",
    bullets: [<>Pump <Key>servicing and repairs</Key></>, <>Cleaning and <Key>flushing</Key> when yield drops</>],
    cta: "Book maintenance", message: "Hello, I would like to book borehole maintenance.",
  },
  products: {
    key: "products", badge: "Shop", image: IMAGES.treatment, alt: "Water tanks and borehole equipment",
    title: "Borehole and water products", desc: "Pumps, tanks, pipes and treatment equipment.",
    bullets: [<>Ask us for <Key>advice before you buy</Key></>, <>Tell us what you need, we <Key>reply on WhatsApp</Key></>],
    cta: "Ask about a product", message: "Hello, I would like help choosing borehole or water products.",
  },
  general: {
    key: "general", badge: "Our services", image: IMAGES.drilling, alt: "Borehole drilling",
    title: "Talk to our team", desc: "Drilling, pumps, purification and more.",
    bullets: [<>Tell us your <Key>location and need</Key></>, <>We reply with <Key>advice and a quote</Key></>],
    cta: "Chat on WhatsApp", message: "Hello, I would like to ask about your services.",
  },
};

for (const sp of Object.values(SPECS)) {
  if (sp.offer || sp.deal) continue;
  sp.pct = DISCOUNT_PCT;
  sp.cta = `Get my ${DISCOUNT_PCT}% discount`;
  sp.message = `${sp.message.replace(/\.$/, "")}. I saw the ${DISCOUNT_PCT}% discount for contacting you today.`;
}

/** Which pop-up a service gets, from its name and category. */
export function specForText(name: string, category = ""): PopupSpec {
  const first = pick(name);
  return first.key === "general" ? pick(category) : first;
}

function pick(t: string): PopupSpec {
  t = t.toLowerCase();
  if (/survey|hydro|geolog|geophys/.test(t)) return SPECS.survey;
  if (/test.?pump|pump.?test|yield/.test(t)) return SPECS.testPumping;
  if (/inspect|camera/.test(t)) return SPECS.inspection;
  if (/solar/.test(t)) return SPECS.solar;
  if (/purif|treat|filter/.test(t)) return SPECS.purification;
  if (/maint|repair|clean|flush|rehab/.test(t)) return SPECS.maintenance;
  if (/pump|install/.test(t)) return SPECS.pump;
  if (/drill/.test(t)) return SPECS.drilling;
  return SPECS.general;
}

const shown = new Set<string>();

/** Chooses the pop-up for the current page. Shows on every full page load, and once per kind when moving around inside the site. */
export default function PagePopup() {
  const [loc] = useLocation();
  const sid = /^\/services\/(\d+)/.exec(loc)?.[1];
  const { data: service } = useGetService(Number(sid || 0), { query: { queryKey: ["service", sid], enabled: !!sid } });

  let spec: PopupSpec | null = null;
  let price: number | null = null;
  if (loc === "/") spec = SURVEY;
  else if (sid) {
    if (service) { spec = specForText(service.name, service.category); price = service.priceFrom ?? null; }
  } else if (loc === "/services") spec = SPECS.general;
  else if (loc.startsWith("/products")) spec = SPECS.products;
  else if (loc === "/purification") spec = SPECS.purification;
  if (!spec) return null;
  return <OfferPopup key={`${loc}:${spec.key}`} spec={spec} from={price} />;
}

function OfferPopup({ spec, from }: { spec: PopupSpec; from: number | null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (spec.key !== "survey" && shown.has(spec.key)) return;
    shown.add(spec.key);
    const timer = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [spec.key]);

  // While the pop-up is open, everything behind it is paused (video, letters, ticker) so the pop-up itself stays perfectly smooth
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("modal-open", open);
    return () => root.classList.remove("modal-open");
  }, [open]);

  const message = spec.message;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[hsl(160_46%_6%)]/65 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-500" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-4rem)] max-w-[250px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-card shadow-2xl outline-none duration-500 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-6 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-bottom-4"
          data-testid="popup-offer"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Photo */}
          <div className="relative">
            <BlendedPhoto src={spec.image} alt={spec.alt} className="aspect-[2/1] max-h-[16vh]" />
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-sky-400 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-900 shadow">
              {(spec.offer || spec.deal || spec.pct) && <BadgePercent className="h-2.5 w-2.5" />} <LiveTitle level="sub" text={spec.badge} hi="#ffffff" />
            </span>
            <Dialog.Close
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow transition hover:bg-white hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              aria-label="Close"
              data-testid="button-close-offer"
            >
              <X className="h-3.5 w-3.5" />
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="px-3 pb-2 pt-2">
            <Dialog.Title className="text-sm font-extrabold leading-tight text-foreground" style={{ fontFamily: "var(--font-display)" }}>
              <LiveTitle text={spec.title} hi="#0ea5e9" />
            </Dialog.Title>
            <Dialog.Description className="mt-0.5 text-[11px] text-muted-foreground">
              {spec.desc}
            </Dialog.Description>

            {spec.offer ? (
            <div className="mt-1.5 flex flex-wrap items-end gap-x-2 gap-y-0.5">
                <span className="text-xl font-extrabold leading-none text-primary" style={{ fontFamily: "var(--font-display)" }}>
                  <LiveTitle text={formatKES(OFFER_PRICE)} hi="#38bdf8" />
                </span>
                <span className="pb-0.5 text-[11px] text-muted-foreground line-through">{formatKES(REGULAR_PRICE)}</span>
                <span className="mb-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                  <LiveTitle level="sub" text={`Save ${formatKES(REGULAR_PRICE - OFFER_PRICE)}`} hi="#059669" />
                </span>
              </div>
            ) : spec.deal ? (
              <div className="mt-1.5 space-y-1" data-testid="drill-deal">
                {spec.deal.rows.map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-1.5 rounded-lg bg-primary/5 px-2 py-1">
                    <span className="text-[10px] font-semibold text-foreground"><LiveTitle level="sub" text={r.label} hi="#38bdf8" /></span>
                    <span className="flex items-baseline gap-1 whitespace-nowrap">
                      <span className="text-[9px] text-muted-foreground line-through">{formatKES(spec.deal!.was)}</span>
                      <span className="text-sm font-extrabold leading-none text-primary" style={{ fontFamily: "var(--font-display)" }}>{formatKES(r.price)}</span>
                      <span className="text-[9px] text-muted-foreground">/m</span>
                    </span>
                  </div>
                ))}
                <span className="inline-block rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                  <LiveTitle level="sub" text={`Save up to ${formatKES(spec.deal.was - Math.min(...spec.deal.rows.map((r) => r.price)))} per metre`} hi="#059669" />
                </span>
              </div>
            ) : spec.pct ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="pct-deal">
                <span className="text-xl font-extrabold leading-none text-primary" style={{ fontFamily: "var(--font-display)" }}>
                  <LiveTitle text={`${spec.pct}% OFF`} hi="#38bdf8" />
                </span>
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                  <LiveTitle level="sub" text="Contact us today" hi="#059669" />
                </span>
                {from ? <span className="w-full text-[10px] text-muted-foreground">Prices from {formatKES(from)}, then {spec.pct}% off</span> : null}
              </div>
            ) : from ? (
              <div className="mt-1.5 flex items-end gap-1.5">
                <span className="pb-0.5 text-[11px] text-muted-foreground">From</span>
                <span className="text-xl font-extrabold leading-none text-primary" style={{ fontFamily: "var(--font-display)" }}>
                  <LiveTitle text={formatKES(from)} hi="#38bdf8" />
                </span>
              </div>
            ) : null}

            <ul className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-foreground/80">
              {spec.bullets.map((t, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>

            <a
              href={whatsappLink(message)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-sky-400 py-1.5 text-[11px] font-bold text-slate-900 shadow-md transition hover:bg-sky-300 hover:shadow-lg active:scale-[.98]"
              data-testid="button-claim-offer"
            >
              <MessageCircle className="h-3.5 w-3.5" /> <LiveTitle level="sub" text={spec.cta} hi="#ffffff" />
            </a>
            <button
              onClick={() => setOpen(false)}
              className="w-full pt-1 text-[10px] text-muted-foreground transition hover:text-foreground"
            >
              Maybe later
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
