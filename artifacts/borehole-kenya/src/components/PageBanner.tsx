import type { ReactNode } from "react";
import { IMAGES, bannerBackground } from "@/lib/images";
import { LiveTitle } from "@/components/LiveTitle";

interface PageBannerProps {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
  image?: string;
}

/** Compact two-column blue banner shared by inner pages. Left: text. Right: page-specific controls. */
export default function PageBanner({ eyebrow, title, description, children, image = IMAGES.rig }: PageBannerProps) {
  return (
    <section
      className="relative overflow-hidden text-white"
      style={{ background: bannerBackground(image) }}
    >
      <div
        className="absolute inset-0 opacity-[0.10]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(0 0% 100% / .5) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / .5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at 20% 50%, black 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at 20% 50%, black 0%, transparent 70%)",
        }}
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[80px] pb-5 grid md:grid-cols-2 gap-4 md:gap-8 items-center">
        <div>
          <div className="live-fade text-[11px] uppercase tracking-widest text-sky-300 font-semibold mb-1">{eyebrow}</div>
          <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight mb-1"><LiveTitle text={title} hi="#bae6fd" /></h1>
          <p className="live-fade text-sm text-white/75 max-w-md" style={{ ["--d" as string]: "0.5s" }}>{description}</p>
        </div>
        {children && <div>{children}</div>}
      </div>
    </section>
  );
}
