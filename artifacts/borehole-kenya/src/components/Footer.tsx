import { Link, useLocation } from "wouter";
import { useRef } from "react";
import { ADMIN_PATH } from "@/lib/adminPath";
import SubscribeBox from "./SubscribeBox";
import { Phone, Mail, MessageCircle, MapPin, Clock } from "lucide-react";
import { whatsappLink } from "@/lib/utils";
import { LiveTitle } from "@/components/LiveTitle";
import InstallApp from "@/components/InstallApp";

const services = ["Hydrogeological Surveys", "Borehole Drilling", "Test Pumping", "Pump Installation", "Borehole Inspection", "Water Purification"];

const link = "hover:text-white transition-colors whitespace-nowrap";

export default function Footer() {
  const [, nav] = useLocation();
  const taps = useRef<number[]>([]);
  // Admin is not linked anywhere: tap the copyright line 10 times quickly to open it (works in the app too, where there is no address bar)
  const secretTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 5000), now];
    if (taps.current.length >= 10) { taps.current = []; nav(ADMIN_PATH); }
  };
  return (
    <footer className="shrink-0 bg-slate-950 text-white/70 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-2">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.3fr_1.7fr] gap-x-6 gap-y-3">
          {/* Brand */}
          <div className="hidden lg:block">
            <div className="flex items-center gap-2 mb-2">
              <img src={`${import.meta.env.BASE_URL}brand/logo-mark.png`} alt="Dighaz Engineering Limited logo" className="h-9 w-auto" />
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
                <a href="tel:+254719117660" className={`flex items-center gap-1.5 ${link}`}>
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
              <li className="flex items-center gap-1.5"><MapPin className="h-3 w-3 shrink-0" /> Nairobi, Kenya</li>
              <li className="hidden lg:flex items-center gap-1.5"><Clock className="h-3 w-3 shrink-0" /> Mon–Sat 7am–6pm</li>
            </ul>
          </div>
        </div>

        <div className="mt-3 mx-auto max-w-md"><SubscribeBox /></div>
        <div className="mt-2 pt-2 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 items-center gap-1 text-center text-white/65">
          <span className="hidden sm:block" />
          <span onClick={secretTap} className="select-none" data-testid="footer-copyright">© {new Date().getFullYear()} Dighaz Engineering Limited. All rights reserved.</span>
          <span className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:justify-end">
            <InstallApp variant="footer" />
            <a
              href="https://www.facebook.com/perfect.borehole.drillers"
              target="_blank"
              rel="noopener noreferrer"
              className={link}
            >
              Facebook
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
