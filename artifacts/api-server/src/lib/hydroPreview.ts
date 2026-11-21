import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import type { DocInput } from "./hydroDocx";

/**
 * The watermarked preview: every page is drawn as a PICTURE (not text) with the company name tiled across it,
 * then the pictures are put into a PDF. It cannot be converted to an editable Word file, and the watermark is part of the page.
 */
const PW = 794, PH = 1123, MX = 76, MT = 90, MB = 80; // A4 at 96 dpi
const SERIF = '"Times New Roman", "Liberation Serif", "DejaVu Serif", serif';
const NAVY = "#0B2A4A";

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
      g.fillStyle = NAVY; font(11); g.textAlign = "right"; g.fillText(d.title, PW - MX, 52); g.strokeStyle = NAVY; g.lineWidth = 0.8; g.beginPath(); g.moveTo(MX, 58); g.lineTo(PW - MX, 58); g.stroke();
      g.fillStyle = "#222"; font(11); g.textAlign = "center"; g.fillText(`${d.footerText}  |  Page ${n}`, PW / 2, PH - 44);
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
    text(`${s.num ? s.num + "  " : ""}${s.title}`, { size, bold: true, color: NAVY, after: 4 });
  };
  const picture = async (buf: Buffer, w: number, h: number, maxH = 400, maxW = CW) => {
    try {
      const im = await loadImage(buf); const k = Math.min(maxW / (w || im.width), maxH / (h || im.height), 1.5); const iw = (w || im.width) * k, ih = (h || im.height) * k;
      room(ih + 10); g.drawImage(im, (PW - iw) / 2, y, iw, ih); y += ih + 8;
    } catch { /* a picture that cannot be read is skipped */ }
  };
  let fig = 0, tab = 0;
  const caption = (label: string, t: string) => { text(`${label} ${label === "Figure" ? ++fig : ++tab}: ${t}`, { size: 12, bold: true, align: "center", after: 10 }); };
  const table = (head: string[], rows: string[][]) => {
    const cols = Math.max(1, head.length); const wts = head.map((h, i) => Math.max(6, h.length, ...rows.map((r) => (r[i] ?? "").length > 40 ? 40 : (r[i] ?? "").length)));
    const sum = wts.reduce((a, b) => a + b, 0); const ws = wts.map((x) => (x / sum) * CW);
    const row = (cells: string[], hd: boolean) => {
      font(11.5, hd); const lines = cells.map((c, i) => wrap(c ?? "", ws[i]! - 10)); const h = Math.max(...lines.map((l) => l.length), 1) * 16 + 8;
      room(h); let x = MX;
      for (let i = 0; i < cols; i++) {
        g.fillStyle = hd ? NAVY : "#fff"; g.fillRect(x, y, ws[i]!, h); g.strokeStyle = "#7a8794"; g.lineWidth = 0.8; g.strokeRect(x, y, ws[i]!, h);
        g.fillStyle = hd ? "#fff" : "#111"; font(11.5, hd); g.textAlign = "left"; lines[i]!.forEach((l, j) => g.fillText(l, x + 5, y + 16 + j * 16)); x += ws[i]!;
      }
      y += h;
    };
    row(head, true); for (const r of rows) row(r, false); y += 12;
  };

  // cover
  y = 150; text(d.title, { size: 28, bold: true, align: "center", color: NAVY, after: 8, lh: 38 }); text(d.subtitle, { size: 19, bold: true, align: "center", after: 30 });
  for (const [k, v] of d.cover.filter(([, v]) => v)) { room(30); text(`${k}:  ${v}`, { size: 14, after: 4 }); }
  y += 20; text(`${d.reference ? `Report Reference: ${d.reference}   |   ` : ""}Report Date: ${d.date}`, { size: 13, bold: true, align: "center" });
  if (mark) text("PREVIEW COPY. Pay to receive the full report as an editable Word document.", { size: 12, align: "center", color: "#a11" });
  finish();
  // contents list
  text("TABLE OF CONTENTS", { size: 20, bold: true, color: NAVY, after: 10 });
  for (const s of d.secs) text(`${s.num ? s.num + "  " : ""}${s.title}`, { size: s.level === 1 ? 13 : 12, bold: s.level === 1, indent: (s.level - 1) * 18, after: 1, lh: 18 });
  finish();
  text("GLOSSARY AND ABBREVIATIONS", { size: 20, bold: true, color: NAVY, after: 10 }); table(["Term", "Meaning"], d.abbreviations.map(([a, b]) => [a, b])); finish();
  const extras = async (id: string) => {
    for (const t of d.tables.filter((x) => x.after === id)) { caption("Table", t.caption); table(t.head, t.rows); }
    for (const f of d.figures.filter((x) => x.after === id)) { await picture(f.buf, f.w, f.h, /geoelectric section at station/i.test(f.caption) ? 420 : 340); caption("Figure", f.caption); }
  };
  for (const s of d.secs) {
    heading(s);
    if (d.flow?.[s.id]) {
      for (const f of d.flow[s.id]!) {
        if ("p" in f) text(f.p, { indent: 0, after: 7 });
        else if ("table" in f) { caption("Table", f.table.caption); table(f.table.head, f.table.rows); }
        else for (const b of f.bullets) text(`•  ${b}`, { indent: 14, after: 3 });
      }
    } else for (const p of d.text[s.id] ?? []) text(p, { after: 7 });
    await extras(s.id);
  }
  heading({ title: "REFERENCES", num: "9.0", level: 1 }); d.references.forEach((r, i) => text(`${i + 1}.  ${r}`, { size: 12.5, after: 3, indent: 12 }));
  if (!mark) {
    for (let i = 0; i < (d.appendices ?? []).length; i++) {
      const a = d.appendices![i]!; finish();
      heading({ title: `Appendix ${String.fromCharCode(65 + i)}: ${a.title}`, level: 1 });
      if (a.intro) text(a.intro, { after: 7 });
      if (a.figure) { await picture(a.figure.buf, a.figure.w, a.figure.h, 420); caption("Figure", a.caption); }
      else if (a.blocks) for (const b of a.blocks) { heading({ title: b.h, level: 2 }); for (const t of b.p) text(t, { after: 7 }); }
      else if (a.plates) { let k = 0; for (const pl of a.plates) { await picture(pl.buf, pl.w, pl.h, 300, 460); text(`Plate ${++k}: ${pl.caption}`, { size: 12, bold: true, align: "center", after: 10 }); } }
      else { caption("Table", a.caption); table(a.head, a.rows); }
    }
  } else if (d.appendices?.length) { finish(); text("APPENDICES", { size: 20, bold: true, color: NAVY, after: 8 }); for (let i = 0; i < d.appendices.length; i++) text(`Appendix ${String.fromCharCode(65 + i)}: ${d.appendices[i]!.title}`, { size: 13, after: 3 }); text("The appendices are included in the full report after you pay.", { size: 12, color: "#555" }); }
  finish();
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
