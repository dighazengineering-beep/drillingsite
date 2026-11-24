import { stampSvg, stampDate } from "./companyStamp";
import { photoCard, sideCard, type NoteExtra } from "./hydroFigures";
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, LineRuleType, Packer, PageBreak, PageNumber, Paragraph,
  SequentialIdentifier, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType, ShadingType, type FileChild,
} from "docx";
import type { Sec } from "./hydroWrite";

const FONT = "Times New Roman";
const BODY = 24; // 12 pt
const LINE = { line: 360, lineRule: LineRuleType.AUTO, after: 120 }; // 1.5 spacing

import type { Flow } from "./hydroWrite";
export interface DocFigure { buf: Buffer; w: number; h: number; caption: string; after: string /** section id it follows */; notes?: { heading: string; lines: string[]; extra?: NoteExtra } }
export interface DocTable { caption: string; head: string[]; rows: string[][]; after: string }
export interface DocAppendix { title: string; intro?: string; caption: string; head: string[]; rows: string[][]; figure?: { buf: Buffer; w: number; h: number }; blocks?: { h: string; p: string[] }[]; plates?: { buf: Buffer; w: number; h: number; caption: string; notes?: { heading: string; lines: string[]; extra?: NoteExtra } }[] }
export interface DocInput {
  appendices?: DocAppendix[];
  title: string; subtitle: string; reference?: string;
  cover: [string, string][];
  company: string; logo?: Buffer; footerText: string;
  secs: Sec[]; text: Record<string, string[]>; flow?: Record<string, Flow[]>;
  figures: DocFigure[]; tables: DocTable[];
  abbreviations: [string, string][];
  references: string[]; onlineRefs: string[];
  signature: { name: string; title: string; stamp?: Buffer; sign?: Buffer };
  date: string;
}

const run = (t: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) => new TextRun({ text: t, font: FONT, size: o.size ?? BODY, bold: o.bold, color: o.color, italics: o.italics });
const para = (t: string, o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean; size?: number; space?: number } = {}) =>
  new Paragraph({ alignment: o.align ?? AlignmentType.JUSTIFIED, spacing: { ...LINE, after: o.space ?? 120 }, children: [run(t, { bold: o.bold, size: o.size })] });
/** A picture sized to fit a box (never taller than about half a page), keeping its shape. */
const fit = (w: number, h: number, maxW = 560, maxH = 330) => { const k = Math.min(maxW / w, maxH / h, 1.5); return { width: Math.round(w * k), height: Math.round(h * k) }; };
const imgType = (b: Buffer): "jpg" | "png" => (b[0] === 0xff && b[1] === 0xd8 ? "jpg" : "png");
const head = (s: Sec) => new Paragraph({
  heading: s.level === 1 ? HeadingLevel.HEADING_1 : s.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
  spacing: { before: s.level === 1 ? 480 : 240, after: 120 }, keepNext: true,
  children: [run(`${s.num ? s.num + "  " : ""}${s.title}`, { bold: true, size: s.level === 1 ? 30 : s.level === 2 ? 26 : 24, color: "0B2A4A" })],
});
const caption = (label: "Figure" | "Table", text: string, above: boolean) => new Paragraph({
  style: "Caption", alignment: AlignmentType.CENTER, keepNext: above, spacing: { before: above ? 200 : 60, after: above ? 80 : 240 },
  children: [run(`${label} `, { bold: true, size: 22 }), new SequentialIdentifier(label), run(`: ${text}`, { size: 22, bold: true })],
});
const border = { style: BorderStyle.SINGLE, size: 4, color: "7a8794" };
const cell = (t: string, o: { head?: boolean; w?: number } = {}) => new TableCell({
  width: o.w ? { size: o.w, type: WidthType.PERCENTAGE } : undefined,
  shading: o.head ? { type: ShadingType.CLEAR, fill: "0B2A4A", color: "auto" } : undefined,
  margins: { top: 60, bottom: 60, left: 100, right: 100 },
  borders: { top: border, bottom: border, left: border, right: border },
  children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [run(t, { size: 21, bold: o.head, color: o.head ? "FFFFFF" : undefined })] })],
});
const table = (headRow: string[], rows: string[][]) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [new TableRow({ tableHeader: true, children: headRow.map((h) => cell(h, { head: true })) }), ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c) => cell(c)) }))],
});

export async function buildDocx(d: DocInput, onPrepared?: (prepared: DocInput) => Promise<void>): Promise<Buffer> {
  // every picture, chart, map and plate gets the same look as the receipts in the contract: a sheet with a shadow on a blurred copy of itself
  const card = async <T extends { buf: Buffer; w: number; h: number; notes?: { heading: string; lines: string[]; extra?: NoteExtra } }>(x: T): Promise<T> => {
    try {
      const c = x.notes && x.h > x.w * 1.1 ? await sideCard(x.buf, x.w, x.h, x.notes.heading, x.notes.lines, x.notes.extra) : await photoCard(x.buf, x.w, x.h);
      return { ...x, buf: c.buf, w: c.w, h: c.h };
    } catch { return x; }
  };
  d = { ...d, figures: await Promise.all(d.figures.map(card)), appendices: await Promise.all((d.appendices ?? []).map(async (a) => ({ ...a, figure: a.figure ? await card(a.figure) : undefined, plates: a.plates ? await Promise.all(a.plates.map(card)) : undefined }))) };
  if (onPrepared) { try { await onPrepared(d); } catch (e) { console.error("[report] preview failed", e); } }
  const kids: FileChild[] = [];
  // cover
  kids.push(new Paragraph({ spacing: { before: 600 }, children: [] }));
  kids.push(para(d.title, { align: AlignmentType.CENTER, bold: true, size: 40, space: 200 }));
  kids.push(para(d.subtitle, { align: AlignmentType.CENTER, bold: true, size: 30, space: 500 }));
  kids.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: d.cover.filter(([, v]) => v).map(([k, v]) => new TableRow({ children: [cell(k, { w: 32 }), cell(v, { w: 68 })] })),
  }));
  kids.push(para("", { space: 200 }));
  // the geologist's stamp: only the one uploaded for this report (the company has no default stamp)
  if (d.signature.stamp) kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "png", data: d.signature.stamp, transformation: { width: 150, height: 150 } })] }));
  kids.push(para(`${d.reference ? `Report Reference: ${d.reference}   |   ` : ""}Report Date: ${d.date}`, { align: AlignmentType.CENTER, bold: true, space: 120 }));
  kids.push(para("This report is prepared for the exclusive use of the client and project stakeholders named herein.", { align: AlignmentType.CENTER, size: 20 }));
  // the company's own stamp, just below this line on the same page, dated with the report date
  try {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const dt = new Date(d.date); const sd = stampDate(isNaN(dt.getTime()) ? new Date() : dt);
    const img = await loadImage(Buffer.from(stampSvg(sd)));
    const cv = createCanvas(1440, 680); cv.getContext("2d").drawImage(img, 0, 0, 1440, 680);
    kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240 }, children: [new ImageRun({ type: "png", data: cv.toBuffer("image/png"), transformation: { width: 190, height: 90 } })] }));
  } catch { /* the report is still written without the stamp */ }
  kids.push(new Paragraph({ children: [new PageBreak()] }));
  const label = (t: string) => new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 200 }, children: [run(t, { bold: true, size: 30, color: "0B2A4A" })] });
  kids.push(label("TABLE OF CONTENTS"));
  kids.push(new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }));
  kids.push(new Paragraph({ children: [new PageBreak()] }));
  kids.push(label("LIST OF FIGURES"));
  kids.push(new TableOfContents("List of Figures", { hyperlink: true, captionLabelIncludingNumbers: "Figure" }));
  kids.push(new Paragraph({ children: [new PageBreak()] }));
  kids.push(label("LIST OF TABLES"));
  kids.push(new TableOfContents("List of Tables", { hyperlink: true, captionLabelIncludingNumbers: "Table" }));
  kids.push(new Paragraph({ children: [new PageBreak()] }));
  kids.push(label("GLOSSARY AND ABBREVIATIONS"));
  kids.push(table(["Term", "Meaning"], d.abbreviations.map(([a, b]) => [a, b])));
  kids.push(new Paragraph({ children: [new PageBreak()] }));

  const addExtras = (id: string) => {
    for (const t of d.tables.filter((x) => x.after === id)) { kids.push(caption("Table", t.caption, true), table(t.head, t.rows), para("", { space: 120 })); }
    for (const f of d.figures.filter((x) => x.after === id)) {
      kids.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160 }, children: [new ImageRun({ type: imgType(f.buf), data: f.buf, transformation: fit(f.w, f.h, 560, /geoelectric section at station/i.test(f.caption) ? 400 : 330) })] }), caption("Figure", f.caption, false));
    }
  };
  for (const s of d.secs) {
    kids.push(head(s));
    if (d.flow?.[s.id]) {
      for (const f of d.flow[s.id]!) {
        if ("p" in f) kids.push(para(f.p));
        else if ("table" in f) kids.push(caption("Table", f.table.caption, true), table(f.table.head, f.table.rows), para("", { space: 120 }));
        else for (const b of f.bullets) kids.push(new Paragraph({ bullet: { level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { ...LINE, after: 80 }, children: [run(b)] }));
      }
    } else for (const p of d.text[s.id] ?? []) kids.push(para(p));
    addExtras(s.id);
  }
  // references
  kids.push(head({ id: "9", num: "9.0", title: "REFERENCES", level: 1 }));
  d.references.forEach((r, i) => kids.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { ...LINE, after: 100 }, indent: { left: 540, hanging: 540 }, children: [run(`${i + 1}.  ${r}`)] })));
  if (d.onlineRefs.length) {
    kids.push(para("Online sources consulted during preparation of this report:", { bold: true, align: AlignmentType.LEFT }));
    d.onlineRefs.forEach((r) => kids.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { ...LINE, after: 80 }, indent: { left: 540, hanging: 540 }, children: [run(`•  ${r}`, { size: 22 })] })));
  }
  // appendices
  (d.appendices ?? []).forEach((a, i) => {
    kids.push(head({ id: `app${i}`, num: "", title: `Appendix ${String.fromCharCode(65 + i)}: ${a.title}`, level: 1 }));
    if (a.intro) kids.push(para(a.intro));
    if (a.figure) {
      kids.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160 }, children: [new ImageRun({ type: imgType(a.figure.buf), data: a.figure.buf, transformation: fit(a.figure.w, a.figure.h) })] }), caption("Figure", a.caption, false));
    } else if (a.blocks) {
      for (const b of a.blocks) { kids.push(head({ id: "b", num: "", title: b.h, level: 2 })); for (const t of b.p) kids.push(para(t)); }
    } else if (a.plates) {
      a.plates.forEach((pl, n) => {
        kids.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160 }, children: [new ImageRun({ type: imgType(pl.buf), data: pl.buf, transformation: fit(pl.w, pl.h, 460, 300) })] }));
        kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 200 }, children: [run(`Plate ${n + 1}: ${pl.caption}`, { size: 22, bold: true })] }));
      });
    } else kids.push(caption("Table", a.caption, true), table(a.head, a.rows));
  });
  const doc = new Document({
    features: { updateFields: true },
    creator: d.company, title: d.title,
    styles: {
      default: { document: { run: { font: FONT, size: BODY } } },
      paragraphStyles: [{ id: "Caption", name: "Caption", basedOn: "Normal", run: { font: FONT, size: 22, bold: true } }],
    },
    sections: [{
      properties: { page: { margin: { top: 1440, bottom: 1300, left: 1440, right: 1300 } }, titlePage: true },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "0B2A4A", space: 4 } }, children: [run(d.title, { size: 18, color: "0B2A4A" })] })] }), first: new Header({ children: [] }) },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`${d.footerText}  |  Page `, { size: 18 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18 })] })] }),
        first: new Footer({ children: [] }),
      },
      children: kids,
    }],
  });
  return Packer.toBuffer(doc);
}
