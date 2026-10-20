import { useEffect, useState } from "react";
import { LIVE_TITLE_EVENT } from "@/components/LiveBackdrop";
import { LiveTitle, RotatingWords } from "@/components/LiveTitle";
import SuccessShowcase from "@/components/SuccessShowcase";
import FloatingReel from "@/components/FloatingReel";
import InstallApp from "@/components/InstallApp";
import { Link } from "wouter";
import { ArrowRight, UserRound, CheckCircle, Phone, MessageCircle, Radar, Drill, Gauge, Sun, FlaskConical, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappLink, KENYA_COUNTIES } from "@/lib/utils";
import { IMAGES, imagePosition, pageBackdrop, photoLayer } from "@/lib/images";
import { useListServices } from "@workspace/api-client-react";
import { memberToken } from "@/lib/member";

// Each button opens its own page. "match" finds the service by name; "to" is used when it is a product category.
const quickLinks = [
  { label: "Surveys", match: /survey/i, icon: Radar, from: "#22d3ee", to: "#0369a1" },
  { label: "Inspection", match: /inspect/i, icon: ScanSearch, from: "#f472b6", to: "#be185d" },
  { label: "Drilling", match: /^borehole drilling|drilling/i, icon: Drill, from: "#38bdf8", to: "#0369a1" },
  { label: "Pumps", href: "/products?category=Submersible%20Pumps", icon: Gauge, from: "#818cf8", to: "#4338ca" },
  { label: "Solar", href: "/products?category=Solar%20Pump%20Systems", icon: Sun, from: "#7dd3fc", to: "#0284c7" },
  { label: "Water Purification", href: "/purification", icon: FlaskConical, from: "#34d399", to: "#047857" },
];

const tiles = [
  { title: "Borehole Drilling", text: "Surveyed, drilled, cased and tested.", image: IMAGES.drilling, match: /drilling/i },
  { title: "Clean Water Supply", text: "Pumps, tanks and water treatment.", image: IMAGES.treatment, href: "/purification" },
  { title: "Solar Pumping", text: "Cut your power bills for good.", image: IMAGES.solarPump, href: "/products?category=Solar%20Pump%20Systems" },
];

function QuickQuote() {
  const [name, setName] = useState("");
  const [county, setCounty] = useState("");
  const [service, setService] = useState("Borehole Drilling");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = `Hello, my name is ${name || "a customer"}${county ? ` from ${county} County` : ""}. I would like a free quote for: ${service}.`;
    window.open(whatsappLink(msg), "_blank", "noopener,noreferrer");
  };

  const field =
    "w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-sky-300/70";

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-md p-5 shadow-xl text-left"
      data-testid="form-quick-quote"
    >
      <div className="text-base font-bold mb-3"><LiveTitle level="sub" text="Free quote" hi="#0ea5e9" /></div>
      <div className="space-y-2.5">
        <input className={field} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
        <select className={`${field} [&>option]:text-foreground`} value={county} onChange={(e) => setCounty(e.target.value)} aria-label="County">
          <option value="">County</option>
          {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={`${field} [&>option]:text-foreground`} value={service} onChange={(e) => setService(e.target.value)} aria-label="Service needed">
          {["Borehole Drilling", "Hydrogeological Survey", "Pump Installation", "Solar Water System", "Borehole Repair"].map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>
      <button
        type="submit"
        className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-md bg-sky-400 hover:bg-sky-300 text-slate-900 text-sm font-semibold py-2.5 transition-colors"
        data-testid="button-quick-quote"
      >
        <MessageCircle className="h-4 w-4" /> Send on WhatsApp
      </button>
    </form>
  );
}

export default function Home() {
  const { data: services } = useListServices({}, { query: { queryKey: ["services", "all"] } });
  const [liveTitle, setLiveTitle] = useState("");
  useEffect(() => {
    const on = (e: Event) => setLiveTitle(String((e as CustomEvent).detail ?? ""));
    window.addEventListener(LIVE_TITLE_EVENT, on);
    return () => window.removeEventListener(LIVE_TITLE_EVENT, on);
  }, []);
  const hrefFor = (item: { href?: string; match?: RegExp }) => {
    if (item.href) return item.href;
    const svc = (services ?? []).find((x) => item.match!.test(x.name) && !/test/i.test(x.name));
    return svc ? `/services/${svc.id}` : "/services";
  };
  return (
    <>
    <div
      className="relative min-h-[calc(100dvh-64px)] pt-[64px] pb-12 text-white flex items-center"
      style={{ background: `${photoLayer(IMAGES.rig)} center 60% / cover` }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(90deg, hsl(160 52% 9% / .93) 0%, hsl(158 54% 14% / .80) 45%, hsl(155 56% 20% / .35) 100%)" }} />
      {liveTitle && (
        <div className="absolute bottom-11 left-5 z-10 flex max-w-[calc(100%-2.5rem)] items-center gap-2 rounded-full bg-black/45 px-3 py-1 text-[11px] font-semibold text-white ring-1 ring-white/15 sm:left-8" data-testid="live-now">
          <span className="live-dot h-2 w-2 shrink-0 rounded-full bg-red-500" />
          <span className="truncate text-white/90">{liveTitle}</span>
        </div>
      )}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-5 sm:px-8 grid md:grid-cols-5 gap-8 items-center">
        <div className="md:col-span-3">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight mb-3">
            <LiveTitle text="Borehole drilling" hi="#bae6fd" className="block" />
            <RotatingWords words={["across Kenya", "that finds water", "powered by solar", "with clean water"]} className="text-sky-300" />
          </h1>
          <p className="live-fade text-sm sm:text-base text-white/80 max-w-md mb-5" style={{ ["--d" as string]: "0.9s" }}>
            Survey, drilling, pumps and solar. Get a free quote today.
          </p>

          <div className="flex flex-wrap gap-3 mb-5">
            <Button asChild className="bg-sky-400 text-slate-900 hover:bg-sky-300 font-semibold" data-testid="button-hero-quote">
              <Link href="/contact">Get Free Quote <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <a href="tel:+254110699444"><Phone className="mr-2 h-4 w-4" /> Call</a>
            </Button>
            <Button asChild variant="outline" className="border-white/25 bg-white/10 text-white shadow-sm hover:bg-white/20 hover:text-white" data-testid="button-hero-login">
              <Link href={memberToken() ? "/account" : "/join?mode=login"}><UserRound className="mr-2 h-4 w-4" /> {memberToken() ? "My account" : "Log in"}</Link>
            </Button>
            <InstallApp variant="hero" />
          </div>

          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs sm:text-sm text-white/80 mb-5">
            {["Free site visit", "Written quotes", "Across Kenya"].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-emerald-400" />{t}</li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2.5">
            {quickLinks.map((q) => (
              <Link
                key={q.label}
                href={hrefFor(q)}
                data-testid={`button-quick-${q.label.toLowerCase().replace(/\s+/g, "-")}`}
                className="group inline-flex items-center gap-2 rounded-xl bg-white py-1.5 pl-1.5 pr-3.5 text-xs sm:text-sm font-semibold text-slate-800 ring-1 ring-black/5 shadow-[0_3px_0_0_rgba(15,23,42,.28),0_10px_18px_-8px_rgba(0,0,0,.55)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_5px_0_0_rgba(15,23,42,.28),0_14px_22px_-8px_rgba(0,0,0,.6)] active:translate-y-[2px] active:shadow-[0_1px_0_0_rgba(15,23,42,.28),0_4px_8px_-4px_rgba(0,0,0,.5)]"
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white ring-1 ring-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,.55),0_2px_4px_rgba(0,0,0,.25)] transition-transform duration-150 group-hover:scale-110"
                  style={{ background: `linear-gradient(145deg, ${q.from}, ${q.to})` }}
                >
                  <q.icon className="h-4 w-4" strokeWidth={2.4} />
                </span>
                {q.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="hidden md:block md:col-span-2">
          <QuickQuote />
        </div>
      </div>
    </div>

    <SuccessShowcase />
    <FloatingReel />

    {/* What we do */}
    <section className="py-8" style={pageBackdrop(IMAGES.backdropRig, "center 55%")}>
      <div className="max-w-6xl mx-auto px-5 sm:px-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <Link key={t.title} href={hrefFor(t)} className="group relative block overflow-hidden rounded-2xl aspect-[4/3] shadow-md">
            <img src={t.image} alt={t.title} loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" style={{ objectPosition: imagePosition(t.image) }} />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 35%, hsl(160 52% 8% / .88) 100%)" }} />
            <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
              <div className="text-base font-bold leading-tight"><LiveTitle text={t.title} hi="#bae6fd" level="sub" /></div>
              <div className="text-xs text-white/80 mt-0.5">{t.text}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
    </>
  );
}
