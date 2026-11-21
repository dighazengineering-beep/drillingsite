// Run with:  pnpm --filter @workspace/api-server test
// The checks below use their OWN BigInt arithmetic (not the code under test), so they cannot just agree with it by accident.
import test from "node:test";
import assert from "node:assert/strict";
import { buildLines, depositOf, perMetreTotal, cleanTemplate, templateProblems, DEFAULT_TEMPLATES, type QuoteTemplate, type BuiltQuote } from "../src/lib/quoteLines.ts";

const drilling = DEFAULT_TEMPLATES.find((t) => t.id === "drilling")!;
const survey = DEFAULT_TEMPLATES.find((t) => t.id === "survey")!;
const STEEL_RATE = 6500;
const PVC_RATES = [3000, 3400, 3500, 3999, 4500]; // the PVC price per metre comes from the site, so several are tried

const big = (n: number | null) => BigInt(n ?? 0);
/** independent check of one quote: returns the number of individual checks made */
function checkQuote(b: BuiltQuote, expectedTotal: number, label: string): number {
  let checks = 0;
  let sum = 0n;
  let sn = 0;
  for (const l of b.lines) {
    if (l.kind === "section") continue;
    assert.equal(l.sn, ++sn, `${label}: S/N must run 1,2,3…`); checks++;
    assert.ok(Number.isInteger(l.rate) && l.rate! >= 1, `${label}: line ${l.sn} rate must be a whole shilling of at least 1 (got ${l.rate})`); checks++;
    if (l.rateOnly) { assert.equal(l.amount, null, `${label}: a rate-only line has no amount`); checks++; continue; }
    assert.ok(Number.isInteger(l.qty) && l.qty! >= 1, `${label}: line ${l.sn} quantity`); checks++;
    assert.equal(big(l.qty) * big(l.rate), big(l.amount), `${label}: line ${l.sn} Qty x Rate = Amount`); checks++;      // (b)
    sum += big(l.amount);
  }
  assert.equal(sum, BigInt(expectedTotal), `${label}: the lines add up exactly to the total`); checks++;                 // (a)
  assert.equal(b.total, expectedTotal, `${label}: the quote total`); checks++;
  const last = b.lines[b.lines.length - 1]!;
  assert.equal(last.kind, "line", `${label}: no heading left at the end`); checks++;
  return checks;
}

test("drilling quote, every depth 1-600 m, PVC and STEEL", () => {
  let cases = 0, checks = 0;
  const cases_: { casing: "pvc" | "steel"; rate: number }[] = [{ casing: "steel", rate: STEEL_RATE }, ...PVC_RATES.map((rate) => ({ casing: "pvc" as const, rate }))];
  for (const { casing, rate } of cases_) {
    for (let depth = 1; depth <= 600; depth++) {
      const total = perMetreTotal(depth, rate);
      const b = buildLines(drilling, depth, casing, total);
      assert.ok(b, `${casing} ${rate} ${depth} m: a quote is built`);
      const label = `${casing} @${rate}/m, ${depth} m`;
      checks += checkQuote(b!, total, label);
      assert.equal(BigInt(total), BigInt(depth) * BigInt(rate), `${label}: (c) total = depth x rate per metre`); checks++;   // (c)
      // (d) the deposit is exactly 70% of the total, rounded half up to a whole shilling (worked out here with BigInt)
      const expectedDeposit = (2n * BigInt(total) * 70n + 100n) / 200n;
      assert.equal(BigInt(depositOf(total, 70)), expectedDeposit, `${label}: (d) deposit is 70%`); checks++;
      assert.ok(Math.abs(Number(BigInt(depositOf(total, 70)) * 100n - BigInt(total) * 70n)) <= 50, `${label}: deposit within half a shilling of 70%`); checks++;
      cases++;
    }
  }
  console.log(`      ${cases} quotes (depth x casing x price), ${checks} individual checks`);
  assert.equal(cases, 600 * 6);
});

test("180 m STEEL reproduces the real quotation exactly (KSh 1,170,000.00)", () => {
  const b = buildLines(drilling, 180, "steel", 1_170_000)!;
  const got = b.lines.map((l) => [l.kind, l.sn, l.description, l.unit, l.qty, l.rate, l.amount]);
  const want = [
    ["line", 1, "Rig mobilization and demobilization to project area", "Ls", 1, 65500, 65500],
    ["section", null, "Drilling (for about 180 metres)", "", null, null, null],
    ["line", 2, "8\" dia from ground to 100m", "M", 100, 3400, 340000],
    ["line", 3, "8\" Ditto but upto to 180m", "M", 80, 3400, 272000],
    ["line", 4, "Install plain steel casing 6\"", "M", 120, 1500, 180000],   // the sample says "plain casing"; the steel/PVC word is added as asked
    ["line", 5, "Install slotted steel casing 6\"", "M", 60, 1800, 108000],
    ["line", 6, "Supply drilling water", "Ls", 1, 10000, 10000],
    ["line", 7, "Supply gravel pack", "ton", 9, 7000, 63000],
    ["line", 8, "Well development by air", "Hrs", 5, 4000, 20000],
    ["line", 9, "Well development by chemical", "Hrs", 5, 5000, 25000],
    ["line", 10, "24 hr test pumping", "Hrs", 24, 2500, 60000],
    ["line", 11, "Logging", "No", 90, 200, 18000],
    ["line", 12, "Install permanent surface casing", "M", null, 6000, null],   // "Rate only", not in the total
    ["line", 13, "Construct well head", "Ls", 1, 1500, 1500],
    ["line", 14, "Chemical analysis", "Ls", 1, 7000, 7000],
  ];
  assert.deepEqual(got, want);
  assert.equal(b.total, 1_170_000);
  assert.equal(b.templateTotal, 1_170_000, "the template itself adds up to the sample total");
  assert.equal(depositOf(1_170_000, 70), 819_000);
  assert.equal(b.lines.find((l) => l.rateOnly)!.amount, null);
  // and the same 180 m with PVC: same quantities, wording says PVC
  const p = buildLines(drilling, 180, "pvc", perMetreTotal(180, 3500))!;
  assert.deepEqual(p.lines.filter((l) => l.kind === "line").map((l) => l.qty), want.filter((w) => w[0] === "line").map((w) => w[4]));
  assert.ok(p.lines.some((l) => l.description === "Install plain PVC casing 6\""));
});

test("quantities follow the depth sensibly", () => {
  const q = (depth: number) => {
    const b = buildLines(drilling, depth, "steel", perMetreTotal(depth, STEEL_RATE))!;
    const by = (start: string) => b.lines.find((l) => l.description.startsWith(start));
    return { drill1: by("8\" dia")?.qty, drill2: by("8\" Ditto")?.qty, plain: by("Install plain")?.qty, slotted: by("Install slotted")?.qty, gravel: by("Supply gravel")?.qty, logging: by("Logging")?.qty, head: by("Drilling (for")?.description };
  };
  assert.deepEqual(q(60), { drill1: 60, drill2: undefined, plain: 40, slotted: 20, gravel: 3, logging: 30, head: "Drilling (for about 60 metres)" });
  assert.deepEqual(q(100), { drill1: 100, drill2: undefined, plain: 67, slotted: 33, gravel: 5, logging: 50, head: "Drilling (for about 100 metres)" });
  assert.equal(q(101).drill2, 1);
  assert.deepEqual(q(1), { drill1: 1, drill2: undefined, plain: 1, slotted: undefined, gravel: 1, logging: 1, head: "Drilling (for about 1 metres)" });
  for (let d = 1; d <= 600; d++) { const x = q(d); assert.equal((x.plain ?? 0) + (x.slotted ?? 0), d, `casing metres add up to the depth at ${d} m`); assert.equal((x.drill1 ?? 0) + (x.drill2 ?? 0), d, `drilling metres add up to the depth at ${d} m`); }
});

test("survey quote: lines scale to the site price, WRMA lines are not there", () => {
  const b = buildLines(survey, 0, "", 27_000)!;
  assert.deepEqual(b.lines.map((l) => l.rate), [4909, 17182, 4909]);
  assert.deepEqual(b.lines.map((l) => l.amount), [4909, 17182, 4909]);
  assert.equal(b.templateTotal, 55_000);
  assert.ok(/WRMA statutory fees and permit processing are not included/.test(b.footer));
  assert.ok(!b.lines.some((l) => /WRMA|Statutory/i.test(l.description)));
  let n = 0;
  for (let price = 1_000; price <= 150_000; price++) { checkQuote(buildLines(survey, 0, "", price)!, price, `survey ${price}`); n++; }
  console.log(`      ${n} survey prices checked (KSh 1,000 to 150,000, every shilling)`);
});

test("an admin's own price: lines scale to it and still add up (or, if far too small, the single-line quote is used)", () => {
  let n = 0, small = 0;
  for (let total = 1_000; total <= 6_000_000; total += 12_347) {
    for (const d of [1, 50, 100, 180, 333, 600]) {
      const b = buildLines(drilling, d, "steel", total);
      if (total >= d * 1000) { assert.ok(b, `a sensible price (${total} for ${d} m) always gets lines`); }
      if (!b) { small++; continue; }          // absurdly small price: no breakdown, never a wrong one
      checkQuote(b, total, `custom ${total} @${d} m`); n++;
    }
  }
  console.log(`      ${n} hand-set prices checked, ${small} absurdly small ones correctly left as a single line`);
});

test("when no lump-sum line exists, a rounding line keeps the quote exact", () => {
  const t: QuoteTemplate = { id: "x", name: "x", needsDepth: false, footer: "", lines: [{ kind: "line", description: "Pipes", unit: "M", qty: { mode: "fixed", n: 7 }, rate: 100 }] };
  let made = 0;
  for (let total = 1; total <= 5000; total++) {
    const b = buildLines(t, 0, "", total);
    if (!b) { assert.ok(total < 700, "only tiny totals are refused"); continue; }
    made++;
    assert.equal(b.lines.reduce((a, l) => a + (l.amount ?? 0), 0), total);
    for (const l of b.lines) if (!l.rateOnly) assert.equal(l.qty! * l.rate!, l.amount);
  }
  assert.ok(made > 4000);
});

test("a long template (60 lines) still adds up", () => {
  const lines = Array.from({ length: 60 }, (_, i) => ({ kind: "line" as const, description: `Item ${i + 1}`, unit: "Ls", qty: { mode: "fixed" as const, n: 1 + (i % 4) }, rate: 1000 + i * 137 }));
  const t: QuoteTemplate = { id: "long", name: "long", needsDepth: false, footer: "", lines };
  for (const total of [1000, 99_999, 1_234_567, 7_000_001]) checkQuote(buildLines(t, 0, "", total)!, total, `long ${total}`);
});

test("deposit is 70% rounded half up, in whole shillings", () => {
  assert.equal(depositOf(1_170_000, 70), 819_000);
  assert.equal(depositOf(5, 70), 4);   // 3.5 -> 4
  assert.equal(depositOf(1, 70), 1);   // 0.7 -> 1
  assert.equal(depositOf(3, 70), 2);   // 2.1 -> 2
  assert.equal(depositOf(100, 70), 70);
  assert.equal(depositOf(27_000, 70), 18_900);
});

test("template editor input is checked", () => {
  assert.equal(cleanTemplate({ lines: "no" }, "x").ok, false);
  assert.equal(cleanTemplate({ lines: [{ kind: "line", description: "a", rate: 1.5, qty: { mode: "fixed", n: 1 } }] }, "x").ok, false);
  assert.equal(cleanTemplate({ lines: [{ kind: "line", description: "a", rate: 10, qty: { mode: "nonsense" } }] }, "x").ok, false);
  assert.equal(cleanTemplate({ lines: Array.from({ length: 81 }, () => ({ kind: "section", description: "s" })) }, "x").ok, false);
  const ok = cleanTemplate({ name: "T", needsDepth: true, footer: "f", lines: [{ kind: "line", description: "a", unit: "M", rate: 10, qty: { mode: "first", n: 100 } }] }, "x");
  assert.equal(ok.ok, true);
  // the two default templates survive being saved through the editor unchanged
  for (const t of DEFAULT_TEMPLATES) { const r = cleanTemplate(t, t.id); assert.ok(r.ok); assert.deepEqual((r as { template: QuoteTemplate }).template, t); }
  // warnings
  assert.ok(templateProblems({ id: "x", name: "x", needsDepth: false, footer: "", lines: [] }, null).length > 0);
  assert.deepEqual(templateProblems(drilling, buildLines(drilling, 180, "steel", 1_170_000)), []);
});

test("inspection and test pumping: every site price from 1,000 to 150,000 adds up exactly", () => {
  for (const id of ["inspection", "testpump"]) {
    const t = DEFAULT_TEMPLATES.find((x) => x.id === id)!;
    let checks = 0;
    for (let total = 1000; total <= 150000; total++) {
      const b = buildLines(t, 0, "", total);
      assert.ok(b, `${id} ${total} built`);
      let sum = 0n;
      for (const l of b!.lines) {
        if (l.rateOnly) { assert.equal(l.amount, null); continue; }
        assert.equal(BigInt(l.qty!) * BigInt(l.rate!), BigInt(l.amount!), `${id} ${total}: qty x rate = amount`);
        sum += BigInt(l.amount!);
        checks++;
      }
      assert.equal(sum, BigInt(total), `${id} ${total}: lines add up to the total`);
    }
    assert.ok(checks > 100000);
  }
});

test("inspection: the last line says Included with no amount; test pumping keeps its bullet lines", () => {
  const ins = buildLines(DEFAULT_TEMPLATES.find((x) => x.id === "inspection")!, 0, "", 32000)!;
  assert.deepEqual(ins.lines.map((l) => l.amount), [5000, 10000, 17000, null]); // 32,000 = the sample, split 5,000 / 10,000 / 17,000
  assert.equal(ins.lines[3]!.label, "Included");
  assert.equal(ins.lines[3]!.rate, null);
  const tp = buildLines(DEFAULT_TEMPLATES.find((x) => x.id === "testpump")!, 0, "", 75000)!;
  assert.deepEqual(tp.lines.map((l) => l.amount), [15000, 15000, 35000, 10000]);
  assert.ok(tp.lines[2]!.description.includes("\n- Step-Drawdown Test"));
  // the admin screen keeps the label and the line breaks
  const c = cleanTemplate({ lines: [{ kind: "line", description: "A\n- b", unit: "Lot", qty: { mode: "fixed", n: 1 }, rate: 0, rateOnly: true, label: "Included" }, { kind: "line", description: "B", unit: "Lot", qty: { mode: "fixed", n: 1 }, rate: 100 }] }, "x");
  assert.ok(c.ok && c.template.lines[0]!.label === "Included" && c.template.lines[0]!.description.includes("\n"));
});

test("water purification: every size price adds up exactly, the size is printed, and there is no VAT line", () => {
  const t = DEFAULT_TEMPLATES.find((x) => x.id === "purification")!;
  assert.deepEqual(t.options!.map((o) => o.label), ["250 L/hr", "500 L/hr", "1,000 L/hr"]);
  assert.equal(t.options![2]!.price, 1_290_000); // the real quotation's price for 1,000 L/hr
  assert.ok(t.options![0]!.price < t.options![1]!.price && t.options![1]!.price < t.options![2]!.price); // smaller size, smaller price
  assert.ok(!t.lines.some((l) => /\bvat\b|\bdiscount\b|sub.?total/i.test(l.description)));
  for (let total = 20000; total <= 3_000_000; total += 997) {
    const b = buildLines(t, 0, "", total, "500 L/hr")!;
    assert.ok(b, `built ${total}`);
    let sum = 0n;
    for (const l of b.lines) { assert.equal(BigInt(l.qty!) * BigInt(l.rate!), BigInt(l.amount!)); sum += BigInt(l.amount!); }
    assert.equal(sum, BigInt(total));
  }
  const b = buildLines(t, 0, "", 1_290_000, "1,000 L/hr")!;
  assert.ok(b.lines.some((l) => l.description.includes("1,000 L/hr")) && !b.lines.some((l) => l.description.includes("{size}")));
  assert.equal(b.lines.length, 13);
  // sizes coming from the admin screen are checked
  const base = { lines: [{ kind: "line", description: "A", unit: "Ls", qty: { mode: "fixed", n: 1 }, rate: 100 }] };
  const ok = cleanTemplate({ ...base, options: [{ label: "250 L/hr", price: 90000 }, { label: " 500 L/hr ", price: 150000 }] }, "x");
  assert.ok(ok.ok && ok.template.options!.length === 2 && ok.template.options![1]!.label === "500 L/hr");
  assert.equal(cleanTemplate({ ...base, options: [{ label: "A", price: 1 }, { label: "a", price: 2 }] }, "x").ok, false);
  assert.equal(cleanTemplate({ ...base, options: [{ label: "A", price: -5 }] }, "x").ok, false);
});
