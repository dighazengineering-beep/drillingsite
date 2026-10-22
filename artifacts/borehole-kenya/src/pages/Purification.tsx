import { useState } from "react";
import { LiveTitle } from "@/components/LiveTitle";
import { Link } from "wouter";
import { ArrowRight, MessageCircle, Phone, FlaskConical, Filter, Droplets, Waves, ShieldCheck, Wrench, ClipboardCheck, Search, PackageCheck, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageBanner from "@/components/PageBanner";
import { IMAGES, pageBackdrop } from "@/lib/images";
import { whatsappLink, KENYA_COUNTIES } from "@/lib/utils";

const problems = [
  { icon: Droplets, problem: "Hard water", sign: "Scale on kettles and taps, soap won't lather", fix: "Water softener", color: "#0ea5e9" },
  { icon: Waves, problem: "Salty or high-mineral water", sign: "Salty taste, high dissolved solids", fix: "Reverse osmosis (RO)", color: "#6366f1" },
  { icon: ShieldCheck, problem: "Germs and bacteria", sign: "Unsafe to drink, positive lab result", fix: "UV sterilisation", color: "#10b981" },
  { icon: Filter, problem: "Dirty, rusty or smelly water", sign: "Brown colour, sand, iron stains, odour", fix: "Sand and carbon filtration", color: "#0ea5e9" },
];

const steps = [
  { icon: Search, title: "Test", text: "We test your water to see what is in it." },
  { icon: ClipboardCheck, title: "Recommend", text: "We suggest the right system and give a written quote." },
  { icon: PackageCheck, title: "Install", text: "We install, commission and show you how to use it." },
  { icon: LifeBuoy, title: "Support", text: "Servicing, filter changes and spare parts when you need them." },
];

const field =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

export default function Purification() {
  const [name, setName] = useState("");
  const [county, setCounty] = useState("");
  const [issue, setIssue] = useState("Not sure - please advise");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = `Hello, my name is ${name || "a customer"}${county ? ` from ${county} County` : ""}. I would like a quote for water purification. Water problem: ${issue}.`;
    window.open(whatsappLink(msg), "_blank", "noopener,noreferrer");
  };

  return (
    <div>
      <PageBanner
        image={IMAGES.purification}
        eyebrow="Water Purification"
        title="Clean, safe water from your tap"
        description="Testing, treatment systems, installation and servicing, matched to your water."
      >
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Button asChild className="bg-sky-400 text-slate-900 hover:bg-sky-300">
            <a href="#quote">Get a Quote <ArrowRight className="ml-1.5 h-4 w-4" /></a>
          </Button>
          <Button asChild variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
            <a href="tel:+254719117660"><Phone className="mr-2 h-4 w-4" /> Call</a>
          </Button>
        </div>
      </PageBanner>

      <div style={pageBackdrop(IMAGES.backdropPlant, "center 50%")}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
          {/* What fixes what */}
          <section className="rounded-2xl bg-card/95 shadow-xl p-4 sm:p-5">
            <h2 className="text-base font-bold text-foreground mb-3"><LiveTitle text="What is wrong with your water?" hi="#0ea5e9" level="sub" /></h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {problems.map((p) => (
                <div key={p.problem} className="rounded-xl border border-border bg-background p-3.5 flex flex-col">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white mb-2" style={{ background: p.color }}>
                    <p.icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-sm font-semibold text-foreground"><LiveTitle level="sub" text={p.problem} hi="#0ea5e9" /></h3>
                  <p className="text-xs text-muted-foreground leading-snug mt-0.5 mb-2">{p.sign}</p>
                  <p className="mt-auto text-xs text-foreground">
                    Fix: <span className="font-semibold text-primary">{p.fix}</span>
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* How it works + quote */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
            <section className="lg:col-span-3 rounded-2xl bg-card/95 shadow-xl p-4 sm:p-5">
              <h2 className="text-base font-bold text-foreground mb-3"><LiveTitle text="How it works" hi="#0ea5e9" level="sub" /></h2>
              <ol className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {steps.map((s, i) => (
                  <li key={s.title} className="flex gap-3 rounded-xl bg-muted/60 p-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">{i + 1}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground"><LiveTitle level="sub" text={s.title} hi="#0ea5e9" /></h3>
                      <p className="text-xs text-muted-foreground leading-snug">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                <div className="flex items-center gap-3">
                  <FlaskConical className="h-6 w-6 text-primary shrink-0" />
                  <p className="text-sm text-foreground">Browse the treatment equipment we stock: RO systems, UV sterilisers, filters and more.</p>
                </div>
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <Link href="/products?category=Water%20Treatment">View equipment <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
                </Button>
              </div>
            </section>

            <section id="quote" className="lg:col-span-2 rounded-2xl bg-card/95 shadow-xl p-4 sm:p-5 scroll-mt-24">
              <h2 className="text-base font-bold text-foreground"><LiveTitle text="Request a quote" hi="#0ea5e9" level="sub" /></h2>
              <p className="text-xs text-muted-foreground mb-3">Free advice. Quotes are matched to your water test.</p>
              <form onSubmit={submit} className="space-y-2.5" data-testid="form-purification-quote">
                <input className={field} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
                <select className={field} value={county} onChange={(e) => setCounty(e.target.value)}>
                  <option value="">County</option>
                  {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className={field} value={issue} onChange={(e) => setIssue(e.target.value)}>
                  {["Not sure - please advise", "Hard water", "Salty water", "Germs / bacteria", "Dirty, rusty or smelly water", "Drinking water for a business"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
                <Button type="submit" className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white">
                  <MessageCircle className="mr-2 h-4 w-4" /> Send on WhatsApp
                </Button>
              </form>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wrench className="h-3.5 w-3.5" /> Installation and servicing included
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
