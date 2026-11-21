import { LOGO_PX, LOGO_RGB_Z_B64, LOGO_ALPHA_Z_B64 } from "./logoData";
// A tiny PDF writer (no extra packages): coloured boxes and text in the built-in Helvetica fonts, over one or more A4 pages.
// Coordinates are in points on an A4 page (595 x 842), with (0,0) at the bottom-left.

export const PAGE_W = 595;
export const PAGE_H = 842;

type Rgb = [number, number, number];
export const rgb = (hex: string): Rgb => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;

/** Keep only characters the standard PDF fonts can show; anything else becomes "?". */
export function sanitize(s: string): string {
  let out = "";
  for (const ch of s.replace(/[\r\n\t]+/g, " ")) {
    const c = ch.codePointAt(0) ?? 63;
    const ok = (c >= 32 && c <= 126) || (c >= 161 && c <= 255);
    out += ok ? ch : c === 0x2019 || c === 0x2018 ? "'" : c === 0x2013 || c === 0x2014 ? "-" : "?";
  }
  return out;
}
const esc = (s: string) => s.replace(/[()\\]/g, (c) => `\\${c}`);

// Helvetica character widths (thousandths of an em) for ASCII 32..126, used to measure text for wrapping and right-aligning.
const W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];
/** Width of text in points. Bold letters are a little wider than regular ones (digits and punctuation are the same). */
export function textWidth(s: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of sanitize(s)) {
    const c = ch.charCodeAt(0);
    let u = c >= 32 && c <= 126 ? W[c - 32]! : 556;
    if (bold && /[A-Za-z]/.test(ch)) u = Math.round(u * 1.07);
    w += u;
  }
  return (w * size) / 1000;
}
/** Split text into lines that fit in `width` points. A single very long word is broken so it never runs out of its column. */
export function wrapText(s: string, width: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  for (const para of s.replace(/\r/g, "").split("\n").map(sanitize)) {
    let cur = "";
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (textWidth(word, size, bold) > width) {
        let cut = word.length - 1;
        while (cut > 1 && textWidth(word.slice(0, cut), size, bold) > width) cut--;
        if (cur) { lines.push(cur); cur = ""; }
        lines.push(word.slice(0, cut)); word = word.slice(cut);
      }
      const next = cur ? `${cur} ${word}` : word;
      if (cur && textWidth(next, size, bold) > width) { lines.push(cur); cur = word; } else cur = next;
    }
    lines.push(cur);
  }
  return lines;
}

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();

export class SimplePdf {
  private pages: string[][] = [[]];
  private cur = 0;
  private usesLogo = false;
  private pillShade: { x: number; w: number } | null = null; // the one gradient pill in the document (the shading runs across its width)
  private links: { page: number; rect: [number, number, number, number]; uri: string }[] = [];

  get pageCount() { return this.pages.length; }
  /** Start a new page and draw on it. */
  newPage() { this.pages.push([]); this.cur = this.pages.length - 1; return this; }
  /** Draw on an earlier page (page numbers start at 1). */
  onPage(n: number) { this.cur = Math.min(Math.max(1, n), this.pages.length) - 1; return this; }
  private add(op: string) { this.pages[this.cur]!.push(op); }

  rect(x: number, y: number, w: number, h: number, color: Rgb) {
    this.add(`${color.map(f2).join(" ")} rg ${f2(x)} ${f2(y)} ${f2(w)} ${f2(h)} re f`);
    return this;
  }
  line(x1: number, y1: number, x2: number, y2: number, color: Rgb, width = 0.6) {
    this.add(`${color.map(f2).join(" ")} RG ${f2(width)} w ${f2(x1)} ${f2(y1)} m ${f2(x2)} ${f2(y2)} l S`);
    return this;
  }
  text(s: string, x: number, y: number, size: number, color: Rgb, bold = false) {
    this.add(`BT /${bold ? "F2" : "F1"} ${f2(size)} Tf ${color.map(f2).join(" ")} rg ${f2(x)} ${f2(y)} Td (${esc(sanitize(s))}) Tj ET`);
    return this;
  }
  /** The site logo (transparent, no tile), `size` points wide, lower-left corner at (x, y). */
  logo(x: number, y: number, size: number) {
    this.usesLogo = true;
    this.add(`q ${f2(size)} 0 0 ${f2(size)} ${f2(x)} ${f2(y)} cm /Im1 Do Q`);   // transparent logo: it takes the colour of the page behind it
    return this;
  }
  /** The company's rectangular rubber stamp (vector), centred at (cx, cy), `w` points wide. Only the date in the middle changes. */
  stamp(cx: number, cy: number, w: number, dateText: string) {
    const k = w / 360, blue: Rgb = [0.122, 0.184, 0.839], red: Rgb = [0.898, 0.071, 0.169];
    const x0 = cx - 166 * k, y0 = cy - 71 * k, W = 332 * k, H = 142 * k, r = 12 * k, c = r * 0.5523, x1 = x0 + W, y1 = y0 + H;
    this.add(`${blue.map(f2).join(" ")} RG ${f2(3.4 * k)} w ${f2(x0 + r)} ${f2(y0)} m ${f2(x1 - r)} ${f2(y0)} l ${f2(x1 - r + c)} ${f2(y0)} ${f2(x1)} ${f2(y0 + r - c)} ${f2(x1)} ${f2(y0 + r)} c ${f2(x1)} ${f2(y1 - r)} l ${f2(x1)} ${f2(y1 - r + c)} ${f2(x1 - r + c)} ${f2(y1)} ${f2(x1 - r)} ${f2(y1)} c ${f2(x0 + r)} ${f2(y1)} l ${f2(x0 + r - c)} ${f2(y1)} ${f2(x0)} ${f2(y1 - r + c)} ${f2(x0)} ${f2(y1 - r)} c ${f2(x0)} ${f2(y0 + r)} l ${f2(x0)} ${f2(y0 + r - c)} ${f2(x0 + r - c)} ${f2(y0)} ${f2(x0 + r)} ${f2(y0)} c S`);
    const mid = (txt: string, dy: number, size: number, color: Rgb, maxW = 300) => {
      let sz = size; const t = sanitize(txt);
      while (textWidth(t, sz * k, true) > maxW * k && sz > 6) sz -= 0.5;
      this.add(`BT /F2 ${f2(sz * k)} Tf ${color.map(f2).join(" ")} rg ${f2(cx - textWidth(t, sz * k, true) / 2)} ${f2(cy + dy * k)} Td (${esc(t)}) Tj ET`);
    };
    mid("DIGHAZ ENGINEERING LIMITED", 40, 17, blue);
    mid("Rhapta Road, Nairobi", 18, 15, blue);
    mid(dateText, -17, 28, red);
    mid("Tel: 0719117660", -44, 15, blue);
    mid("P.O. Box 147461, Westlands, 00800", -62, 14, blue, 290);
    return this;
  }
  /** A clickable area on the current page that opens a web address. Only plain http(s) addresses are accepted. */
  link(x: number, y: number, w: number, h: number, uri: string) {
    if (!/^https?:\/\/[\x21-\x7e]+$/.test(uri)) return this;
    this.links.push({ page: this.cur, rect: [x, y, x + w, y + h], uri });
    return this;
  }
  /** A fully rounded pill filled with the site's Pay-button gradient (navy, blue, amber from left to right). Only one per document. */
  gradientPill(x: number, y: number, w: number, h: number) {
    this.pillShade = { x, w };
    const r = h / 2, k = r * 0.5523, x2 = x + w, y2 = y + h;
    this.add(`q ${f2(x + r)} ${f2(y)} m ${f2(x2 - r)} ${f2(y)} l ${f2(x2 - r + k)} ${f2(y)} ${f2(x2)} ${f2(y + r - k)} ${f2(x2)} ${f2(y + r)} c ${f2(x2)} ${f2(y + r + k)} ${f2(x2 - r + k)} ${f2(y2)} ${f2(x2 - r)} ${f2(y2)} c ${f2(x + r)} ${f2(y2)} l ${f2(x + r - k)} ${f2(y2)} ${f2(x)} ${f2(y + r + k)} ${f2(x)} ${f2(y + r)} c ${f2(x)} ${f2(y + r - k)} ${f2(x + r - k)} ${f2(y)} ${f2(x + r)} ${f2(y)} c W n /Sh1 sh Q`);
    return this;
  }
  /** A small wallet icon (outline with a clasp), white, with its lower-left corner at (x, y). */
  walletIcon(x: number, y: number, color: Rgb) {
    const c = color.map(f2).join(" ");
    this.add(`q ${c} RG ${c} rg 1.3 w 1 j ${f2(x)} ${f2(y)} 13 10 re S ${f2(x + 8)} ${f2(y + 3)} 5 4 re S ${f2(x + 10)} ${f2(y + 4.2)} 1.4 1.6 re f Q`);
    return this;
  }
  /** Text whose RIGHT edge is at x. */
  textRight(s: string, x: number, y: number, size: number, color: Rgb, bold = false) {
    return this.text(s, x - textWidth(s, size, bold), y, size, color, bold);
  }

  build(title: string): Buffer {
    const n = this.pages.length;
    // object numbers: 1 catalog, 2 pages, 3-4 fonts, 5.. each page + its content, then the logo, the gradient, the links, the info
    let next = 5 + 2 * n;
    const logoMask = this.usesLogo ? next++ : 0, logoImg = this.usesLogo ? next++ : 0;
    const shade = this.pillShade ? next : 0;
    if (this.pillShade) next += 4; // two colour functions, the join of them, the shading itself
    const linkIds = this.links.map(() => next++);
    const objs: string[] = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${this.pages.map((_, i) => `${5 + 2 * i} 0 R`).join(" ")}] /Count ${n} >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ];
    this.pages.forEach((ops, i) => {
      const content = ops.join("\n");
      const annots = this.links.map((l, k) => (l.page === i ? `${linkIds[k]} 0 R` : "")).filter(Boolean);
      objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${this.usesLogo ? ` /XObject << /Im1 ${logoImg} 0 R >>` : ""}${this.pillShade ? ` /Shading << /Sh1 ${shade + 3} 0 R >>` : ""} >>${annots.length ? ` /Annots [${annots.join(" ")}]` : ""} /Contents ${6 + 2 * i} 0 R >>`);
      objs.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    });
    if (this.usesLogo) { // soft mask (the rounded corners) first, then the picture that points at it
      const a = Buffer.from(LOGO_ALPHA_Z_B64, "base64"), c = Buffer.from(LOGO_RGB_Z_B64, "base64");
      objs.push(`<< /Type /XObject /Subtype /Image /Width ${LOGO_PX} /Height ${LOGO_PX} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${a.length} >>\nstream\n${a.toString("latin1")}\nendstream`);
      objs.push(`<< /Type /XObject /Subtype /Image /Width ${LOGO_PX} /Height ${LOGO_PX} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask ${logoMask} 0 R /Length ${c.length} >>\nstream\n${c.toString("latin1")}\nendstream`);
    }
    if (this.pillShade) {
      // navy (0) -> blue (0.6) -> amber (1): the same three colours as the Pay button in the site header
      objs.push("<< /FunctionType 2 /Domain [0 1] /C0 [0.047 0.141 0.271] /C1 [0 0.349 0.702] /N 1 >>");
      objs.push("<< /FunctionType 2 /Domain [0 1] /C0 [0 0.349 0.702] /C1 [0.961 0.624 0.039] /N 1 >>");
      objs.push(`<< /FunctionType 3 /Domain [0 1] /Functions [${shade} 0 R ${shade + 1} 0 R] /Bounds [0.6] /Encode [0 1 0 1] >>`);
      objs.push(`<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${f2(this.pillShade.x)} 0 ${f2(this.pillShade.x + this.pillShade.w)} 0] /Function ${shade + 2} 0 R /Extend [true true] >>`);
    }
    for (const l of this.links) objs.push(`<< /Type /Annot /Subtype /Link /Rect [${l.rect.map(f2).join(" ")}] /Border [0 0 0] /A << /S /URI /URI (${esc(l.uri)}) >> >>`);
    objs.push(`<< /Title (${esc(sanitize(title))}) /Producer (Dighaz Engineering Limited) >>`);
    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    objs.forEach((o, i) => {
      offsets.push(Buffer.byteLength(out, "latin1"));
      out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = Buffer.byteLength(out, "latin1");
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, "latin1");
  }
}
