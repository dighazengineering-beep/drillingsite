import { imagePosition } from "@/lib/images";

interface BlendedPhotoProps {
  src: string;
  alt: string;
  /** Height classes, e.g. "h-32". Width always fills the parent. */
  className?: string;
  /** Melt the bottom of the photo into the card colour (no visible edge). Default true. */
  fadeBottom?: boolean;
}

/** Card photo: fills the width, focused on the important part, with the bottom melting into the card. */
export default function BlendedPhoto({ src, alt, className = "h-32", fadeBottom = true }: BlendedPhotoProps) {
  return (
    <div className={`relative w-full overflow-hidden ${fadeBottom ? "bg-card" : "bg-slate-800"} ${className}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={`w-full object-cover ${fadeBottom ? "h-[calc(100%-1px)]" : "h-full"}`}
        style={{ objectPosition: imagePosition(src) }}
      />
      {fadeBottom && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card via-card/60 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-card" />
        </>
      )}
    </div>
  );
}
