import { RelationSelect, savedWitnesses, saveWitness } from "@/components/RelationSelect";
import CopyLink from "@/components/CopyLink";
import { PayPlanPicker } from "@/components/PayPlanPicker";
import { surveyFirst } from "@/lib/order";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Download, MessageSquare, Calculator, CheckCircle, X, Phone } from "lucide-react";
import PageBanner from "@/components/PageBanner";
import { LiveTitle } from "@/components/LiveTitle";
import { IMAGES, photoLayer } from "@/lib/images";
import { whatsappLink } from "@/lib/utils";
import { API, kes, docUrl } from "@/lib/member";
import { store } from "@/pages/Feed";
import LocationPicker, { type Place } from "@/components/LocationPicker";
import IdScanField from "@/components/IdScanField";
import type { ScanResult } from "@/components/IdScanner";
import DocUpload, { type Doc } from "@/components/DocUpload";
import QuoteTable, { type QLine } from "@/components/QuoteTable";
import { PhoneField } from "@/components/PhoneField";

interface Svc { id: number; name: string; priceFrom: number | null; priceUnit: string | null }
interface Opt { label: string; price: number }
interface Result { token: string; id: number; item: string; size?: string; casing: string; depth: number; rate: number; total: number; depositPct: number; deposit: number; lines?: QLine[] | null; agreedTotal?: number }

// Only used to show a price while the client is choosing. The real price is worked out again on the server.
const STEEL_RATE = 6500;
const inp = "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30";
const lab = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground";

// What the client typed is kept for this visit, so going back from the quote (or leaving the page by mistake) does not lose it.
const loadDraft = (key: string): any => { try { return JSON.parse(sessionStorage.getItem(key) || "null") || {}; } catch { return {}; } };

// contract = true: the same form, plus the agreed price and the payment details. It makes the quote first, then the contract from it.
export default function InstantQuote({ contract = false }: { contract?: boolean }) {
  const DRAFT = contract ? "kws-contract-draft" : "kws-quote-draft";
  const [, nav] = useLocation();
  const draft = useMemo(() => loadDraft(DRAFT), []);
  const [cRate, setCRate] = useState<string>(draft.cRate ?? ""), [cTotal, setCTotal] = useState<string>(draft.cTotal ?? ""), [cMob, setCMob] = useState<string>(draft.cMob ?? ""), [cPct, setCPct] = useState<string>(draft.cPct ?? "75"), [cPlan, setCPlan] = useState<"steps" | "full">(draft.cPlan === "full" ? "full" : "steps"), [cSteps, setCSteps] = useState<string[]>(Array.isArray(draft.cSteps) ? draft.cSteps : []);
  const [svcs, setSvcs] = useState<Svc[]>([]);
  const [opts, setOpts] = useState<Record<string, Opt[]>>({});
  type Row = { sid: string; casing: "pvc" | "steel"; depth: string; size: string; power: "" | "grid" | "solar" | "generator"; yieldLph: string; staticLevel: string; pumpingLevel: string; delivery: string; sand: "clear" | "some" | "sandy"; solarType?: "" | "grid" | "hybrid" | "offgrid"; solarKw?: string; solarPacks?: string; solarMount?: "roof" | "ground" };
  const blank: Row = { sid: "", casing: "pvc", depth: "", size: "", power: "", yieldLph: "", staticLevel: "", pumpingLevel: "", delivery: "", sand: "clear", solarType: "", solarKw: "", solarPacks: "", solarMount: "roof" };
  const [rows, setRows] = useState<Row[]>(Array.isArray(draft.rows) && draft.rows.length ? draft.rows : [blank]);
  const setRow = (i: number, patch: Partial<Row>) => setRows((l) => l.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const [name, setName] = useState<string>(draft.name ?? "");
  const [phone, setPhone] = useState<string>(draft.phone ?? "");
  const [idNo, setIdNo] = useState<string>(draft.idNo ?? ""), [address, setAddress] = useState<string>(draft.address ?? ""), [email, setEmail] = useState<string>(draft.email ?? ""), [wName, setWName] = useState<string>(draft.wName ?? ""), [wId, setWId] = useState<string>(draft.wId ?? ""), [wRel, setWRel] = useState<string>(draft.wRel ?? ""), [payMode, setPayMode] = useState<string>(draft.payMode ?? "mpesa"), [siteDay, setSiteDay] = useState<string>(draft.siteDay ?? ""), [wPhone, setWPhone] = useState<string>(draft.wPhone ?? ""), [lName, setLName] = useState<string>(draft.lName ?? ""), [lId, setLId] = useState<string>(draft.lId ?? ""), [lPhone, setLPhone] = useState<string>(draft.lPhone ?? "");
  const [idScan, setIdScan] = useState<ScanResult | null>(null);
  const [place, setPlace] = useState<Place>(draft.place ?? { text: "", lat: null, lng: null });
  const [report, setReport] = useState<Doc | null>(draft.report ?? null);   // hydrogeological survey report
  const [nema, setNema] = useState<Doc | null>(draft.nema ?? null);        // NEMA permit
  const [warma, setWarma] = useState<Doc | null>(draft.warma ?? null);      // WARMA permit
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  // The browser's Back button from the quote returns to the filled form, not away from the page.
  useEffect(() => {
    const onPop = () => setResult(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    fetch(`${API}/api/quote-options`).then((r) => r.json()).then((d) => setOpts(d && typeof d === "object" ? d : {})).catch(() => {});
    fetch(`${API}/api/services`).then((r) => r.json()).then((d) => {
      const list = Array.isArray(d) ? surveyFirst(d).filter((x: Svc) => (x.priceFrom ?? 0) > 0) : [];   // a service with no price yet (for example Solar Installation) is quoted on WhatsApp, not here
      setSvcs(list);
      // a "Get an instant quote" button on a service opens this page with that service already chosen (?service=ID)
      try { const pre = new URLSearchParams(window.location.search).get("service"); if (pre && list.some((x: Svc) => String(x.id) === pre)) setRows((l) => (l.length === 1 && !l[0].sid ? [{ ...l[0], sid: pre }] : l)); } catch { /* ignore */ }
    }).catch(() => {});
  }, []);

  const svcOf = (sid: string) => svcs.find((x) => String(x.id) === sid);
  const sizesOf = (sid: string) => opts[sid] ?? [];   // services sold in sizes (for example water purification)
  const isPump = (x?: Svc) => !!x && /pump/i.test(x.name) && !/test.?pump/i.test(x.name);   // pump installation: priced on the server from the borehole details
  const isSolar = (x?: Svc) => !!x && /solar/i.test(x.name) && !/pump/i.test(x.name);   // solar installation: priced on the server from the system type and size
  const isPm = (x?: Svc) => !!x && !isPump(x) && !isSolar(x) && !sizesOf(String(x.id)).length && /metre|meter/i.test(x.priceUnit ?? "");
  const priceOf = (r: Row) => {
    const x = svcOf(r.sid);
    if (!x || isPump(x) || isSolar(x)) return 0;
    if (sizesOf(r.sid).length) return sizesOf(r.sid).find((o) => o.label === r.size)?.price ?? 0;
    return isPm(x) ? (r.casing === "steel" && !/flush|open\s+(borehole\s+)?drill/i.test(x.name) ? STEEL_RATE : Math.round(x.priceFrom ?? 0)) * (Number(r.depth) || 0) : Math.round(x.priceFrom ?? 0);
  };
  const preview = rows.reduce((a, r) => a + priceOf(r), 0);
  const anyPm = rows.some((r) => isPm(svcOf(r.sid)));
  const anyChosen = rows.some((r) => svcOf(r.sid));
  const anyPump = rows.some((r) => isPump(svcOf(r.sid)));
  const cx = svcOf(rows[0]?.sid);
  const adminKey = store.get("kws_admin"), [best, setBest] = useState("");
  const cKind: "drill" | "opendrill" | "survey" | "other" = !contract || !cx ? "other" : /survey/i.test(cx.name) ? "survey" : /open\s+(borehole\s+)?drill/i.test(cx.name) ? "opendrill" : isPm(cx) && /drill/i.test(cx.name) && !/flush/i.test(cx.name) ? "drill" : "other";
  const anySolar = rows.some((r) => isSolar(svcOf(r.sid)));
  // the contract price the client will pay (known here for per-metre and survey services; solar and pump are priced by the server)
  const cAgreed = !contract || !cx ? 0 : cKind === "survey" ? (Number(cTotal) || priceOf(rows[0])) : cKind === "drill" || cKind === "opendrill" ? (Number(cRate) ? Number(cRate) * (Number(rows[0]?.depth) || 0) : priceOf(rows[0])) : priceOf(rows[0]);
  const [pumpDoc, setPumpDoc] = useState<Doc | null>(draft.pumpDoc ?? null);   // test pumping report

  useEffect(() => {
    const all = { rows, name, phone, place, report, nema, warma, pumpDoc, idNo, address, email, wName, wId, wRel, payMode, siteDay, wPhone, lName, lId, lPhone, cRate, cTotal, cMob, cPct, cPlan, cSteps };
    try { sessionStorage.setItem(DRAFT, JSON.stringify(all)); }
    catch { // big uploaded files can fill the browser's storage and used to make the whole draft vanish: keep the typed details and drop only the files
      try { sessionStorage.setItem(DRAFT, JSON.stringify({ ...all, report: null, nema: null, warma: null, pumpDoc: null })); } catch { /* storage blocked: the form still works */ }
    }
  }, [rows, name, phone, place, report, nema, warma, pumpDoc, idNo, address, email, wName, wId, wRel, payMode, siteDay, wPhone, lName, lId, lPhone, cRate, cTotal, cMob, cPct, cPlan, cSteps]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (rows.some((r) => !svcOf(r.sid))) return setErr("Choose a service in every row, or remove the empty row.");
    if (new Set(rows.map((r) => r.sid)).size !== rows.length) return setErr("Each service can be added only once.");
    if (rows.some((r) => sizesOf(r.sid).length && !r.size)) return setErr("Choose the size you need.");
    if (rows.some((r) => isPm(svcOf(r.sid)) && (Number(r.depth) || 0) < 1)) return setErr("Enter the depth in metres.");
    if (rows.some((r) => isSolar(svcOf(r.sid)) && (!r.solarType || !r.solarKw))) return setErr("For solar, choose the kind of system and the size.");
    if (rows.some((r) => isPump(svcOf(r.sid)) && !r.power)) return setErr("Choose the power source for the pump: grid, solar or generator.");
    if (rows.some((r) => isPump(svcOf(r.sid)) && ((Number(r.depth) || 0) < 20 || (Number(r.yieldLph) || 0) < 500))) return setErr("For the pump, enter the borehole depth (metres) and the yield (litres per hour).");
    if (name.trim().length < 2) return setErr("Enter your name.");
    if (phone.replace(/\D/g, "").length < 9) return setErr("Enter your phone number.");
    if (contract && !/^[A-Za-z0-9][A-Za-z0-9 \/.-]{4,19}$/.test(idNo.trim())) return setErr("Enter your ID or passport number. It is printed on the contract.");
    if (!email.trim()) return setErr(contract ? "Enter your email address. We send your contract and every payment update there." : "Enter your email address so we can send you the quote.");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr("That email address does not look right.");
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/quotes/instant`, {
        method: "POST", headers: { "content-type": "application/json", ...(adminKey && !contract ? { "x-admin-key": adminKey } : {}) },
        body: JSON.stringify({ ...(adminKey && !contract && rows.length === 1 && Number(best) > 0 ? (isPm(svcOf(rows[0]!.sid)) ? { agreedRate: Number(best) } : { agreedTotal: Number(best) }) : {}), items: rows.map((r) => isSolar(svcOf(r.sid)) ? { serviceId: Number(r.sid), solarType: r.solarType, solarKw: Number(r.solarKw), solarPacks: r.solarType === "grid" ? "" : r.solarPacks, solarMount: r.solarMount } : isPump(svcOf(r.sid)) ? { serviceId: Number(r.sid), power: r.power, depth: Number(r.depth) || 0, yieldLph: Number(r.yieldLph) || 0, staticLevel: r.staticLevel, pumpingLevel: r.pumpingLevel, delivery: r.delivery, sand: r.sand } : ({ serviceId: Number(r.sid), size: sizesOf(r.sid).length ? r.size : "", casing: isPm(svcOf(r.sid)) && !/flush|open\s+(borehole\s+)?drill/i.test(svcOf(r.sid)?.name ?? "") ? r.casing : "", depth: isPm(svcOf(r.sid)) ? Number(r.depth) || 0 : 0 })), name: name.trim(), phone, email: contract ? "" : email.trim(), location: place.text.trim(), lat: place.lat, lng: place.lng, reportUrl: anyPm ? report?.url ?? "" : "", nemaUrl: anyPm ? nema?.url ?? "" : "", warmaUrl: anyPm ? warma?.url ?? "" : "", pumpReportUrl: anyPump ? pumpDoc?.url ?? "" : "" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not make the quote. Please try again.");
      if (contract) {
        const cr = await fetch(`${API}/api/contracts`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ quoteToken: d.token, replaceToken: (() => { try { return sessionStorage.getItem("kws-contract-last") || ""; } catch { return ""; } })(), idNo: idNo.trim(), address: address.trim(), witnessName: wName.trim(), witnessId: wName.trim() ? wId.trim() : "", email: email.trim(), idMatch: idScan?.match, idSource: idScan?.source, payMode, siteDay, witnessPhone: wPhone.trim(), witnessRelation: wName.trim() ? wRel.trim() : "", lawyerName: lName.trim(), lawyerId: lName.trim() ? lId.trim() : "", lawyerPhone: lName.trim() ? lPhone.trim() : "", agreedRate: cKind === "drill" || cKind === "opendrill" ? cRate : "", agreedTotal: cKind === "survey" ? cTotal : "", mobilization: cKind === "drill" || cKind === "opendrill" ? cMob : "", onsitePct: cKind === "drill" || cKind === "opendrill" ? cPct : "", payPlan: cPlan, steps: cPlan === "steps" && cSteps.some((x) => x !== "") ? cSteps.map((x) => Number(x) || 0) : undefined }),
        });
        const cd = await cr.json().catch(() => ({}));
        if (!cr.ok) throw new Error(cd.error || "Could not make the contract. Please try again.");
        try { sessionStorage.setItem("kws-contract-last", String(cd.token)); } catch { /* ignore */ }
        saveWitness(wName); try { if (Array.isArray(cd.signerLinks) && cd.signerLinks.length) localStorage.setItem(`kws-sl-${cd.token}`, JSON.stringify(Object.fromEntries(cd.signerLinks.map((x: { role: string; name: string; link: string }) => [`${x.role}:${x.name}`, x.link])))); } catch { /* ignore */ }   // the private witness / lawyer links are shown once; they stay on this device   // the form stays filled in, so "Change my details" brings everything back
        if (idScan) for (const [kind, data] of [["id_front", idScan.front], ["id_back", idScan.back]] as const) {
          const ur = await fetch(`${API}/api/contracts/${cd.token}/id`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, data }) });
          if (!ur.ok) throw new Error((await ur.json().catch(() => ({}))).error || "Your ID could not be saved. Please press Continue again.");
        }
        setBusy(false);
        nav(`/contract/${cd.token}`);
        return;
      }
      setResult(d);
      try { window.history.pushState({ quoteResult: 1 }, ""); } catch { /* ignore */ }
    } catch (e2) { setErr((e2 as Error).message); }
    setBusy(false);
  };


  return (
    <div>
      <PageBanner
        eyebrow={contract ? "Contract" : "Get a Quote"}
        title={contract ? "Make your contract" : "Get your quote"}
        description={contract ? "Fill in your details and the price we agreed. Your quote is built in, and your contract is ready to read, sign and pay." : "Choose the service, tell us where the site is, and see your itemised quote now. Download it as a PDF, free of charge."}
      />
      <div
        style={{
          backgroundColor: "var(--live-bg, hsl(160 52% 10%))",
          backgroundImage: `linear-gradient(180deg, hsl(160 52% 8% / .50) 0%, hsl(160 52% 8% / .22) 45%, hsl(160 52% 8% / .50) 100%), ${photoLayer(IMAGES.backdropRig)}`,
          backgroundSize: "cover",
          backgroundPosition: "center 50%",
        }}
      >
        <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
          {result ? (
            <div className="rounded-2xl border border-border bg-card/95 p-5 shadow-sm" data-testid="quote-result">
              <div className="mb-3 flex items-center gap-2 text-emerald-700"><CheckCircle className="h-5 w-5" /><p className="text-sm font-bold">Your quote QT-{String(result.id).padStart(5, "0")} is ready</p></div>
              <p className="text-sm font-bold text-foreground">{result.item}</p>
              {result.size && <p className="text-xs text-muted-foreground">Size: {result.size}</p>}
              {result.depth > 0 && <p className="text-xs text-muted-foreground">{result.casing ? `${result.casing.toUpperCase()} casing · ` : ""}{result.depth} m at {kes(result.rate)} per metre</p>}
              <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Total price</p>
              <p className="text-3xl font-extrabold text-primary">{kes(result.total)}</p>
              <ul className="mt-3 space-y-1 rounded-xl bg-muted px-3.5 py-2.5 text-xs font-semibold text-foreground">
                {["Quality workmanship and materials", "Timely delivery, with progress updates you can follow", "We serve all 47 counties", "Clear written quotes, no hidden charges"].map((t) => <li key={t}>✓ {t}</li>)}
              </ul>
              {result.lines && result.lines.length > 0 && (
                <details className="mt-3 rounded-xl border border-border p-2.5" data-testid="quote-breakdown">
                  <summary className="cursor-pointer text-xs font-bold text-primary">See the breakdown</summary>
                  <div className="mt-2"><QuoteTable lines={result.lines} total={result.total} agreed={result.agreedTotal} /></div>
                </details>
              )}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <a href={docUrl(`/api/quotes/${result.token}/pdf?site=${encodeURIComponent(window.location.origin)}`)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground" data-testid="button-download-pdf">
                  <Download className="h-4 w-4" /> Download PDF quote
                </a>
                <div className="flex items-center justify-center gap-4 rounded-xl border border-border px-4 py-3" data-testid="quote-share-row">
                  <CopyLink url={docUrl(`/api/quotes/${result.token}/page?site=${encodeURIComponent(window.location.origin)}`)} label="Copy quote link" withShare testId="button-copy-quote-link" />
                </div>
                <a href={whatsappLink(`Hello, I got quote QT-${String(result.id).padStart(5, "0")} for ${result.item} (${kes(result.total)}). I would like to talk about it.`)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-400 px-4 py-3 text-sm font-bold text-slate-900 hover:bg-sky-300" data-testid="button-talk-to-us">
                  <MessageSquare className="h-4 w-4" /> Talk to us
                </a>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                <a href={whatsappLink(`Hello, I got instant quote QT-${String(result.id).padStart(5, "0")} for ${result.item} (${kes(result.total)}). I have a question.`)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-bold text-emerald-700"><MessageSquare className="h-3.5 w-3.5" /> Ask us on WhatsApp</a>
                <span className="flex gap-4">
                  <button type="button" onClick={() => setResult(null)} className="font-bold text-primary" data-testid="button-change-details">Change details</button>
                  <button type="button" onClick={() => { try { sessionStorage.removeItem(DRAFT); } catch { /* ignore */ } setRows([blank]); setName(""); setPhone(""); setPlace({ text: "", lat: null, lng: null }); setReport(null); setNema(null); setWarma(null); setPumpDoc(null); setResult(null); }} className="font-bold text-muted-foreground">New quote</button>
                </span>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">This price is valid for 14 days.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="rounded-2xl border border-border bg-card/95 p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-foreground"><LiveTitle text="Your details" hi="#0ea5e9" level="sub" /></h2>
              <div className="grid gap-3">
                {rows.map((r, i) => {
                  const x = svcOf(r.sid), pm = isPm(x);
                  return (
                    <div key={i} className={rows.length > 1 ? "rounded-xl border border-border bg-muted/30 p-3" : ""}>
                      <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1">
                          <label className={lab} htmlFor={`iq-service-${i}`}>{rows.length > 1 ? `Service ${i + 1}` : "Service"}</label>
                          <select id={`iq-service-${i}`} value={r.sid} onChange={(e) => setRow(i, { sid: e.target.value, size: "" })} className={inp} data-testid={i === 0 ? "select-quote-service" : undefined}>
                            <option value="">Choose…</option>
                            {svcs.filter((sv) => String(sv.id) === r.sid || !rows.some((o) => o.sid === String(sv.id))).map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
                          </select>
                        </div>
                        {rows.length > 1 && <button type="button" onClick={() => setRows((l) => l.filter((_, k) => k !== i))} aria-label="Remove this service" className="mb-0.5 rounded-xl border border-border p-2.5 text-muted-foreground hover:text-red-600"><X className="h-4 w-4" /></button>}
                      </div>
                      {isSolar(x) && (
                        <div className="mt-3 grid gap-3">
                          <div>
                            <label className={lab}>Kind of solar system</label>
                            <div className="grid gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Kind of solar system">
                              {([["hybrid", "Hybrid", "Solar, battery and the grid. Power stays on in blackouts."], ["offgrid", "Off-grid", "Solar and battery only. For places with no grid."], ["grid", "Grid-tied", "Solar plus the grid, no battery. Cuts your bill."]] as const).map(([k, t, d]) => (
                                <button key={k} type="button" role="radio" aria-checked={r.solarType === k} onClick={() => setRow(i, { solarType: k })} className={`rounded-lg px-3 py-2 text-left text-xs font-bold ${r.solarType === k ? "bg-card text-primary shadow" : "text-muted-foreground"}`} data-testid={`solar-type-${k}`}>{t}<span className="block text-[11px] font-medium">{d}</span></button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className={lab}>System size</label>
                            <div className="grid grid-cols-5 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="System size">
                              {["2", "3", "5", "8", "10"].map((k) => (
                                <button key={k} type="button" role="radio" aria-checked={r.solarKw === k} onClick={() => setRow(i, { solarKw: k })} className={`rounded-lg py-2 text-xs font-bold ${r.solarKw === k ? "bg-card text-primary shadow" : "text-muted-foreground"}`} data-testid={`solar-kw-${k}`}>{k} kW</button>
                              ))}
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">Not sure? 2-3 kW runs lights, TV and a fridge. 5 kW adds a cooker or water heater. 8-10 kW suits big homes and small businesses.</p>
                          </div>
                          {r.solarType && r.solarType !== "grid" && (
                            <div>
                              <label className={lab}>Battery packs (5 kWh each)</label>
                              <div className="grid grid-cols-5 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Battery packs">
                                {[["", "Advise"], ["1", "1"], ["2", "2"], ["4", "4"], ["6", "6"]].map(([k, t]) => (
                                  <button key={k} type="button" role="radio" aria-checked={(r.solarPacks ?? "") === k} onClick={() => setRow(i, { solarPacks: k })} className={`rounded-lg py-2 text-xs font-bold ${(r.solarPacks ?? "") === k ? "bg-card text-primary shadow" : "text-muted-foreground"}`} data-testid={`solar-packs-${k || "auto"}`}>{t}</button>
                                ))}
                              </div>
                              <p className="mt-1 text-[11px] text-muted-foreground">"Advise" picks the usual number for the size you chose.</p>
                            </div>
                          )}
                          <div>
                            <label className={lab}>Where will the panels go?</label>
                            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Panel position">
                              {([["roof", "On the roof"], ["ground", "On the ground"]] as const).map(([k, t]) => (
                                <button key={k} type="button" role="radio" aria-checked={(r.solarMount ?? "roof") === k} onClick={() => setRow(i, { solarMount: k })} className={`rounded-lg py-2 text-xs font-bold ${(r.solarMount ?? "roof") === k ? "bg-card text-primary shadow" : "text-muted-foreground"}`} data-testid={`solar-mount-${k}`}>{t}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      {isPump(x) && (
                        <div className="mt-3 grid gap-3">
                          <div>
                            <label className={lab}>Power source</label>
                            <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Power source">
                              {([["grid", "Grid"], ["solar", "Solar"], ["generator", "Generator"]] as const).map(([k, t]) => (
                                <button key={k} type="button" role="radio" aria-checked={r.power === k} onClick={() => setRow(i, { power: k })} className={`rounded-lg py-2 text-xs font-bold ${r.power === k ? "bg-card text-primary shadow" : "text-muted-foreground"}`} data-testid={`power-${k}`}>{t}</button>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div><label className={lab} htmlFor={`iq-pdepth-${i}`}>Borehole depth (m)</label><input id={`iq-pdepth-${i}`} inputMode="numeric" value={r.depth} onChange={(e) => setRow(i, { depth: e.target.value.replace(/\D/g, "").slice(0, 3) })} className={inp} placeholder="e.g. 150" /></div>
                            <div><label className={lab} htmlFor={`iq-yield-${i}`}>Yield (litres/hour)</label><input id={`iq-yield-${i}`} inputMode="numeric" value={r.yieldLph} onChange={(e) => setRow(i, { yieldLph: e.target.value.replace(/\D/g, "").slice(0, 5) })} className={inp} placeholder="e.g. 5000" /></div>
                            <div><label className={lab} htmlFor={`iq-static-${i}`}>Static water level (m)</label><input id={`iq-static-${i}`} inputMode="numeric" value={r.staticLevel} onChange={(e) => setRow(i, { staticLevel: e.target.value.replace(/\D/g, "").slice(0, 3) })} className={inp} placeholder="optional" /></div>
                            <div><label className={lab} htmlFor={`iq-pumping-${i}`}>Pumping water level (m)</label><input id={`iq-pumping-${i}`} inputMode="numeric" value={r.pumpingLevel} onChange={(e) => setRow(i, { pumpingLevel: e.target.value.replace(/\D/g, "").slice(0, 3) })} className={inp} placeholder="optional" /></div>
                          </div>
                          <div><label className={lab} htmlFor={`iq-delivery-${i}`}>How high must the water go? (m, to the tank)</label><input id={`iq-delivery-${i}`} inputMode="numeric" value={r.delivery} onChange={(e) => setRow(i, { delivery: e.target.value.replace(/\D/g, "").slice(0, 3) })} className={inp} placeholder="optional, e.g. 20" /></div>
                          <div>
                            <label className={lab}>Does the water carry sand?</label>
                            <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Sand">
                              {([["clear", "No"], ["some", "A little"], ["sandy", "Yes"]] as const).map(([k, t]) => (
                                <button key={k} type="button" role="radio" aria-checked={r.sand === k} onClick={() => setRow(i, { sand: k })} className={`rounded-lg py-2 text-xs font-bold ${r.sand === k ? "bg-card text-primary shadow" : "text-muted-foreground"}`}>{t}</button>
                              ))}
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground">Not sure of the water levels? Leave them empty and we will estimate them. A test pumping report gives the most exact quote.</p>
                        </div>
                      )}
                      {sizesOf(r.sid).length > 0 && (
                        <div className="mt-3">
                          <label className={lab}>Size</label>
                          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3" role="radiogroup" aria-label="Size">
                            {sizesOf(r.sid).map((o) => (
                              <button key={o.label} type="button" role="radio" aria-checked={r.size === o.label} onClick={() => setRow(i, { size: o.label })} className={`rounded-xl border px-3 py-2.5 text-left text-xs font-bold ${r.size === o.label ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground"}`} data-testid={`size-${o.label}`}>
                                {o.label}<span className="block text-[11px] font-semibold text-muted-foreground">{kes(o.price)}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {pm && (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          {!/flush|open\s+(borehole\s+)?drill/i.test(x?.name ?? "") ? (
                          <div>
                            <label className={lab}>Casing</label>
                            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                              {(["pvc", "steel"] as const).map((c) => (
                                <button key={c} type="button" onClick={() => setRow(i, { casing: c })} className={`rounded-lg py-2 text-xs font-bold ${r.casing === c ? "bg-card text-primary shadow" : "text-muted-foreground"}`}>{c === "pvc" ? "PVC" : "Steel"}</button>
                              ))}
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">{kes(r.casing === "steel" ? STEEL_RATE : Math.round(x?.priceFrom ?? 0))} per metre</p>
                          </div>
                          ) : <div className="flex items-end"><p className="text-[11px] text-muted-foreground">{kes(Math.round(x?.priceFrom ?? 0))} per metre</p></div>}
                          <div>
                            <label className={lab} htmlFor={`iq-depth-${i}`}>Depth (metres)</label>
                            <input id={`iq-depth-${i}`} inputMode="numeric" value={r.depth} onChange={(e) => setRow(i, { depth: e.target.value.replace(/\D/g, "").slice(0, 3) })} className={inp} placeholder="e.g. 150" data-testid={i === 0 ? "input-quote-depth" : undefined} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {!contract && rows.length < 6 && rows.length < svcs.length && (
                  <button type="button" onClick={() => setRows((l) => [...l, blank])} className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/50 px-3 py-2.5 text-xs font-bold text-primary">+ Add another service</button>
                )}
                {contract && <IdScanField purpose="contract" value={idScan} onChange={setIdScan} onFill={(f) => { if (f.name) setName(f.name); if (f.idNo) setIdNo(f.idNo); }} />}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className={lab} htmlFor="iq-name">{contract ? "Full name (filled from your ID)" : "Your name"}</label><input id="iq-name" value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="John Kamau" autoComplete="name" data-testid="input-quote-name" /></div>
                  <div><label className={lab} htmlFor="iq-phone">Phone</label><PhoneField id="iq-phone" value={phone} onChange={setPhone} className={inp} testId="input-quote-phone" /></div>
                </div>
                {!contract && !adminKey && rows.length === 1 && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3" data-testid="best-price-help">
                    <p className="text-sm font-extrabold text-foreground">Our best price</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Want a better price than this standard quote? Talk to us and we will agree the best price we can offer.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href="tel:+254719117660" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" data-testid="best-price-call"><Phone className="h-3.5 w-3.5" /> Call us</a>
                      <a href={whatsappLink(`Hello, I would like your best price for ${svcOf(rows[0]!.sid)?.name ?? "a quote"}${Number(rows[0]!.depth) ? `, ${rows[0]!.depth} m` : ""}. My name is ${name || ""}.`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-bold text-white" data-testid="best-price-whatsapp"><MessageSquare className="h-3.5 w-3.5" /> WhatsApp us</a>
                    </div>
                  </div>
                )}
                {!contract && adminKey && rows.length === 1 && (
                  <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2"><label className={lab} htmlFor="iq-best">Our best price {isPm(svcOf(rows[0]!.sid)) ? "per metre (KSh)" : "(KSh total)"} <span className="font-normal text-muted-foreground">(owner only, leave empty for the standard price)</span></label><input id="iq-best" inputMode="numeric" value={best} onChange={(e) => setBest(e.target.value.replace(/\D/g, ""))} className={inp} data-testid="input-best-price" /></div>
                )}
                {!contract && (
                  <div><label className={lab} htmlFor="iq-email-q">Email (we send your quote there)</label><input id="iq-email-q" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} placeholder="you@example.com" autoComplete="email" required data-testid="input-quote-email" /></div>
                )}
                {contract && (
                  <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3" data-testid="contract-client-details">
                    <p className="text-xs font-bold text-foreground">Your details for the contract</p>
                    <p className="-mt-2 text-[11px] text-muted-foreground">These are printed on the contract, so only your signature and stamp are left to add.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label className={lab} htmlFor="iq-id">ID or passport number</label><input id="iq-id" value={idNo} onChange={(e) => setIdNo(e.target.value)} className={inp} placeholder="e.g. 12345678" autoComplete="off" data-testid="input-contract-id" /></div>
                      <div><label className={lab} htmlFor="iq-email">Email (we send the contract and payment updates)</label><input id="iq-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} placeholder="you@example.com" autoComplete="email" data-testid="input-contract-email" /></div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label className={lab} htmlFor="iq-paymode">How will you pay?</label><select id="iq-paymode" value={payMode} onChange={(e) => setPayMode(e.target.value)} className={inp} data-testid="select-pay-mode"><option value="mpesa">M-Pesa (on the website)</option><option value="bank">Bank transfer</option><option value="cheque">Cheque (paid into our bank)</option><option value="cash">Cash (against an official receipt)</option></select></div>
                      <div><label className={lab} htmlFor="iq-siteday">Day you want us on site</label><input id="iq-siteday" type="date" min={new Date().toISOString().slice(0, 10)} value={siteDay} onChange={(e) => setSiteDay(e.target.value)} className={inp} data-testid="input-site-day" /></div>
                    </div>
                    <div><label className={lab} htmlFor="iq-addr">P.O. Box (optional)</label><input id="iq-addr" value={address} onChange={(e) => setAddress(e.target.value)} className={inp} placeholder="e.g. P.O. Box 123-00100, Nairobi" autoComplete="street-address" data-testid="input-contract-address" /></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label className={lab} htmlFor="iq-wname">Witness full name (optional)</label><input id="iq-wname" list="iq-wlist" value={wName} onChange={(e) => setWName(e.target.value)} maxLength={80} className={inp} placeholder="Leave empty if there is no witness" data-testid="input-witness-name" autoComplete="off" /><datalist id="iq-wlist">{savedWitnesses().map((n) => <option key={n} value={n} />)}</datalist></div>
                      {wName.trim() && <div><label className={lab} htmlFor="iq-wrel">How is the witness related to you?</label><RelationSelect id="iq-wrel" value={wRel} onChange={setWRel} className={inp} testId="input-witness-relation" /></div>}
                      {wName.trim() && <div><label className={lab} htmlFor="iq-wid">Witness ID number (optional: the witness can add it)</label><input id="iq-wid" value={wId} onChange={(e) => setWId(e.target.value)} maxLength={20} inputMode="numeric" className={inp} data-testid="input-witness-id" /></div>}
                      {wName.trim() && <div><label className={lab} htmlFor="iq-wphone">Witness phone</label><PhoneField id="iq-wphone" value={wPhone} onChange={setWPhone} className={inp} /></div>}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label className={lab} htmlFor="iq-lname">Lawyer full name (optional)</label><input id="iq-lname" value={lName} onChange={(e) => setLName(e.target.value)} maxLength={80} className={inp} placeholder="Leave empty if there is no lawyer" /></div>
                      {lName.trim() && <div><label className={lab} htmlFor="iq-lphone">Lawyer phone</label><PhoneField id="iq-lphone" value={lPhone} onChange={setLPhone} className={inp} /></div>}
                      {lName.trim() && <div><label className={lab} htmlFor="iq-lid">Lawyer ID (optional)</label><input id="iq-lid" value={lId} onChange={(e) => setLId(e.target.value)} maxLength={20} className={inp} /></div>}
                    </div>
                  </div>
                )}
                <LocationPicker value={place} onChange={setPlace} />
                {anyPm && (
                  <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-xs font-bold text-foreground">Documents (optional)</p>
                    <p className="-mt-2 text-[11px] text-muted-foreground">Have these already? Share them so we can plan your drilling properly. You can skip any of them.</p>
                    <DocUpload label="Hydrogeological survey report" hint="The report from your water survey." value={report} onChange={setReport} onError={setErr} testId="input-quote-report" />
                    <DocUpload label="NEMA permit" hint="Your NEMA approval, if you already have it." value={nema} onChange={setNema} onError={setErr} testId="input-quote-nema" />
                    <DocUpload label="WARMA permit" hint="Your WARMA water permit, if you already have it." value={warma} onChange={setWarma} onError={setErr} testId="input-quote-warma" />
                  </div>
                )}
                {anyPump && (
                  <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3">
                    <DocUpload label="Test pumping report" hint="If you have it, it helps us size the pump exactly." value={pumpDoc} onChange={setPumpDoc} onError={setErr} testId="input-quote-pump-report" />
                  </div>
                )}
                {anyChosen && !anyPump && !anySolar && preview > 0 && (
                  <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3.5 py-2.5 text-sm font-bold text-primary"><Calculator className="h-4 w-4" /> {rows.length > 1 ? "Total about" : "About"} {kes(preview)}</div>
                )}
                {anySolar && <p className="rounded-xl bg-primary/10 px-3.5 py-2.5 text-xs font-bold text-primary">Your solar system is sized and priced from your choices when you press Get my quote.</p>}
                {anyPump && <p className="rounded-xl bg-primary/10 px-3.5 py-2.5 text-xs font-bold text-primary">The pump is sized and priced from your details when you press Get my quote.</p>}
                {contract && cx && (
                  <PayPlanPicker plan={cPlan} setPlan={setCPlan} drill={cKind === "drill" || cKind === "opendrill"} defMob={cKind === "drill" ? 150000 : 90000} maxMob={cKind === "opendrill" ? 100000 : undefined} survey={cKind === "survey"} total={cAgreed} steps={cSteps} setSteps={setCSteps} />
                )}
                {contract && cKind !== "other" && cx && (
                  <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3" data-testid="contract-fields">
                    <p className="text-xs font-bold text-foreground">The agreed price</p>
                    {cKind === "survey" ? (
                      <div><label className={lab} htmlFor="ct-total">Agreed price (KSh)</label><input id="ct-total" inputMode="numeric" value={cTotal} onChange={(e) => setCTotal(e.target.value.replace(/\D/g, "").slice(0, 9))} className={inp} placeholder={`Quoted: ${kes(Math.round(cx.priceFrom ?? 0))}`} data-testid="input-agreed-total" /></div>
                    ) : (
                      <>
                        <div><label className={lab} htmlFor="ct-rate">Agreed price per metre (KSh)</label><input id="ct-rate" inputMode="numeric" value={cRate} onChange={(e) => setCRate(e.target.value.replace(/\D/g, "").slice(0, 6))} className={inp} placeholder="Price we agreed per metre" data-testid="input-agreed-rate" /></div>
                      </>
                    )}
                    <p className="text-[11px] text-muted-foreground">Leave the price empty to use the quoted price.</p>
                    {(() => {
                      // the discount is worked out as soon as the agreed price is typed (the server checks it again)
                      const quoted = priceOf(rows[0]);
                      const agreed = cKind === "survey" ? Number(cTotal) || 0 : (Number(cRate) || 0) * (Number(rows[0]?.depth) || 0);
                      if (!(quoted > 0) || !(agreed > 0)) return null;
                      const off = quoted - agreed;
                      return (
                        <div className="grid grid-cols-3 gap-2 text-center text-[11px]" data-testid="contract-discount">
                          <div className="rounded-lg bg-card px-2 py-1.5"><span className="block text-muted-foreground">Quoted</span><b className="text-xs">{kes(quoted)}</b></div>
                          <div className="rounded-lg bg-card px-2 py-1.5"><span className="block text-muted-foreground">Agreed</span><b className="text-xs">{kes(agreed)}</b></div>
                          <div className="rounded-lg bg-card px-2 py-1.5"><span className="block text-muted-foreground">{off < 0 ? "Above quote" : "Discount"}</span><b className={`text-xs ${off < 0 ? "text-red-600" : "text-emerald-700"}`}>{off < 0 ? kes(-off) : `${kes(off)} (${(off / quoted * 100).toFixed(1).replace(/\.0$/, "")}%)`}</b></div>
                        </div>
                      );
                    })()}
                  </div>
                )}
                {err && <p className="text-xs font-semibold text-red-600" role="alert">{err}</p>}
                <button type="submit" disabled={busy} className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60" data-testid="button-get-quote">{busy ? "Working…" : contract ? "Make my contract" : "Get my quote"}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
