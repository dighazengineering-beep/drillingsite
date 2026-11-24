import { stampSvg, stampDate } from "./companyStamp";
import { photoCard, sideCard, type NoteExtra } from "./hydroFigures";
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, LineRuleType, Packer, PageBreak, PageNumber, Paragraph,
  SequentialIdentifier, Bookmark, InternalHyperlink, SimpleField, Tab, LeaderType, TabStopType, VerticalAlign, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType, ShadingType, type FileChild,
} from "docx";
import type { Sec } from "./hydroWrite";

const FONT = "Calibri";
const HFONT = "Cambria";
const BODY = 22; // 11 pt
const LINE = { line: 330, lineRule: LineRuleType.AUTO, after: 120 };
// the company colours (the blue and green of the logo), used through real Word styles so the theme can be changed in Word itself
const BLUE = "0B3A8C", GREEN = "2E8B3D", PALE = "EAF0FA", ZEBRA = "F5F8FD", LINEC = "C5D1E3", GREY = "5B6573";

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
  /** page of each heading (h1, h2…), figure (f1…) and table (t1…), worked out while the preview is drawn; the Word file shows these until Word recounts */
  pageMap?: Record<string, number>;
}

const run = (t: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) => new TextRun({ text: t, font: FONT, size: o.size ?? BODY, bold: o.bold, color: o.color, italics: o.italics });
const para = (t: string, o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean; size?: number; space?: number } = {}) =>
  new Paragraph({ alignment: o.align ?? AlignmentType.JUSTIFIED, spacing: { ...LINE, after: o.space ?? 120 }, children: [run(t, { bold: o.bold, size: o.size })] });
/** A picture sized to fit a box (never taller than about half a page), keeping its shape. */
const fit = (w: number, h: number, maxW = 560, maxH = 330) => { const k = Math.min(maxW / w, maxH / h, 1.5); return { width: Math.round(w * k), height: Math.round(h * k) }; };
const imgType = (b: Buffer): "jpg" | "png" => (b[0] === 0xff && b[1] === 0xd8 ? "jpg" : "png");
const border = { style: BorderStyle.SINGLE, size: 4, color: LINEC };
const cell = (t: string, o: { head?: boolean; w?: number; zebra?: boolean; first?: boolean } = {}) => new TableCell({
  width: o.w ? { size: o.w, type: WidthType.PERCENTAGE } : undefined,
  verticalAlign: VerticalAlign.CENTER,
  shading: o.head ? { type: ShadingType.CLEAR, fill: BLUE, color: "auto" } : o.first ? { type: ShadingType.CLEAR, fill: PALE, color: "auto" } : o.zebra ? { type: ShadingType.CLEAR, fill: ZEBRA, color: "auto" } : undefined,
  margins: { top: 70, bottom: 70, left: 110, right: 110 },
  borders: { top: border, bottom: border, left: border, right: border },
  children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [run(t, { size: 20, bold: o.head || o.first, color: o.head ? "FFFFFF" : o.first ? BLUE : undefined })] })],
});
const table = (headRow: string[], rows: string[][]) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [new TableRow({ tableHeader: true, cantSplit: true, children: headRow.map((h) => cell(h, { head: true })) }), ...rows.map((r, i) => new TableRow({ cantSplit: true, children: r.map((c) => cell(c, { zebra: i % 2 === 1 })) }))],
});

/** After which paragraph each of k pictures goes, out of m paragraphs: spread evenly, never before the first paragraph. */
export function spread(k: number, m: number): number[] {
  const out: number[] = []; let prev = 0;
  for (let j = 0; j < k; j++) { let t = Math.max(1, Math.round(((j + 1) * m) / (k + 1))); if (t <= prev && prev < m) t = prev + 1; out.push(t); prev = t; }
  return out;
}

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
  // cover: logo, a coloured title band, the details table, the reference line, the company stamp
  if (d.logo) {
    try {
      const { loadImage } = await import("@napi-rs/canvas"); const im = await loadImage(d.logo); const h = 70; 
      kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 }, children: [new ImageRun({ type: imgType(d.logo), data: d.logo, transformation: { width: Math.round((im.width / im.height) * h), height: h } })] }));
    } catch { /* no logo */ }
  }
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: d.company.toUpperCase(), font: HFONT, bold: true, size: 26, color: BLUE, characterSpacing: 60 })] }));
  const bandB = { style: BorderStyle.SINGLE, size: 36, color: GREEN };
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  kids.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.CLEAR, fill: BLUE, color: "auto" }, margins: { top: 420, bottom: 380, left: 300, right: 300 },
      borders: { top: none, left: none, right: none, bottom: bandB },
      children: [
        new Paragraph({ style: "Title", alignment: AlignmentType.CENTER, children: [new TextRun({ text: d.title })] }),
        new Paragraph({ style: "Subtitle", alignment: AlignmentType.CENTER, children: [new TextRun({ text: d.subtitle })] }),
      ],
    })] })],
  }));
  kids.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
  kids.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: d.cover.filter(([, v]) => v).map(([k, v]) => new TableRow({ cantSplit: true, children: [cell(k, { w: 32, first: true }), cell(v, { w: 68 })] })),
  }));
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 280, after: 80 }, children: [new TextRun({ text: `${d.reference ? `Report Reference: ${d.reference}   |   ` : ""}Report Date: ${d.date}`, bold: true, font: HFONT, size: 24, color: BLUE })] }));
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "This report is prepared for the exclusive use of the client and project stakeholders named herein.", italics: true, size: 19, color: GREY })] }));
  // the geologist's own stamp, only when one was uploaded for this report
  if (d.signature.stamp) kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "png", data: d.signature.stamp, transformation: { width: 120, height: 120 } })] }));
  // the company's own stamp, on the same page, dated with the report date
  try {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const dt = new Date(d.date); const sd = stampDate(isNaN(dt.getTime()) ? new Date() : dt);
    const img = await loadImage(Buffer.from(stampSvg(sd)));
    const cv = createCanvas(1440, 680); cv.getContext("2d").drawImage(img, 0, 0, 1440, 680);
    kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new ImageRun({ type: "png", data: cv.toBuffer("image/png"), transformation: { width: 190, height: 90 } })] }));
  } catch { /* the report is still written without the stamp */ }
  kids.push(new Paragraph({ children: [new PageBreak()] }));
  // headings and captions carry bookmarks, so the contents and the lists of figures and tables are written out in full (with page numbers) and need no updating in Word
  type Ent = { text: string; id: string; key: string; lvl: number };
  const toc: Ent[] = [], figL: Ent[] = [], tabL: Ent[] = [];
  let hN = 0, fN = 0, tN = 0;
  const H = (s: Sec, newPage = false) => {
    const n = ++hN, id = `_Toc${n}`, text = `${s.num ? s.num + "  " : ""}${s.title}`; toc.push({ text, id, key: `h${n}`, lvl: s.level });
    return new Paragraph({
      heading: s.level === 1 ? HeadingLevel.HEADING_1 : s.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, pageBreakBefore: newPage,
      children: [new Bookmark({ id, children: [new TextRun({ text })] })],
    });
  };
  const C = (label: "Figure" | "Table", text: string, above: boolean) => {
    const fig = label === "Figure", n = fig ? ++fN : ++tN, id = `_Cap${fig ? "F" : "T"}${n}`;
    (fig ? figL : tabL).push({ text: `${label} ${n}: ${text}`, id, key: `${fig ? "f" : "t"}${n}`, lvl: 0 });
    return new Paragraph({
      style: "Caption", alignment: AlignmentType.CENTER, keepNext: above, spacing: { before: above ? 200 : 60, after: above ? 80 : 240 },
      children: [new Bookmark({ id, children: [new TextRun({ text: `${label} ` }), new SimpleField(`SEQ ${label} \\* ARABIC`, String(n)), new TextRun({ text: `: ${text}` })] })],
    });
  };
  const body: FileChild[] = [];
  /** the tables and figures that belong to a section: alternated, each as a block that is made only when it is placed (so the numbers follow the page order) */
  const extraThunks = (id: string): (() => FileChild[])[] => {
    const ts = d.tables.filter((x) => x.after === id).map((t) => () => [C("Table", t.caption, true), table(t.head, t.rows), para("", { space: 120 })] as FileChild[]);
    const fs = d.figures.filter((x) => x.after === id).map((f) => () => [
new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160 }, children: [new ImageRun({ type: imgType(f.buf), data: f.buf, transformation: fit(f.w, f.h, 560, /geoelectric section at station/i.test(f.caption) ? 400 : 330) })] }),
      C("Figure", f.caption, false),
    ] as FileChild[]);
    const out: (() => FileChild[])[] = []; for (let i = 0; i < Math.max(ts.length, fs.length); i++) { if (fs[i]) out.push(fs[i]!); if (ts[i]) out.push(ts[i]!); }
    return out;
  };
  for (const s of d.secs) {
    body.push(H(s));
    const items: { isP: boolean; make: () => FileChild[] }[] = [];
    if (d.flow?.[s.id]) {
      for (const f of d.flow[s.id]!) {
        if ("p" in f) items.push({ isP: true, make: () => [para(f.p)] });
        else if ("table" in f) items.push({ isP: false, make: () => [C("Table", f.table.caption, true), table(f.table.head, f.table.rows), para("", { space: 120 })] });
        else items.push({ isP: false, make: () => f.bullets.map((b) => new Paragraph({ bullet: { level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { ...LINE, after: 80 }, children: [run(b)] })) });
      }
    } else for (const p of d.text[s.id] ?? []) items.push({ isP: true, make: () => [para(p)] });
    // the pictures, charts and tables are placed between the paragraphs, spread through the section, never piled up at its end
    const ex = extraThunks(s.id), at = spread(ex.length, items.filter((x) => x.isP).length);
    let pc = 0, ei = 0; const seq: (() => FileChild[])[] = [];
    for (const it of items) { seq.push(it.make); if (it.isP) { pc++; while (ei < ex.length && at[ei]! <= pc) seq.push(ex[ei++]!); } }
    while (ei < ex.length) seq.push(ex[ei++]!);
    for (const t of seq) body.push(...t());
  }
  // references
  body.push(H({ id: "9", num: "9.0", title: "REFERENCES", level: 1 }, true));
  d.references.forEach((r, i) => body.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { ...LINE, after: 100 }, indent: { left: 540, hanging: 540 }, children: [run(`${i + 1}.  ${r}`)] })));
  if (d.onlineRefs.length) {
    body.push(para("Online sources consulted during preparation of this report:", { bold: true, align: AlignmentType.LEFT }));
    d.onlineRefs.forEach((r) => body.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { ...LINE, after: 80 }, indent: { left: 540, hanging: 540 }, children: [run(`•  ${r}`, { size: 22 })] })));
  }
  // appendices
  (d.appendices ?? []).forEach((a, i) => {
    body.push(H({ id: `app${i}`, num: "", title: `Appendix ${String.fromCharCode(65 + i)}: ${a.title}`, level: 1 }, i === 0));
    if (a.intro) body.push(para(a.intro));
    if (a.figure) {
      body.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160 }, children: [new ImageRun({ type: imgType(a.figure.buf), data: a.figure.buf, transformation: fit(a.figure.w, a.figure.h) })] }), C("Figure", a.caption, false));
    } else if (a.blocks) {
      for (const b of a.blocks) { body.push(H({ id: "b", num: "", title: b.h, level: 2 })); for (const t of b.p) body.push(para(t)); }
    } else if (a.plates) {
      a.plates.forEach((pl, n) => {
        body.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160 }, children: [new ImageRun({ type: imgType(pl.buf), data: pl.buf, transformation: fit(pl.w, pl.h, 460, 300) })] }));
        body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 200 }, children: [run(`Plate ${n + 1}: ${pl.caption}`, { size: 22, bold: true })] }));
      });
    } else body.push(C("Table", a.caption, true), table(a.head, a.rows));
  });
  const pg = (key: string) => { const v = d.pageMap?.[key]; return v ? String(v + 1) : ""; };
  const entry = (e: Ent) => new Paragraph({
    style: e.lvl === 0 ? "TOC1" : `TOC${e.lvl}`, tabStops: [{ type: TabStopType.RIGHT, position: 9500, leader: LeaderType.DOT }],
    children: [new InternalHyperlink({ anchor: e.id, children: [new TextRun({ text: e.text })] }), new TextRun({ children: [new Tab()] }), new SimpleField(`PAGEREF ${e.id} \\h`, pg(e.key))],
  });
  const label = (t: string) => new Paragraph({ style: "FrontHead", children: [new TextRun({ text: t })] });
  const brk = () => new Paragraph({ children: [new PageBreak()] });
  kids.push(label("TABLE OF CONTENTS"), ...toc.map(entry), brk());
  kids.push(label("LIST OF FIGURES"), ...(figL.length ? figL.map(entry) : [para("No figures.", { align: AlignmentType.LEFT })]), brk());
  kids.push(label("LIST OF TABLES"), ...(tabL.length ? tabL.map(entry) : [para("No tables.", { align: AlignmentType.LEFT })]), brk());
  kids.push(label("GLOSSARY AND ABBREVIATIONS"), table(["Term", "Meaning"], d.abbreviations.map(([a, b]) => [a, b])), brk());
  kids.push(...body);
  const doc = new Document({
    features: { updateFields: true },
    creator: d.company, title: d.title,
    styles: {
      default: { document: { run: { font: FONT, size: BODY, color: "1F2933" } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: HFONT, size: 56, bold: true, color: "FFFFFF" }, paragraph: { spacing: { before: 0, after: 160 }, alignment: AlignmentType.CENTER } },
        { id: "Subtitle", name: "Subtitle", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: HFONT, size: 30, color: "DCE8FA" }, paragraph: { spacing: { before: 0, after: 0 }, alignment: AlignmentType.CENTER } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: HFONT, size: 32, bold: true, color: BLUE }, paragraph: { keepNext: true, keepLines: true, spacing: { before: 440, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: GREEN, space: 4 } }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: HFONT, size: 26, bold: true, color: "1F5FBF" }, paragraph: { keepNext: true, keepLines: true, spacing: { before: 260, after: 100 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: HFONT, size: 23, bold: true, italics: true, color: GREEN }, paragraph: { keepNext: true, keepLines: true, spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
        { id: "FrontHead", name: "Front Heading", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: HFONT, size: 32, bold: true, color: BLUE }, paragraph: { keepNext: true, spacing: { before: 0, after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: GREEN, space: 4 } } } },
        { id: "TOC1", name: "toc 1", basedOn: "Normal", next: "Normal", run: { bold: true }, paragraph: { spacing: { before: 120, after: 40 } } },
        { id: "TOC2", name: "toc 2", basedOn: "Normal", next: "Normal", paragraph: { indent: { left: 240 }, spacing: { after: 20 } } },
        { id: "TOC3", name: "toc 3", basedOn: "Normal", next: "Normal", run: { size: 20 }, paragraph: { indent: { left: 480 }, spacing: { after: 20 } } },
        { id: "Caption", name: "Caption", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 20, bold: true, italics: true, color: BLUE } },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 1440, bottom: 1300, left: 1440, right: 1300 } }, titlePage: true },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: GREEN, space: 4 } }, children: [new TextRun({ text: d.company.toUpperCase(), font: HFONT, bold: true, size: 17, color: BLUE, characterSpacing: 30 }), new TextRun({ text: `   |   ${d.title}`, size: 17, color: GREY })] })] }), first: new Header({ children: [] }) },
      footers: {
        default: new Footer({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: 9500 }], border: { top: { style: BorderStyle.SINGLE, size: 6, color: LINEC, space: 4 } }, children: [new TextRun({ text: d.footerText, size: 17, color: GREY }), new TextRun({ text: "\tPage ", size: 17, color: BLUE, bold: true }), new TextRun({ children: [PageNumber.CURRENT], size: 17, color: BLUE, bold: true }), new TextRun({ text: " of ", size: 17, color: BLUE, bold: true }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 17, color: BLUE, bold: true })] })] }),
        first: new Footer({ children: [] }),
      },
      children: kids,
    }],
  });
  return Packer.toBuffer(doc);
}
