import { Link } from "wouter";
import { Target, Eye, Award, Droplets, ShieldCheck, Handshake, Wrench, Phone } from "lucide-react";
import { IMAGES, pageBackdrop } from "@/lib/images";
import { LiveTitle } from "@/components/LiveTitle";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/utils";

const values = [
  { icon: Handshake, title: "Honesty", text: "Clear quotes and straight answers, so you know what you are paying for before work begins." },
  { icon: Wrench, title: "Quality workmanship", text: "Careful drilling, casing and pump fitting, done properly the first time." },
  { icon: ShieldCheck, title: "Reliability", text: "We keep our appointments and see every job through to the end." },
  { icon: Droplets, title: "Clean water first", text: "Every job has one goal: safe, dependable water for our clients." },
];

const cardTitle = "flex items-center gap-2 text-lg font-bold text-foreground";
const body = "mt-2 text-sm leading-relaxed text-muted-foreground";

export default function About() {
  return (
    <div className="min-h-[calc(100dvh-4rem)] px-4 pt-24 pb-12" style={pageBackdrop(IMAGES.backdropWater, "center 50%")}>
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="rounded-2xl bg-card/95 p-5 shadow-xl sm:p-7">
          <h1 className="text-2xl font-bold text-foreground"><LiveTitle text="About Us" hi="#0ea5e9" /></h1>
          <p className={body}>
            Dighaz Engineering Limited is a Nairobi-based engineering company that helps homes, farms, schools and businesses get reliable water.
            We do borehole drilling, hydrogeological surveys, test pumping, pump installation, borehole inspection, solar systems and water purification,
            so one team can take you from finding water to having it flow from your tap.
          </p>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-2xl bg-card/95 p-5 shadow-xl sm:p-6">
            <h2 className={cardTitle}><Target className="h-5 w-5 text-primary" /><LiveTitle level="sub" text="Our Mission" hi="#0ea5e9" /></h2>
            <p className={body}>
              To provide homes, farms and businesses with dependable, clean water through professional borehole drilling and carefully fitted pumping systems.
            </p>
          </section>
          <section className="rounded-2xl bg-card/95 p-5 shadow-xl sm:p-6">
            <h2 className={cardTitle}><Eye className="h-5 w-5 text-primary" /><LiveTitle level="sub" text="Our Vision" hi="#0ea5e9" /></h2>
            <p className={body}>
              A Kenya where clean water is within reach of every community, and where a well-built borehole is the standard.
            </p>
          </section>
        </div>

        <section className="rounded-2xl bg-card/95 p-5 shadow-xl sm:p-7">
          <h2 className={cardTitle}><Award className="h-5 w-5 text-primary" /><LiveTitle level="sub" text="Our Values" hi="#0ea5e9" /></h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {values.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-xl border border-border bg-background/70 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground"><Icon className="h-4 w-4 text-primary" />{title}</div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-card/95 p-5 text-center shadow-xl sm:p-7">
          <h2 className="text-lg font-bold text-foreground">Need water on your land?</h2>
          <p className={body}>Tell us where you are and what you need, and we will reply with a clear quote.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild><Link href="/contact">Get Free Quote</Link></Button>
            <Button asChild variant="outline">
              <a href={whatsappLink("Hello, I'd like to inquire about your borehole services.")} target="_blank" rel="noopener noreferrer"><Phone className="mr-1.5 h-4 w-4" />Chat on WhatsApp</a>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
