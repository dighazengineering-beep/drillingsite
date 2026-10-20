import { Link } from "wouter";
import { Phone, Mail, MessageCircle, MapPin, Clock, Droplets } from "lucide-react";
import { whatsappLink } from "@/lib/utils";
import { LiveTitle } from "@/components/LiveTitle";
import InstallApp from "@/components/InstallApp";

const services = ["Borehole Drilling", "Hydrogeological Surveys", "Test Pumping", "Pump Installation", "Borehole Inspection", "Water Purification"];

const link = "hover:text-white transition-colors whitespace-nowrap";

export default function Footer() {
  return (
    <footer className="shrink-0 bg-[hsl(160_46%_6%)] text-white/70 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-2">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.3fr_1.7fr] gap-x-6 gap-y-3">
          {/* Brand */}
          <div className="hidden lg:block">
            <div className="flex items-center gap-2 mb-2">
              <img src={`${import.meta.env.BASE_URL}brand/logo-mark.png`} alt="Dighaz Engineering Limited logo" className="h-8 w-auto object-contain" />
              <span className="text-sm font-bold text-white">Dighaz Engineering Limited</span>
            </div>
            <p className="leading-relaxed text-white/60 max-w-[15rem]">
              Borehole drilling, pumps, solar and water purification across Kenya.
            </p>
          </div>

          {/* Services */}
          <div className="hidden lg:block">
            <div className="text-white font-semibold uppercase tracking-wider text-[11px] mb-1.5 text-center"><LiveTitle level="sub" text="Services" hi="#bae6fd" /></div>
            <ul className="grid grid-flow-col grid-rows-3 gap-x-5 gap-y-1">
              {services.map((s) => (
                <li key={s}><Link href={s === "Water Purification" ? "/purification" : "/services"} className={link}><LiveTitle level="sub" text={s} hi="#bae6fd" /></Link></li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <div className="text-white font-semibold uppercase tracking-wider text-[11px] mb-1.5 text-center"><LiveTitle level="sub" text="Contact" hi="#bae6fd" /></div>
            <ul className="mx-auto grid w-fit grid-cols-2 gap-x-6 gap-y-1.5">
              <li>
                <a href="tel:+254110699444" className={`flex items-center gap-1.5 ${link}`}>
                  <Phone className="h-3.5 w-3.5 shrink-0" /> Call Us Now
                </a>
              </li>
              <li>
                <a
                  href={whatsappLink("Hello, I'd like to inquire about your borehole services.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1.5 ${link}`}
                >
                  <MessageCircle className="h-3.5 w-3.5 shrink-0" /> Chat on WhatsApp
                </a>
              </li>
              <li>
                <a href="mailto:dighazengineering@gmail.com" className={`flex items-center gap-1.5 ${link}`}>
                  <Mail className="h-3.5 w-3.5 shrink-0" /> Email Us
                </a>
              </li>
              <li className="flex items-center gap-1.5"><MapPin className="h-3 w-3 shrink-0" /> Kenya</li>
              <li className="hidden lg:flex items-center gap-1.5"><Clock className="h-3 w-3 shrink-0" /> Opening hours to be confirmed</li>
            </ul>
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 items-center gap-1 text-center text-white/45">
          <span className="hidden sm:block" />
          <span>© {new Date().getFullYear()} Dighaz Engineering Limited. All rights reserved.</span>
          <span className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:justify-end">
            <InstallApp variant="footer" />
          </span>
        </div>
      </div>
    </footer>
  );
}
