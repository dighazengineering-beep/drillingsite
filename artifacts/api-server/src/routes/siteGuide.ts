import { Router } from "express";
import { pool, db, servicesTable, productsTable, projectsTable } from "@workspace/db";
import { SimplePdf, rgb, wrapText, PAGE_W, PAGE_H } from "../lib/pdf";

// A plain-text guide to the whole business as a PDF, made from what is live on the site right now (services, products, projects) plus the written pages.
// It is meant to be handed to an AI assistant (for example the WhatsApp business AI) so it answers from real information. Everything in it is already public.
const router = Router();

const kes = (n: unknown) => `KSh ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
const clean = (s: unknown) => String(s ?? "").replace(/\s+\n/g, "\n").replace(/³/g, "3").replace(/²/g, "2").trim();

router.get("/site-guide.pdf", async (_req, res) => {
  try {
    const [services, products, projects] = await Promise.all([
      db.select().from(servicesTable).orderBy(servicesTable.id),
      db.select().from(productsTable).orderBy(productsTable.category, productsTable.name),
      db.select().from(projectsTable).orderBy(projectsTable.serviceType, projectsTable.county),
    ]);
    let sizes: { label: string; price: number }[] = [];
    try { sizes = ((await pool.query("SELECT options FROM quote_templates WHERE id='purification'")).rows[0]?.options ?? []) as typeof sizes; } catch { /* table may not exist yet */ }

    const ink = rgb("1A2433"), navy = rgb("0B1F3A"), amber = rgb("F59E0B"), grey = rgb("5B6676");
    const L = 48, R = PAGE_W - 48, W = R - L, TOP = PAGE_H - 56, BOTTOM = 56;
    const pdf = new SimplePdf();
    let y = TOP;
    const room = (h: number) => { if (y - h < BOTTOM) { pdf.newPage(); y = TOP; } };
    const h1 = (t: string) => { room(60); y -= 8; pdf.rect(L, y - 6, W, 24, navy).text(t, L + 8, y, 13, rgb("FFFFFF"), true); y -= 28; };
    const h2 = (t: string) => { room(34); y -= 4; pdf.text(t, L, y, 11.5, navy, true); y -= 15; };
    const p = (t: string, size = 10, bold = false, color = ink, indent = 0) => {
      for (const ln of wrapText(clean(t), W - indent, size, bold)) { room(size + 4); pdf.text(ln, L + indent, y, size, color, bold); y -= size + 3.5; }
      y -= 3;
    };
    const bullet = (t: string) => {
      const ls = wrapText(clean(t), W - 14, 10);
      ls.forEach((ln, i) => { room(14); if (i === 0) pdf.text("-", L + 2, y, 10, amber, true); pdf.text(ln, L + 14, y, 10, ink); y -= 13.5; });
      y -= 1.5;
    };

    // title block
    pdf.rect(0, PAGE_H - 140, PAGE_W, 140, navy).logo(L, PAGE_H - 108, 54)
      .text("Dighaz Engineering Limited", L + 68, PAGE_H - 70, 24, rgb("FFFFFF"), true)
      .text("Business guide: services, prices, products and answers", L + 68, PAGE_H - 92, 11, amber, true)
      .text(`Made ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi" })} from the live website`, L + 68, PAGE_H - 108, 9, rgb("C9D3E3"));
    y = PAGE_H - 170;

    h1("1. About Dighaz Engineering Limited");
    p("Dighaz Engineering Limited is a Nairobi-based company that brings water to homes, farms, schools and businesses across Kenya. We do borehole drilling, hydrogeological surveys, test pumping, pump installation, borehole inspection, solar systems and water purification, so one team can take you from finding water to having it flow from your tap.");
    p("Mission: to give families, farms and businesses across Kenya reliable, clean water through professional borehole drilling and well-fitted pumping systems.");
    p("Vision: a Kenya where every community has dependable access to clean water, and where a borehole done right is the standard, not the exception.");
    p("Our values: honesty (clear quotes and plain answers, so you know what you are paying for before we start); quality workmanship (careful drilling, casing and pump fitting built to last); reliability (we turn up when we say we will and finish what we start); clean water first (every job is aimed at safe, dependable water).");

    h1("2. Contact");
    bullet("Phone and WhatsApp: +254 719 117 660");
    bullet("Email: dighazengineering@gmail.com");
    bullet("Head office: Nairobi, Kenya. We work across Kenya.");
    bullet("Working hours: Monday to Saturday, 7:00am to 6:00pm. Emergencies 24/7.");
    bullet("Website: https://www.dighazengineering.com  |  Get a quote: https://www.dighazengineering.com/quote");
    bullet("Enquiries sent through the website are answered within 24 hours. For urgent matters, call or WhatsApp.");

    h1("3. How to get a quote");
    p("Clients make their own itemised quote on the website, free of charge, at https://www.dighazengineering.com/quote . It takes a few minutes and the result can be downloaded as a PDF.");
    bullet("Choose the service. A client can add up to 6 services in one quote, each shown in its own section with one combined total. The hydrogeological survey always comes first, because it is the first step for anyone who needs a borehole.");
    bullet("Give the name, phone number and where the site is (typed, from the phone location, or pinned on the map).");
    bullet("For drilling, choose PVC or steel casing and enter the depth in metres. The price is worked out from the depth.");
    bullet("For drilling, the client can optionally upload a hydrogeological survey report and NEMA and WARMA permits if they already have them. These are optional.");
    bullet("For pump installation, the client chooses the power source (grid electricity, solar or generator) and gives the borehole depth, the yield in litres per hour, the static and pumping water levels (optional), how high the water must be pushed (optional) and whether the water carries sand. A test pumping report can be uploaded (optional). The pump is sized from these details and the quote lists every item.");
    bullet("For water purification, the client chooses the size: 250, 500 or 1,000 litres per hour.");
    bullet("Every quote is itemised in a table, the lines add up exactly to the total, and there is no VAT line. A quote is valid for 14 days.");
    bullet("There is no pressure to pay: the quote shows the total, and a small Pay link in the PDF opens the payment page. The client is invited to reach out for a detailed contract.");

    h1("4. Prices and rates");
    const drill = services.find((s) => /drill/i.test(s.name) && /metre|meter/i.test(s.priceUnit ?? ""));
    bullet(`Borehole drilling is charged per metre: PVC (plastic) casing ${drill ? kes(drill.priceFrom) : "KSh 5,650"} per metre, steel casing KSh 6,500 per metre. The total is the depth multiplied by the rate.`);
    bullet("Installing permanent surface casing is shown on the drilling quote as a rate only (KSh 6,000 per metre). It is not in the total, because the length needed depends on the site, and it is paid separately once the length is known.");
    if (sizes.length) bullet(`Water purification (reverse osmosis system, with filtration and UV) by size: ${sizes.filter((o) => o.price > 0).map((o) => `${o.label} ${kes(o.price)}`).join("; ")}.`);
    bullet("Pump installation is priced from the borehole details the client gives (power source, depth, yield, water levels and head). It cannot be a single fixed price, because the pump size changes with the borehole.");
    bullet("Prices for the other services are in section 5. Final prices are confirmed on the written quote.");

    h1("5. Services");
    for (const s of services) {
      h2(`${s.name}  (${s.category})`);
      p(`${s.priceFrom && Number(s.priceFrom) > 0 ? `Price: ${kes(s.priceFrom)} ${s.priceUnit ?? ""}.` : "Price on request."}${s.duration ? `  Time: ${s.duration}.` : ""}`.trim(), 10, true, grey);
      p(s.shortDescription);
      if (clean(s.description) && clean(s.description) !== clean(s.shortDescription)) p(s.description);
      const hi = (s.highlights as string[] | null) ?? [];
      for (const h of hi) bullet(h);
    }

    h1("6. Products");
    p("Products can be ordered on the website or through WhatsApp. Prices are in Kenya shillings.", 10, false, grey);
    let cat = "";
    for (const pr of products) {
      if (pr.category !== cat) { cat = pr.category; h2(cat); }
      room(30);
      p(`${pr.name}${pr.brand ? ` (${pr.brand})` : ""} - ${kes(pr.price)}${pr.inStock ? "" : " - out of stock"}`, 10, true);
      p(pr.description, 9.5, false, grey, 10);
    }

    h1("7. Projects we have done");
    p(`We have completed ${projects.length} projects across Kenya. Each line gives the project, the place, the year, and the depth or yield where there is one.`, 10, false, grey);
    let svcType = "";
    for (const pj of projects) {
      if (pj.serviceType !== svcType) { svcType = pj.serviceType; h2(svcType); }
      bullet(`${pj.title}, ${pj.town}, ${pj.county} (${pj.completionYear}).${pj.depth ? ` Depth ${pj.depth} m.` : ""}${pj.yield ? ` Yield ${pj.yield}.` : ""}`);
    }

    h1("8. Common questions");
    const faq: [string, string][] = [
      ["Can I get a quote for my borehole?", "Yes. Make it yourself in a few minutes at https://www.dighazengineering.com/quote ."],
      ["How long does drilling take?", "Usually a few days. It depends on the depth and the ground, and a clearer timeline is given once the area and depth are known."],
      ["Do I need a survey before drilling?", "We recommend it. A hydrogeological survey shows the best spot and the likely depth, so you do not drill in the wrong place. After the survey the client receives a written report."],
      ["What if my water is salty?", "We test the water first and can fit a treatment system (for example reverse osmosis) that makes it safe to drink."],
      ["Do I need NEMA and WARMA permits?", "You can upload them with your drilling quote if you already have them. It is optional."],
      ["Can you check my old borehole?", "Yes. Borehole inspection uses a camera to see the casing, any blockage and the real depth."],
      ["What is test pumping?", "It shows how much water a borehole can safely give and how the water level drops while pumping. It is used to choose the right pump."],
      ["Do you install pumps?", "Yes: grid-electric, solar or generator-powered, sized for the borehole."],
      ["How do I pay?", "Through the Pay button on the website (M-Pesa or bank transfer with a receipt), or by calling us. Clients receive a receipt for every payment."],
      ["Can I follow my job?", "Yes. Paying clients can see their job's progress on the website and receive updates by SMS."],
    ];
    for (const [q, a] of faq) { room(40); p(q, 10, true, navy); p(a); }

    // page numbers
    const n = pdf.pageCount;
    for (let i = 1; i <= n; i++) pdf.onPage(i).text(`Dighaz Engineering Limited business guide  |  page ${i} of ${n}`, L, 30, 8, grey);
    const buf = pdf.build("Dighaz Engineering Limited business guide");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="Dighaz-Engineering-guide.pdf"');
    res.setHeader("Cache-Control", "no-store");
    res.send(buf);
  } catch (e) {
    console.error("site guide failed", e);
    res.status(500).type("text/plain").send("Could not make the guide. Please try again.");
  }
});

export default router;
