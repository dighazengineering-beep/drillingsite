// Extra photos per product (matched by product name). First image is the main one.
// Add more products here: "Product name": ["/images/products/a.webp", ...]
export const PRODUCT_GALLERY: Record<string, string[]> = {
  "Grundfos SP 5A Submersible Pump": [
    "/images/products/sp5a-2.webp",
    "/images/products/sp5a-1.webp",
    "/images/products/sp5a-3.webp",
  ],
  "Grundfos SP 11A Submersible Pump": [
    "/images/products/sp11a-1.webp",
    "/images/products/sp11a-2.webp",
    "/images/products/sp11a-3.webp",
  ],
  "Solar Pump Controller 3kW": [
    "/images/products/spc3-1.webp",
    "/images/products/spc3-2.webp",
    "/images/products/spc3-3.webp",
    "/images/products/spc3-4.webp",
    "/images/products/spc3-5.webp",
    "/images/products/spc3-6.webp",
  ],
  "Lorentz PS2 Solar Pump System": [
    "/images/products/lps2-1.webp",
    "/images/products/lps2-2.webp",
    "/images/products/lps2-3.webp",
    "/images/products/lps2-4.webp",
    "/images/products/lps2-5.webp",
    "/images/products/lps2-6.webp",
    "/images/products/lps2-7.webp",
  ],
  "uPVC Borehole Casing Pipe 6 inch": [
    "/images/products/upvc6-1.webp",
    "/images/products/upvc6-2.webp",
    "/images/products/upvc6-3.webp",
    "/images/products/upvc6-4.webp",
    "/images/products/upvc6-5.webp",
    "/images/products/upvc6-6.webp",
  ],
  "Borehole Screen & Steel Casing 6 inch": [
    "/images/products/screen6-1.webp",
    "/images/products/screen6-2.webp",
    "/images/products/screen6-3.webp",
    "/images/products/screen6-4.webp",
    "/images/products/screen6-5.webp",
    "/images/products/screen6-6.webp",
    "/images/products/screen6-7.webp",
  ],
  "UV Water Steriliser 1000 LPH": [
    "/images/products/uv1000-1.webp",
    "/images/products/uv1000-2.webp",
    "/images/products/uv1000-3.webp",
    "/images/products/uv1000-4.webp",
    "/images/products/uv1000-5.webp",
    "/images/products/uv1000-6.webp",
    "/images/products/uv1000-7.webp",
  ],
  "Reverse Osmosis System 500 LPH": [
    "/images/products/ro500-1.webp",
    "/images/products/ro500-2.webp",
    "/images/products/ro500-3.webp",
    "/images/products/ro500-4.webp",
    "/images/products/ro500-5.webp",
    "/images/products/ro500-6.webp",
    "/images/products/ro500-7.webp",
  ],
  "Water Level Meter 100m": [
    "/images/products/wlm100-1.webp",
    "/images/products/wlm100-2.webp",
    "/images/products/wlm100-3.webp",
    "/images/products/wlm100-4.webp",
    "/images/products/wlm100-5.webp",
    "/images/products/wlm100-6.webp",
    "/images/products/wlm100-7.webp",
  ],
  "HDPE Rising Main Pipe 32mm": [
    "/images/products/hdpe32-1.webp",
    "/images/products/hdpe32-2.webp",
    "/images/products/hdpe32-3.webp",
    "/images/products/hdpe32-4.webp",
    "/images/products/hdpe32-5.webp",
    "/images/products/hdpe32-6.webp",
  ],
  "Pressure Tank 100L": [
    "/images/products/tank100-1.webp",
    "/images/products/tank100-2.webp",
    "/images/products/tank100-3.webp",
    "/images/products/tank100-4.webp",
    "/images/products/tank100-5.webp",
  ],
  "Borehole Flow Meter 2 inch": [
    "/images/products/flow2-1.webp",
    "/images/products/flow2-2.webp",
    "/images/products/flow2-3.webp",
    "/images/products/flow2-4.webp",
  ],
  "JA Solar Panel 550W": [
    "/images/products/ja550-1.webp",
    "/images/products/ja550-2.webp",
    "/images/products/ja550-3.webp",
  ],
};

// Display-only renames/edits for products stored in the database under another name.
const OVERRIDES: Record<string, { name: string; description?: string; specifications?: Record<string, string> }> = {
  "Stainless Steel Borehole Screen 6 inch": {
    name: "Borehole Screen & Steel Casing 6 inch",
    description: "Slotted borehole screen and plain steel casing for water intake and borehole lining. Prevents sand ingress while maximising yield. Supplied in 6 m lengths.",
    specifications: { Diameter: "6 inch", Length: "6 m each", "Slot Size": "0.5mm" },
  },
};

export function displayName(name: string): string {
  return OVERRIDES[name]?.name ?? name;
}

export function applyOverrides<T extends { name: string; description?: string | null; specifications?: unknown }>(p: T): T {
  const o = OVERRIDES[p.name];
  if (!o) return p;
  return { ...p, name: o.name, description: o.description ?? p.description, specifications: o.specifications ?? p.specifications };
}

export function productImages(name: string, imageUrl?: string | null): string[] {
  const extra = PRODUCT_GALLERY[displayName(name)] ?? PRODUCT_GALLERY[name];
  if (extra?.length) return extra;
  return imageUrl ? [imageUrl] : [];
}
