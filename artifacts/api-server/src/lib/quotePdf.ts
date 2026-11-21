import { stampDate } from "./companyStamp";
import { SimplePdf, rgb, wrapText, textWidth, PAGE_W } from "./pdf";
import { type BuiltLine } from "./quoteLines";
import { type CompanyInfo } from "./company";

export interface PdfQuote {
  id: number; name: string; phone: string; item: string; size?: string; casing: string; depth: number; rate: number; total: number;
  agreedTotal?: number | null; note: string; validDays: number; createdAt: Date | string;
  lines: BuiltLine[] | null; footer: string; nextStep: string;
  payUrl?: string; // where the small Pay button leads; no button when empty
}

const money = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.00`;
const kes = (n: number) => `KSh ${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

const navy = rgb("0b1d3a"), blue = rgb("0a4fb3"), amber = rgb("f59e0b"), white = rgb("ffffff"), ink = rgb("0f172a"), grey = rgb("64748b"), rule = rgb("cbd5e1"), soft = rgb("f1f5f9"), tint = rgb("fef3c7"), zebra = rgb("f8fafc"), section = rgb("dbe7fb"), light = rgb("cbd5e1");
const L = 40, R = PAGE_W - 40;
// table columns: left edge of each, and the right edge of the number columns
const COL = { sn: 40, desc: 68, unit: 338, qty: 374, rate: 420, amt: 484 };
const BOTTOM = 70; // nothing is drawn below this line except the page footer

/** The contact lines shown for a company: only the ones that are set. */
export function contactLines(co: CompanyInfo): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (co.phone) out.push({ label: "Call", value: co.phone });
  if (co.whatsapp) out.push({ label: "WhatsApp", value: `+${co.whatsapp}` });
  if (co.email) out.push({ label: "Email", value: co.email });
  if (co.website) out.push({ label: "Web", value: co.website.replace(/^https?:\/\//, "").replace(/\/$/, "") });
  return out;
}

/** The quotation as a real PDF. Quotes with line items get a full table (any length: the header row repeats on every page and the total stays at the end). */
export function buildQuotePdf(q: PdfQuote, co: CompanyInfo): Buffer {
  const company = co.name;
  const no = `QT-${String(q.id).padStart(5, "0")}`;
  const made = new Date(q.createdAt), until = new Date(made.getTime() + q.validDays * 86_400_000);
  const day = (x: Date) => x.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "long" });
  const pdf = new SimplePdf();
  const contacts = contactLines(co);

  /* ---- first page: header band with the logo, name and contact details */
  pdf.rect(0, 722, PAGE_W, 120, navy).rect(0, 716, PAGE_W, 6, amber);
  pdf.logo(L, 762, 56);
  const nameSize = textWidth(company, 22, true) > 230 ? 16 : 22;
  pdf.text(company, L + 70, 796, nameSize, white, true).text("QUOTATION", L + 70, 776, 10.5, amber, true);
  contacts.forEach((c, i) => {
    const y = 818 - i * 14 - (4 - contacts.length) * 3;
    pdf.textRight(c.value, R, y, 9.5, white, true).textRight(`${c.label}:`, R - textWidth(c.value, 9.5, true) - 5, y, 9, light);
  });

  /* ---- who it is for, and the quote details */
  const top = 696, bh = 62, split = L + 262;
  pdf.rect(L, top - bh, split - L - 8, bh, soft).rect(L, top - bh, 3, bh, amber);
  pdf.text("PREPARED FOR", L + 14, top - 16, 8, grey, true);
  wrapText(q.name || "-", split - L - 40, 13, true).slice(0, 2).forEach((ln, i) => pdf.text(ln, L + 14, top - 33 - i * 15, 13, ink, true));
  if (q.phone) pdf.text(`+${q.phone.replace(/^\+/, "")}`, L + 14, top - 53, 9.5, grey);
  pdf.rect(split, top - bh, R - split, bh, soft).rect(split, top - bh, 3, bh, navy);
  pdf.text("QUOTE NO.", split + 14, top - 16, 8, grey, true).textRight(no, R - 12, top - 16, 11, blue, true);
  pdf.text("DATE", split + 14, top - 33, 8, grey, true).textRight(day(made), R - 12, top - 33, 9.5, ink, true);
  pdf.text("VALID UNTIL", split + 14, top - 50, 8, grey, true).textRight(day(until), R - 12, top - 50, 9.5, ink, true);

  let y = top - bh - 22;
  const detail = q.size ? `Size: ${q.size}` : q.depth > 0 && q.rate > 0 ? `${q.casing ? `${q.casing.toUpperCase()} casing, ` : ""}${q.depth} m at ${kes(q.rate)} per metre` : "";
  const info = (label: string, value: string) => {
    const ls = wrapText(value, R - 130, 11, true);
    ls.forEach((ln, i) => pdf.text(i === 0 ? label : "", L, y - i * 14, 10, grey).text(ln, 110, y - i * 14, 11, ink, true));
    y -= ls.length * 14 + 4;
  };
  info("Service", q.item);
  if (detail) info("Details", detail);
  y -= 6;

  const notes = [q.note, q.footer].map((t) => t.trim()).filter(Boolean);
  const noteLines = notes.flatMap((t) => [...wrapText(t, R - L, 9.5), ""]);

  /* ---- panels under the total: why choose us, and the next step */
  const WHY = ["Quality workmanship and materials", "Timely delivery, with progress updates you can follow", "We serve all 47 counties", "Clear written quotes, no hidden charges"];
  const WHY_H = 20 + WHY.length * 14 + 8;
  const nextLines = wrapText(q.nextStep.trim(), R - L - 28, 9.5);
  const NEXT_H = nextLines.length ? 26 + nextLines.length * 12 + (contacts.length ? 8 + Math.ceil(contacts.length / 2) * 15 : 0) + 8 : 0;
  const panels = (top2: number) => {
    let t = top2;
    const WHY_W = R - L - 112; // the stamp sits beside it, in its own narrow column
    pdf.rect(L, t - WHY_H, WHY_W, WHY_H, soft).rect(L, t - WHY_H, 3, WHY_H, amber);
    pdf.stamp(R - 53, t - WHY_H / 2, 100, stampDate(q.createdAt));
    pdf.text(`Why choose ${company}`, L + 12, t - 15, 10.5, ink, true);
    WHY.forEach((w, i) => pdf.text(`- ${w}`, L + 12, t - 31 - i * 14, 9.5, ink));
    t -= WHY_H + 10;
    if (NEXT_H) {
      pdf.rect(L, t - NEXT_H, R - L, NEXT_H, navy).rect(L, t - NEXT_H, 4, NEXT_H, amber);
      pdf.text("NEXT STEP", L + 14, t - 16, 9, amber, true);
      nextLines.forEach((ln, i) => pdf.text(ln, L + 14, t - 31 - i * 12, 9.5, white));
      let cy = t - 31 - nextLines.length * 12 - 6;
      contacts.forEach((c, i) => {
        const x = L + 14 + (i % 2) * 250;
        pdf.text(`${c.label}:`, x, cy, 9, light).text(c.value, x + textWidth(`${c.label}: `, 9) + 4, cy, 9.5, white, true);
        if (i % 2 === 1) cy -= 15;
      });
      t -= NEXT_H;
    }
    return t;
  };
  const panelsHeight = WHY_H + 10 + NEXT_H;

  const TOTAL_H = 26;
  const totalRow = (top2: number) => {
    pdf.line(L, top2, R, top2, amber, 1.5);
    pdf.rect(L, top2 - TOTAL_H, R - L, TOTAL_H, tint);
    pdf.text("TOTAL", COL.desc + 4, top2 - 17, 11, ink, true);
    pdf.textRight(money(q.total), R - 4, top2 - 17, 12, blue, true);
    pdf.line(L, top2 - TOTAL_H, R, top2 - TOTAL_H, rule, 0.8);
    return top2 - TOTAL_H - 14;
  };
  // drilling quotes: the TOTAL DRILLING COST / Less: rig mobilization / BALANCE AFTER MOBILIZATION rows replace the single TOTAL row
  const sums = (q.lines ?? []).filter((l) => l.kind === "sum");
  const sumRows = (top2: number) => {
    let t = top2;
    sums.forEach((l, i) => {
      const strong = i !== 1;
      pdf.line(L, t, R, t, strong ? amber : rule, strong ? 1.5 : 0.8);
      if (strong) pdf.rect(L, t - TOTAL_H, R - L, TOTAL_H, tint);
      pdf.text(l.description, COL.desc + 4, t - 17, strong ? 11 : 9.5, ink, strong);
      pdf.textRight(money(l.amount ?? 0), R - 4, t - 17, strong ? 12 : 10, strong ? blue : ink, true);
      pdf.line(L, t - TOTAL_H, R, t - TOTAL_H, rule, 0.8);
      t -= TOTAL_H;
    });
    return t - 14;
  };
  const notesAndPanels = (top2: number) => {
    let t = top2;
    if (noteLines.length) {
      pdf.text("Notes", L, t, 9, grey, true);
      noteLines.forEach((ln, i) => pdf.text(ln, L, t - 14 - i * 12, 9.5, ink));
      t -= 14 + noteLines.length * 12 + 6;
    }
    return panels(t);
  };
  // the small Pay button (same look as the one in the site header), right under the panels, only when the site address is known
  const PAY_H = 26, PAY_W = 78, PAY_BLOCK = q.payUrl ? PAY_H + 40 : 0;
  const payButton = (top2: number) => {
    if (!q.payUrl) return;
    const y0 = top2 - PAY_H;
    pdf.gradientPill(L, y0, PAY_W, PAY_H).walletIcon(L + 14, y0 + 8, white).text("Pay", L + 34, y0 + 9, 12, white, true);
    pdf.link(L, y0, PAY_W, PAY_H, q.payUrl);
  };
  const extrasHeight = (noteLines.length ? 14 + noteLines.length * 12 + 6 : 0) + panelsHeight + 6 + PAY_BLOCK;

  if (!q.lines || !q.lines.length) {
    // single-line quote (services without a template, and quotes made before itemised quotes existed)
    pdf.line(L, y + 6, R, y + 6, rule);
    y -= 12;
    pdf.text("Total price", L, y, 10, grey).text(kes(q.total), 110, y - 4, 22, blue, true);
    y -= 40;
    if (notes.length) { pdf.text("Notes", L, y, 9, grey, true); noteLines.forEach((ln, i) => pdf.text(ln, L, y - 14 - i * 12, 9.5, ink)); y -= 14 + noteLines.length * 12 + 6; }
    payButton(panels(y) - 14);
  } else {
    /* ---- the table */
    const header = () => {
      pdf.rect(L, y - 20, R - L, 20, navy);
      pdf.text("S/N", COL.sn + 4, y - 14, 8.5, white, true);
      pdf.text("Description", COL.desc + 4, y - 14, 8.5, white, true);
      pdf.text("Unit", COL.unit + 4, y - 14, 8.5, white, true);
      pdf.textRight("Qty", COL.rate - 5, y - 14, 8.5, white, true);
      pdf.textRight("Rate (Ksh)", COL.amt - 5, y - 14, 8.5, white, true);
      pdf.textRight("Amount (Ksh)", R - 5, y - 14, 8.5, white, true);
      y -= 20;
    };
    const frame = (topY: number, h: number, fill?: ReturnType<typeof rgb>) => {
      if (fill) pdf.rect(L, topY - h, R - L, h, fill);
      pdf.line(L, topY - h, R, topY - h, rule);
      for (const x of [L, COL.desc, COL.unit, COL.qty, COL.rate, COL.amt, R]) pdf.line(x, topY, x, topY - h, rule);
    };
    const continued = (withHeader = true) => {
      pdf.newPage();
      pdf.rect(0, 802, PAGE_W, 40, navy).rect(0, 798, PAGE_W, 4, amber);
      pdf.logo(L, 805, 28);
      pdf.text(company, L + 36, 816, 13, white, true).textRight(`${no} (continued)`, R, 816, 10, light);
      y = 780;
      if (withHeader) header(); else y -= 6;
    };

    // the rig mobilization has its own small table above the numbered items (it is deducted from the total, not added to it)
    const mob = q.lines.find((l) => l.kind === "mob");
    if (mob) {
      pdf.rect(L, y - 20, R - L, 20, navy);
      pdf.text("Description", L + 4, y - 14, 8.5, white, true).textRight("Amount (Ksh)", R - 5, y - 14, 8.5, white, true);
      y -= 20;
      const mh = mob.label ? 32 : 22;
      pdf.line(L, y - mh, R, y - mh, rule).line(L, y, L, y - mh, rule).line(R, y, R, y - mh, rule);
      pdf.text(mob.description, L + 4, y - 14, 9, ink).textRight(money(mob.amount ?? 0), R - 5, y - 14, 9, ink, true);
      if (mob.label) pdf.textRight(mob.label, R - 5, y - 25, 8, blue);
      y -= mh + 12;
    }
    header();
    let n = 0;
    for (const l of q.lines) {
      if (l.kind === "mob" || l.kind === "sum") continue;
      if (l.kind === "section") {
        const h = 22;
        if (y - h < BOTTOM + 40) continued();
        frame(y, h, section);
        pdf.text(l.description, COL.desc + 4, y - 15, 9.5, navy, true);
        y -= h;
        n = 0;
        continue;
      }
      const desc = wrapText(l.description, COL.unit - COL.desc - 8, 9);
      const h = desc.length * 11.5 + 10;
      if (y - h < BOTTOM) continued();
      frame(y, h, n++ % 2 === 1 ? zebra : undefined);
      pdf.text(String(l.sn), COL.sn + 4, y - 14, 9, ink);
      desc.forEach((ln, i) => pdf.text(ln, COL.desc + 4, y - 14 - i * 11.5, 9, ink));
      pdf.text(l.unit, COL.unit + 4, y - 14, 9, ink);
      if (l.qty !== null) pdf.textRight(String(l.qty), COL.rate - 5, y - 14, 9, ink);
      if (l.rate !== null) pdf.textRight(money(l.rate), COL.amt - 5, y - 14, 9, ink);
      if (l.amount !== null) pdf.textRight(money(l.amount), R - 5, y - 14, 9, ink, true);
      else pdf.textRight(l.label || "Rate only", R - 5, y - 14, 9, grey);
      y -= h;
    }
    // the TOTAL row always comes straight after the last line; the notes and panels follow it, on a fresh page if they do not fit
    if (y - TOTAL_H * Math.max(1, sums.length) - 14 < BOTTOM) continued();
    y = sums.length ? sumRows(y) : totalRow(y);
    if (Number(q.agreedTotal) > 0 && Number(q.agreedTotal) < q.total) {
      if (y - TOTAL_H - 8 < BOTTOM) continued(false);
      const green = rgb("dcfce7"), gtxt = rgb("166534");
      pdf.rect(L, y - TOTAL_H, R - L, TOTAL_H, green);
      pdf.text(`OUR BEST PRICE${q.depth > 0 ? `  (${money(Math.round(q.agreedTotal! / q.depth))} per metre)` : ""}`, COL.desc + 4, y - 17, 11, gtxt, true);
      pdf.textRight(money(q.agreedTotal!), R - 4, y - 17, 12, gtxt, true);
      y -= TOTAL_H + 8;
      pdf.text(`You save ${money(Math.round(q.total - q.agreedTotal!))} on the standard price.`, COL.desc + 4, y - 4, 9, gtxt); y -= 16;
    }
    if (y - extrasHeight < BOTTOM) { continued(false); y += 0; }
    payButton(notesAndPanels(y) - 14);
  }

  /* ---- footer on every page */
  const total = pdf.pageCount;
  for (let i = 1; i <= total; i++) {
    pdf.onPage(i);
    pdf.line(L, 52, R, 52, rule);
    pdf.text(`Thank you for choosing ${company}. Prices are agreed for the period shown above.`, L, 38, 8, grey);
    pdf.textRight(`Page ${i} of ${total}`, R, 38, 8, grey);
  }
  return pdf.build(`${no} - ${q.item}`);
}
