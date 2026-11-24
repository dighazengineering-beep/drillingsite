import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { spread, type DocInput } from "./hydroDocx";
import { stampSvg, stampDate } from "./companyStamp";

/**
 * The watermarked preview: every page is drawn as a PICTURE (not text) with the company name tiled across it,
 * then the pictures are put into a PDF. It cannot be converted to an editable Word file, and the watermark is part of the page.
 */
const PW = 794, PH = 1123, MX = 76, MT = 90, MB = 80; // A4 at 96 dpi
const SERIF = '"Calibri", "Carlito", "Liberation Sans", "DejaVu Sans", Arial, sans-serif';
const HSERIF = '"Cambria", "Caladea", "Liberation Serif", "DejaVu Serif", serif';
const NAVY = "#0B3A8C", GREEN = "#2E8B3D", PALE = "#EAF0FA", ZEBRA = "#F5F8FD", LINEC = "#C5D1E3";

/** mark = the watermark text, or null for the clean full PDF (paid). */
export async function buildPreviewPdf(d: DocInput, mark: string | null): Promise<Buffer> {
  const SCALE = mark ? 1.3 : 1.7; const Q = mark ? 62 : 82;
  const pages: Buffer[] = [];
  let cv = createCanvas(Math.round(PW * SCALE), Math.round(PH * SCALE)); let g = cv.getContext("2d"); let y = MT; let n = 0;
  const CW = PW - MX * 2;
  const font = (size: number, bold = false, italic = false) => { g.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px ${SERIF}`; };
  const stamp = () => {
    g.save(); g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    // running header and footer
    if (n > 0) {
      g.textAlign = "left"; g.fillStyle = NAVY; g.font = `bold 10px ${HSERIF}`; g.fillText(d.company.toUpperCase(), MX, 52);
      g.textAlign = "right"; g.fillStyle = "#5B6573"; font(10); g.fillText(d.title, PW - MX, 52); g.strokeStyle = GREEN; g.lineWidth = 1.2; g.beginPath(); g.moveTo(MX, 58); g.lineTo(PW - MX, 58); g.stroke();
      g.strokeStyle = LINEC; g.lineWidth = 0.8; g.beginPath(); g.moveTo(MX, PH - 56); g.lineTo(PW - MX, PH - 56); g.stroke();
      g.textAlign = "left"; g.fillStyle = "#5B6573"; font(10); g.fillText(d.footerText, MX, PH - 40);
      g.textAlign = "right"; g.fillStyle = NAVY; g.font = `bold 10px ${SERIF}`; g.fillText(`Page ${n}`, PW - MX, PH - 40);
    }
    if (!mark) { g.restore(); return; }
    // the watermark: the name repeated all over the page, slanted, light enough to read through
    g.translate(PW / 2, PH / 2); g.rotate(-Math.PI / 6);
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "rgba(11,42,74,0.16)"; g.font = `bold 34px ${SERIF}`;
    for (let r = -9; r <= 9; r++) for (let c = -3; c <= 3; c++) g.fillText(mark, c * 470 + (r % 2 ? 235 : 0), r * 95);
    g.restore();
  };
  const finish = () => { stamp(); pages.push(cv.toBuffer("image/jpeg", Q)); n++; cv = createCanvas(Math.round(PW * SCALE), Math.round(PH * SCALE)); g = cv.getContext("2d"); g.scale(SCALE, SCALE); g.fillStyle = "#fff"; g.fillRect(0, 0, PW, PH); g.textBaseline = "alphabetic"; y = MT; };
  g.scale(SCALE, SCALE); g.fillStyle = "#fff"; g.fillRect(0, 0, PW, PH);
  const pm: Record<string, number> = {}; let hn = 0;
  const room = (h: number) => { if (y + h > PH - MB) finish(); };
  const wrap = (t: string, w: number): string[] => {
    const out: string[] = []; let line = "";
    for (const word of t.split(/\s+/).filter(Boolean)) { const tryL = line ? `${line} ${word}` : word; if (g.measureText(tryL).width > w && line) { out.push(line); line = word; } else line = tryL; }
    if (line) out.push(line); return out;
  };
  const text = (t: string, o: { size?: number; bold?: boolean; color?: string; align?: "left" | "center"; indent?: number; after?: number; lh?: number } = {}) => {
    const size = o.size ?? 13.5; font(size, o.bold); g.fillStyle = o.color ?? "#111"; g.textAlign = "left";
    const lh = o.lh ?? size * 1.5; const x0 = MX + (o.indent ?? 0);
    for (const ln of wrap(t, CW - (o.indent ?? 0))) { room(lh); g.fillStyle = o.color ?? "#111"; font(size, o.bold); if (o.align === "center") { g.textAlign = "center"; g.fillText(ln, PW / 2, y + size); } else { g.textAlign = "left"; g.fillText(ln, x0, y + size); } y += lh; }
    y += o.after ?? 6;
  };
  const heading = (s: { num?: string; title: string; level: number }) => {
    const size = s.level === 1 ? 20 : s.level === 2 ? 16.5 : 14.5; room(size * 3); y += s.level === 1 ? 14 : 8;
    const t = `${s.num ? s.num + "  " : ""}${s.title}`; g.font = `bold ${size}px ${HSERIF}`; g.fillStyle = s.level === 1 ? NAVY : s.level === 2 ? "#1F5FBF" : GREEN; g.textAlign = "left";
    room(size * 1.6); pm[`h${++hn}`] = n; g.fillText(t, MX, y + size); y += size * 1.35;
    if (s.level === 1) { g.strokeStyle = GREEN; g.lineWidth = 1.6; g.beginPath(); g.moveTo(MX, y); g.lineTo(PW - MX, y); g.stroke(); y += 8; } else y += 3;
  };
  const picture = async (buf: Buffer, w: number, h: number, maxH = 400, maxW = CW) => {
    try {
      const im = await loadImage(buf); const k = Math.min(maxW / (w || im.width), maxH / (h || im.height), 1.5); const iw = (w || im.width) * k, ih = (h || im.height) * k;
      room(ih + 10); g.drawImage(im, (PW - iw) / 2, y, iw, ih); y += ih + 8;
    } catch { /* a picture that cannot be read is skipped */ }
  };
  let fig = 0, tab = 0;
  const caption = (label: string, t: string) => { room(34); pm[`${label === "Figure" ? "f" : "t"}${label === "Figure" ? fig + 1 : tab + 1}`] = n; text(`${label} ${label === "Figure" ? ++fig : ++tab}: ${t}`, { size: 12, bold: true, align: "center", after: 10, color: NAVY }); };
  const table = (head: string[], rows: string[][]) => {
    const cols = Math.max(1, head.length); const wts = head.map((h, i) => Math.max(6, h.length, ...rows.map((r) => (r[i] ?? "").length > 40 ? 40 : (r[i] ?? "").length)));
    const sum = wts.reduce((a, b) => a + b, 0); const ws = wts.map((x) => (x / sum) * CW);
    let zi = 0;
    const row = (cells: string[], hd: boolean) => { zi++;
      font(11.5, hd); const lines = cells.map((c, i) => wrap(c ?? "", ws[i]! - 10)); const h = Math.max(...lines.map((l) => l.length), 1) * 16 + 8;
      room(h); let x = MX;
      for (let i = 0; i < cols; i++) {
        g.fillStyle = hd ? NAVY : zi % 2 ? ZEBRA : "#fff"; g.fillRect(x, y, ws[i]!, h); g.strokeStyle = LINEC; g.lineWidth = 0.8; g.strokeRect(x, y, ws[i]!, h);
        g.fillStyle = hd ? "#fff" : "#111"; font(11.5, hd); g.textAlign = "left"; lines[i]!.forEach((l, j) => g.fillText(l, x + 5, y + 16 + j * 16)); x += ws[i]!;
      }
      y += h;
    };
    row(head, true); for (const r of rows) row(r, false); y += 12;
  };

  // cover: logo, coloured band, details, reference, company stamp (same look as the Word file)
  y = 70;
  if (d.logo) { try { const im = await loadImage(d.logo); const h = 62, w = (im.width / im.height) * h; g.drawImage(im, (PW - w) / 2, y, w, h); y += h + 10; } catch { /* no logo */ } }
  g.font = `bold 14px ${HSERIF}`; g.fillStyle = NAVY; g.textAlign = "center"; g.fillText(d.company.toUpperCase().split("").join(" "), PW / 2, y + 14); y += 36;
  const bandH = 150; g.fillStyle = NAVY; g.fillRect(MX, y, CW, bandH); g.fillStyle = GREEN; g.fillRect(MX, y + bandH, CW, 6);
  { const yy = y; y = yy + 38; g.fillStyle = "#fff"; g.font = `bold 28px ${HSERIF}`; const tl = wrap(d.title, CW - 40); g.textAlign = "center"; tl.forEach((l, i) => g.fillText(l, PW / 2, yy + 50 + i * 36)); g.fillStyle = "#DCE8FA"; g.font = `18px ${HSERIF}`; g.fillText(d.subtitle, PW / 2, yy + 56 + tl.length * 36 + 10); y = yy + bandH + 30; }
  for (const [k, v] of d.cover.filter(([, v]) => v)) { room(30); const h = 27; g.fillStyle = PALE; g.fillRect(MX, y, CW * 0.32, h); g.strokeStyle = LINEC; g.lineWidth = 0.8; g.strokeRect(MX, y, CW * 0.32, h); g.strokeRect(MX + CW * 0.32, y, CW * 0.68, h); g.textAlign = "left"; g.fillStyle = NAVY; g.font = `bold 12.5px ${SERIF}`; g.fillText(k, MX + 8, y + 18); g.fillStyle = "#1F2933"; g.font = `12.5px ${SERIF}`; g.fillText(v, MX + CW * 0.32 + 8, y + 18); y += h; }
  y += 24; g.font = `bold 14px ${HSERIF}`; g.fillStyle = NAVY; g.textAlign = "center"; g.fillText(`${d.reference ? `Report Reference: ${d.reference}   |   ` : ""}Report Date: ${d.date}`, PW / 2, y + 14); y += 28;
  g.font = `italic 11px ${SERIF}`; g.fillStyle = "#5B6573"; g.fillText("This report is prepared for the exclusive use of the client and project stakeholders named herein.", PW / 2, y + 10); y += 22;
  try { const dt = new Date(d.date); const im = await loadImage(Buffer.from(stampSvg(stampDate(isNaN(dt.getTime()) ? new Date() : dt)))); g.drawImage(im, (PW - 200) / 2, y, 200, 94); y += 104; } catch { /* no stamp */ }
  if (mark) text("PREVIEW COPY. Pay to receive the full report as an editable Word document.", { size: 12, align: "center", color: "#a11" });
  finish();
  // contents, list of figures, list of tables, glossary: laid out like the Word file so the page numbers agree
  heading({ title: "TABLE OF CONTENTS", level: 1 }); hn = 0;
  for (const s of d.secs) text(`${s.num ? s.num + "  " : ""}${s.title}`, { size: s.level === 1 ? 13 : 12, bold: s.level === 1, indent: (s.level - 1) * 18, after: 1, lh: 18 });
  text("REFERENCES", { size: 13, bold: true, after: 1, lh: 18 }); for (let i = 0; i < (d.appendices ?? []).length; i++) text(`Appendix ${String.fromCharCode(65 + i)}`, { size: 13, bold: true, after: 1, lh: 18 });
  finish();
  const nFig = d.figures.length + (d.appendices ?? []).filter((x) => x.figure).length, nTab = d.tables.length + Object.values(d.flow ?? {}).flat().filter((f) => "table" in f).length + (d.appendices ?? []).filter((x) => !x.figure && !x.blocks && !x.plates).length;
  heading({ title: "LIST OF FIGURES", level: 1 }); for (let i = 0; i < nFig; i++) text(`Figure ${i + 1}`, { size: 12, after: 2, lh: 18 }); finish();
  heading({ title: "LIST OF TABLES", level: 1 }); for (let i = 0; i < nTab; i++) text(`Table ${i + 1}`, { size: 12, after: 2, lh: 18 }); finish();
  heading({ title: "GLOSSARY AND ABBREVIATIONS", level: 1 }); hn = 0; table(["Term", "Meaning"], d.abbreviations.map(([a, b]) => [a, b])); finish();
  const extraList = (id: string): (() => Promise<void>)[] => {
    const ts = d.tables.filter((x) => x.after === id).map((t) => async () => { caption("Table", t.caption); table(t.head, t.rows); });
    const fs = d.figures.filter((x) => x.after === id).map((f) => async () => { await picture(f.buf, f.w, f.h, /geoelectric section at station/i.test(f.caption) ? 420 : 340); caption("Figure", f.caption); });
    const out: (() => Promise<void>)[] = []; for (let i = 0; i < Math.max(ts.length, fs.length); i++) { if (fs[i]) out.push(fs[i]!); if (ts[i]) out.push(ts[i]!); }
    return out;
  };
  for (const s of d.secs) {
    heading(s);
    const items: { isP: boolean; make: () => Promise<void> }[] = [];
    if (d.flow?.[s.id]) {
      for (const f of d.flow[s.id]!) {
        if ("p" in f) items.push({ isP: true, make: async () => text(f.p, { indent: 0, after: 7 }) });
        else if ("table" in f) items.push({ isP: false, make: async () => { caption("Table", f.table.caption); table(f.table.head, f.table.rows); } });
        else items.push({ isP: false, make: async () => { for (const b of f.bullets) text(`•  ${b}`, { indent: 14, after: 3 }); } });
      }
    } else for (const p of d.text[s.id] ?? []) items.push({ isP: true, make: async () => text(p, { after: 7 }) });
    // pictures, charts and tables sit between paragraphs, spread through the section
    const ex = extraList(s.id), at = spread(ex.length, items.filter((x) => x.isP).length);
    let pc = 0, ei = 0;
    for (const it of items) { await it.make(); if (it.isP) { pc++; while (ei < ex.length && at[ei]! <= pc) await ex[ei++]!(); } }
    while (ei < ex.length) await ex[ei++]!();
  }
  finish(); heading({ title: "REFERENCES", num: "9.0", level: 1 }); d.references.forEach((r, i) => text(`${i + 1}.  ${r}`, { size: 12.5, after: 3, indent: 12 }));
  if (!mark) {
    for (let i = 0; i < (d.appendices ?? []).length; i++) {
      const a = d.appendices![i]!; if (i === 0) finish();
      heading({ title: `Appendix ${String.fromCharCode(65 + i)}: ${a.title}`, level: 1 });
      if (a.intro) text(a.intro, { after: 7 });
      if (a.figure) { await picture(a.figure.buf, a.figure.w, a.figure.h, 420); caption("Figure", a.caption); }
      else if (a.blocks) for (const b of a.blocks) { heading({ title: b.h, level: 2 }); for (const t of b.p) text(t, { after: 7 }); }
      else if (a.plates) { let k = 0; for (const pl of a.plates) { await picture(pl.buf, pl.w, pl.h, 300, 460); text(`Plate ${++k}: ${pl.caption}`, { size: 12, bold: true, align: "center", after: 10 }); } }
      else { caption("Table", a.caption); table(a.head, a.rows); }
    }
  } else if (d.appendices?.length) { finish(); text("APPENDICES", { size: 20, bold: true, color: NAVY, after: 8 }); for (let i = 0; i < d.appendices.length; i++) text(`Appendix ${String.fromCharCode(65 + i)}: ${d.appendices[i]!.title}`, { size: 13, after: 3 }); text("The appendices are included in the full report after you pay.", { size: 12, color: "#555" }); }
  finish();
  d.pageMap = pm;
  return pdfOf(pages, Math.round(PW * SCALE), Math.round(PH * SCALE));
}

/** Pictures into a PDF (A4), one picture per page. */
function pdfOf(jpegs: Buffer[], pw: number, ph: number): Buffer {
  const parts: Buffer[] = []; const offs: number[] = []; let len = 0;
  const put = (b: Buffer | string) => { const x = typeof b === "string" ? Buffer.from(b, "latin1") : b; parts.push(x); len += x.length; };
  const obj = (id: number, body: Buffer | string) => { offs[id] = len; put(`${id} 0 obj\n`); put(body); put("\nendobj\n"); };
  put("%PDF-1.4\n"); const N = jpegs.length; const kids: string[] = [];
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  jpegs.forEach((_, i) => kids.push(`${3 + i * 3} 0 R`));
  obj(2, `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${N} >>`);
  jpegs.forEach((j, i) => {
    const p = 3 + i * 3, im = p + 1, ct = p + 2;
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /I${i} ${im} 0 R >> >> /Contents ${ct} 0 R >>`);
    offs[im] = len; put(`${im} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pw} /Height ${ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.length} >>\nstream\n`); put(j); put("\nendstream\nendobj\n");
    const c = `q 595.28 0 0 841.89 0 0 cm /I${i} Do Q`; obj(ct, `<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
  });
  const xr = len; put(`xref\n0 ${3 + N * 3}\n0000000000 65535 f \n`);
  for (let i = 1; i < 3 + N * 3; i++) put(`${String(offs[i]).padStart(10, "0")} 00000 n \n`);
  put(`trailer\n<< /Size ${3 + N * 3} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`);
  return Buffer.concat(parts);
}
void (null as unknown as SKRSContext2D);
