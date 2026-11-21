import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ShieldCheck, FileText, Loader2, CheckCircle2, Upload, Landmark, Smartphone, ArrowRight, AlertTriangle, Plus, Trash2, Building2, User } from "lucide-react";
import PageBanner from "@/components/PageBanner";
import LocationPicker, { type Place } from "@/components/LocationPicker";
import { API, kes } from "@/lib/member";
import { KENYA_COUNTIES } from "@/lib/utils";
import IdScanField from "@/components/IdScanField";
import type { ScanResult } from "@/components/IdScanner";
import { PhoneField } from "@/components/PhoneField";

const inp = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25";
const lab = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const FEES = { warma: 28000, nema: 35000, both: 63000 } as const;
type Mode = "apply" | "self";
type Permits = "warma" | "nema" | "both";

// Shrinks a phone photo to about 150-300 KB before it is sent (IDs and title deeds are big).
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Please choose a photo (JPG or PNG).")); i.src = url; });
    const s = Math.min(1, 1500 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.78, out = c.toDataURL("image/jpeg", q);
    while (out.length > 1_200_000 && q > 0.4) { q -= 0.12; out = c.toDataURL("image/jpeg", q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}

const WARMA_SAMPLES = ["/images/sample-warma-1.webp", "/images/sample-warma-2.webp", "/images/sample-warma-3.webp"];
const NEMA_SAMPLES = ["/images/sample-nema.webp", "/images/sample-nema-approval.webp", "/images/sample-nema-3.webp"];

// A stack of three sample papers: they slide through by themselves, tap one to see it big.
function Sampler({ title, tone, images, onOpen }: { title: string; tone: string; images: string[]; onOpen: (list: string[], i: number) => void }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setI((x) => (x + 1) % images.length), 3600); return () => window.clearInterval(t); }, [images.length]);
  return (
    <div className="min-w-0">
      <p className={`mb-2 inline-block rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white ${tone}`}>{title}</p>
      <button type="button" onClick={() => onOpen(images, i)} className="relative block aspect-[3/4] w-full overflow-hidden rounded-2xl border bg-white shadow-[0_14px_30px_-12px_rgba(15,23,42,.45)] ring-1 ring-black/5 transition active:scale-[0.98]" aria-label={`${title} sample, tap to enlarge`}>
        {images.map((src, k) => (
          <img key={src} src={src} alt={`${title} sample ${k + 1}`} loading="lazy" className={`absolute inset-0 h-full w-full object-cover object-top transition-all duration-700 ${k === i ? "translate-x-0 scale-100 opacity-100" : k < i ? "-translate-x-6 scale-95 opacity-0" : "translate-x-6 scale-95 opacity-0"}`} />
        ))}
        <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">Tap to enlarge</span>
      </button>
      <div className="mt-2 flex justify-center gap-1.5">{images.map((_, k) => <button key={k} type="button" onClick={() => setI(k)} aria-label={`Sample ${k + 1}`} className={`h-1.5 rounded-full transition-all ${k === i ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`} />)}</div>
    </div>
  );
}

function Photo({ label, hint, value, onPick }: { label: string; hint?: string; value: string; onPick: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className={lab}>{label}</label>
      <button type="button" onClick={() => ref.current?.click()} className={`flex h-24 w-full items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed text-xs font-bold transition ${value ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-primary/40 bg-background text-primary"}`}>
        {value ? <><img src={value} alt="" className="h-full w-24 object-cover" /> <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Added. Tap to change</span></> : <><Upload className="h-4 w-4" /> Tap to take or choose a photo</>}
      </button>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
    </div>
  );
}

export default function Permits() {
  const [step, setStep] = useState<"intro" | "form" | "pay" | "done">("intro");
  const [mode, setMode] = useState<Mode>("apply"), [permits, setPermits] = useState<Permits>("both");
  const [f, setF] = useState({ name: "", phone: "", phone2: "", email: "", county: "", subLocation: "", location: "", ward: "", village: "", kraPin: "A0", idNo: "" });
  const [idScan, setIdScan] = useState<ScanResult | null>(null);
  // a borehole for a company: company details, its directors (as many as it has) and its shareholders
  const [who, setWho] = useState<"person" | "company">("person");
  const [co, setCo] = useState({ name: "", regNo: "", address: "" });
  type Dir = { name: string; idNo: string; kraPin: string; scan: ScanResult | null };
  const [dirs, setDirs] = useState<Dir[]>([{ name: "", idNo: "", kraPin: "A0", scan: null }]);
  const [shs, setShs] = useState<{ name: string; pct: string }[]>([{ name: "", pct: "" }]);
  const isCo = mode === "apply" && who === "company";
  const setDir = (i: number, v: Partial<Dir>) => setDirs((a) => a.map((d, k) => (k === i ? { ...d, ...v } : d)));
  const pctTotal = shs.reduce((t, x) => t + (Number(x.pct) || 0), 0);
  const pickWho = (w: "person" | "company") => { setWho(w); setErr(""); setF((x) => ({ ...x, kraPin: w === "company" ? "P0" : "A0" })); };
  const [place, setPlace] = useState<Place>({ text: "", lat: null, lng: null });
  const [files, setFiles] = useState<Record<string, string>>({});
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [box, setBox] = useState<{ list: string[]; i: number } | null>(null);
  const [app, setApp] = useState<{ token: string; ref: string; fee: number; item: string } | null>(null);
  const [cfg, setCfg] = useState<{ mpesa: boolean; banks: { bankName: string; accountName: string; accountNumber: string }[] }>({ mpesa: false, banks: [] });
  const [method, setMethod] = useState<"mpesa" | "bank">("mpesa"), [bankRef, setBankRef] = useState(""), [pstate, setPstate] = useState<"" | "wait" | "paid" | "sent">("");
  const poll = useRef<number | undefined>(undefined);
  // keep the form (and the ID and photos) so a refresh or coming back never loses it
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem("kws_permit_draft") || "null");
      if (d && d.step === "form") { setStep("form"); if (d.mode) setMode(d.mode); if (d.permits) setPermits(d.permits); if (d.f) setF((x) => ({ ...x, ...d.f })); if (d.place) setPlace(d.place); }
    } catch { /* ignore */ }
    try { const i = JSON.parse(localStorage.getItem("kws_permit_imgs") || "null"); if (i?.files) setFiles(i.files); } catch { /* ignore */ }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try { if (step === "form") localStorage.setItem("kws_permit_draft", JSON.stringify({ step, mode, permits, f, place })); else if (step === "done" || step === "pay") { localStorage.removeItem("kws_permit_draft"); localStorage.removeItem("kws_permit_imgs"); sessionStorage.removeItem("kws_idscan:/permits"); } } catch { /* ignore */ }
  }, [step, mode, permits, f, place]);
  useEffect(() => {
    if (!loaded.current || step === "done" || step === "pay") return;
    try { localStorage.setItem("kws_permit_imgs", JSON.stringify({ files })); } catch { /* too big: the typed details are still kept */ }
  }, [files, step]);
  // documents saved from a report order (same phone link) are reused here
  const wallet = (): { phone: string; key: string } | null => { try { const v = JSON.parse(localStorage.getItem("dighaz-report-wallet") ?? "null"); return v?.phone && v?.key ? v : null; } catch { return null; } };
  useEffect(() => {
    const w = wallet(); if (!w) return;
    fetch(`${API}/api/my-docs?phone=${encodeURIComponent(w.phone)}&key=${encodeURIComponent(w.key)}`).then((r) => (r.ok ? r.json() : {})).then((j: Record<string, string>) => {
      setFiles((x) => ({ ...x, ...(j.land && !x.land ? { land: j.land } : {}), ...(j.kra && !x.kra ? { kra: j.kra } : {}) }));
    }).catch(() => {});
  }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  useEffect(() => { fetch(`${API}/api/payments/config`).then((r) => r.json()).then((d) => setCfg({ mpesa: !!d.mpesa, banks: d.banks ?? [] })).catch(() => {}); return () => window.clearInterval(poll.current); }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  const pick = (kind: string) => async (file: File) => { try { setErr(""); const d = await shrink(file); setFiles((x) => ({ ...x, [kind]: d })); } catch (e) { setErr((e as Error).message); } };
  const fee = mode === "apply" ? FEES[permits] : 0;

  const submit = async () => {
    setErr("");
    if (f.name.trim().length < 3) return setErr("Enter your full names.");
    if (f.phone.replace(/\D/g, "").length < 9) return setErr("Enter your phone number.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setErr("Email is required. Enter your email address.");
    if (mode === "apply" && !isCo && !/^A0\d{8}[A-Z]$/.test(f.kraPin.trim().toUpperCase())) return setErr("KRA PIN is required. Personal PINs start with A0, like A012345678B.");
    if (isCo) {
      if (co.name.trim().length < 3) return setErr("Enter the company name exactly as registered.");
      if (co.regNo.trim().length < 3) return setErr("Enter the company registration number.");
      if (!/^P0\d{8}[A-Z]$/.test(f.kraPin.trim().toUpperCase())) return setErr("The company KRA PIN is required. Company PINs start with P0, like P012345678B.");
      if (!files.co_cert || !files.co_kra || !files.co_cr12) return setErr("Add the Certificate of Incorporation, the company KRA PIN certificate and the CR12.");
      for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i];
        if (d.name.trim().length < 3 || d.idNo.replace(/[^A-Za-z0-9]/g, "").length < 5) return setErr(`Director ${i + 1}: enter the name and ID number (or scan the ID).`);
        if (!d.scan) return setErr(`Director ${i + 1}: scan the ID (front and back).`);
        if (d.kraPin.trim().length > 2 && !/^A0\d{8}[A-Z]$/.test(d.kraPin.trim().toUpperCase())) return setErr(`Director ${i + 1}: the KRA PIN must start with A0, like A012345678B.`);
      }
      if (shs.some((x) => x.name.trim().length < 3 || !(Number(x.pct) > 0))) return setErr("List each shareholder with the percentage they own.");
      if (!files.land) return setErr("Add the land proof (title deed in the company's name, a lease, or the owner's consent letter).");
    } else if (mode === "apply") {
      if (f.idNo.replace(/[^A-Za-z0-9]/g, "").length < 5) return setErr("Enter your ID number.");
      if (!idScan) return setErr("Scan your ID (front and back). Use the Scan your ID button.");
      if (!files.land) return setErr("Add your land proof (title deed, plot number or chief's letter).");
    } else if (!files.cert_warma && !files.cert_nema) return setErr("Add your WARMA or NEMA certificate.");
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/permits`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, permits, ...f, kraPin: f.kraPin.trim(), applicant: isCo ? "company" : "person", company: isCo ? { ...co, directors: dirs.map(({ scan: _s, ...d }) => d), shareholders: shs.map((x) => ({ name: x.name, pct: Number(x.pct) })) } : undefined, idMatch: idScan?.match, idSource: idScan?.source, lat: place.lat, lng: place.lng, placeText: place.text }) });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Could not save.");
      for (const [kind, data] of Object.entries(isCo ? { ...files, ...Object.fromEntries(dirs.flatMap((d, i) => [[`dir${i}_front`, d.scan!.front], [`dir${i}_back`, d.scan!.back]])) } : mode === "apply" && idScan ? { ...files, id_front: idScan.front, id_back: idScan.back } : files)) {
        const u = await fetch(`${API}/api/permits/${d.token}/file`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, data }) });
        if (!u.ok) throw new Error((await u.json().catch(() => ({}))).error || "A photo could not be saved. Try again.");
      }
      const w = wallet(); // remember the documents for next time (optional, only for someone with a report link)
      if (w) for (const [k, v] of Object.entries({ land: files.land, kra: files.kra, id_front: !isCo && idScan ? idScan.front : "", id_back: !isCo && idScan ? idScan.back : "" })) { if (v) fetch(`${API}/api/my-docs/${k}?phone=${encodeURIComponent(w.phone)}&key=${encodeURIComponent(w.key)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: v }) }).catch(() => {}); }
      const dn = await fetch(`${API}/api/permits/${d.token}/done`, { method: "POST" }); if (!dn.ok) throw new Error((await dn.json().catch(() => ({}))).error || "Something went wrong.");
      setApp(d); setStep(d.fee > 0 ? "pay" : "done");
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  const pay = async () => {
    if (!app) return; setErr(""); setBusy(true);
    try {
      const body = { phone: f.phone, name: f.name.trim(), email: f.email.trim(), kind: "service", item: app.item, payType: "full", amount: app.fee, agreedTotal: app.fee, bankRef: method === "bank" ? bankRef : undefined };
      const r = await fetch(`${API}/api/payments/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Could not start the payment.");
      if (method === "bank") { setPstate("sent"); return; }
      setPstate("wait"); let n = 0;
      poll.current = window.setInterval(async () => {
        n++; const s = await fetch(`${API}/api/payments/${d.id}/status?key=${encodeURIComponent(d.key ?? "")}`).then((x) => x.json()).catch(() => ({}));
        if (s.status === "paid") { window.clearInterval(poll.current); setPstate("paid"); } else if (s.status === "failed" || n > 40) { window.clearInterval(poll.current); setPstate(""); setErr("The payment was not completed. You can try again."); }
      }, 3000);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <div>
      <PageBanner eyebrow="Permits" title="WARMA & NEMA permits" description="We can apply for the permits for you, or you upload the ones you already have." />
      <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
        {step === "intro" && (
          <>
            <div className="overflow-hidden rounded-3xl border bg-card shadow-sm" data-testid="permits-intro">
              <div className="bg-gradient-to-br from-slate-900 via-sky-900 to-emerald-700 px-4 py-4 text-white">
                <p className="flex items-center gap-2 text-base font-extrabold"><ShieldCheck className="h-5 w-5 text-emerald-300" /> The two permits</p>
                <p className="mt-1 text-xs text-white/80">Every borehole in Kenya needs both. Here is the short version.</p>
              </div>
              <div className="grid gap-3 p-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50 to-white p-3 text-[13px] dark:border-sky-900 dark:from-sky-950/40 dark:to-transparent"><p className="mb-1 font-extrabold text-sky-800 dark:text-sky-200">WARMA</p>
                  <p className="mb-1.5 text-[12px] text-muted-foreground">The water permit. It says you may drill and take water from the ground.</p>
                  <ul className="list-disc space-y-0.5 pl-4"><li><b>What:</b> permit to drill and use water.</li><li><b>Why:</b> the law needs it for every borehole.</li><li><b>Importance:</b> no fines, no stopped site.</li></ul></div>
                <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-3 text-[13px] dark:border-emerald-900 dark:from-emerald-950/40 dark:to-transparent"><p className="mb-1 font-extrabold text-emerald-800 dark:text-emerald-200">NEMA</p>
                  <p className="mb-1.5 text-[12px] text-muted-foreground">The environment approval. It shows the borehole is safe for your land and neighbours.</p>
                  <ul className="list-disc space-y-0.5 pl-4"><li><b>What:</b> environment approval.</li><li><b>Why:</b> checks the borehole will not harm land or water.</li><li><b>Importance:</b> keeps your borehole legal and safe to sell or upgrade.</li></ul></div>
              </div>
              <div className="border-t bg-muted/30 px-3 pb-3 pt-3">
                <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground">Previous clients' permits</p>
                <div className="grid grid-cols-2 gap-3"><Sampler title="WARMA" tone="bg-sky-700" images={WARMA_SAMPLES} onOpen={(list, k) => setBox({ list, i: k })} /><Sampler title="NEMA" tone="bg-emerald-700" images={NEMA_SAMPLES} onOpen={(list, k) => setBox({ list, i: k })} /></div>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">Samples only. Client details are hidden.</p>
              </div>
            </div>
            <button type="button" onClick={() => { setMode("apply"); setStep("form"); }} className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 p-4 pr-12 text-left text-white shadow-lg transition active:scale-[0.99]" data-testid="button-permit-apply">
              <p className="text-base font-extrabold">Apply for me</p><p className="text-xs text-white/85">We send your application. You pay only the government fee.</p>
              <ArrowRight className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 transition group-hover:translate-x-1" />
            </button>
            <button type="button" onClick={() => { setMode("self"); setStep("form"); }} className="w-full rounded-2xl border-2 border-primary/30 bg-card p-4 text-left transition active:scale-[0.99]" data-testid="button-permit-self">
              <p className="text-base font-extrabold text-primary">I applied myself</p><p className="text-xs text-muted-foreground">Just upload your WARMA or NEMA certificate so we have it for your job.</p>
            </button>
          </>
        )}

        {step === "form" && (
          <div className="space-y-4 rounded-2xl border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-extrabold"><FileText className="h-4 w-4 text-primary" /> {mode === "apply" ? "Your details" : "Your details and certificates"}</p>
            <button type="button" onClick={() => { setErr(""); setMode(mode === "apply" ? "self" : "apply"); }} className="w-full rounded-xl border-2 border-primary/40 px-3 py-2 text-xs font-extrabold text-primary transition active:scale-[0.98]" data-testid="button-permit-switch">
              {mode === "apply" ? "I already have the permits: switch" : "I need you to apply for me: switch"}
            </button>
            {mode === "apply" && (
              <div><label className={lab}>Which permit?</label>
                <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold">{(["warma", "nema", "both"] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setPermits(p)} className={`rounded-xl border px-2 py-2.5 ${permits === p ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{p === "both" ? "Both" : p.toUpperCase()}<br /><span className="font-semibold opacity-80">{kes(FEES[p])}</span></button>))}</div>
              </div>
            )}
            {mode === "apply" && (
              <div><label className={lab}>Who is the borehole for?</label>
                <div className="grid grid-cols-2 gap-2 text-center text-xs font-bold">
                  <button type="button" onClick={() => pickWho("person")} data-testid="who-person" className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-3 ${who === "person" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}><User className="h-4 w-4" /> Personal</button>
                  <button type="button" onClick={() => pickWho("company")} data-testid="who-company" className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-3 ${who === "company" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}><Building2 className="h-4 w-4" /> Company</button>
                </div>
                {isCo && <p className="mt-1 text-[11px] text-muted-foreground">We apply in the company's name. Have the company papers and each director's ID ready.</p>}
              </div>
            )}
            {mode === "apply" && !isCo && <IdScanField purpose="permit application" value={idScan} onChange={setIdScan} onFill={(r) => setF((x) => ({ ...x, name: r.name || x.name, idNo: r.idNo || x.idNo }))} />}
            <div><label className={lab} htmlFor="pm-name">{isCo ? "Your name (the person applying)" : "Full names"}</label><input id="pm-name" value={f.name} onChange={set("name")} className={inp} autoComplete="name" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={lab} htmlFor="pm-ph">Phone</label><PhoneField id="pm-ph" value={f.phone} onChange={(v) => setF((x) => ({ ...x, phone: v }))} className={inp} /></div>
              <div><label className={lab} htmlFor="pm-ph2">Second phone (optional)</label><PhoneField id="pm-ph2" value={f.phone2} onChange={(v) => setF((x) => ({ ...x, phone2: v }))} className={inp} /></div>
            </div>
            <div><label className={lab} htmlFor="pm-em">Email (required)</label><input id="pm-em" type="email" value={f.email} onChange={set("email")} className={inp} autoComplete="email" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={lab} htmlFor="pm-county">County</label><select id="pm-county" value={f.county} onChange={set("county")} className={inp}><option value="">Choose</option>{KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label className={lab} htmlFor="pm-ward">Ward</label><input id="pm-ward" value={f.ward} onChange={set("ward")} className={inp} /></div>
              <div><label className={lab} htmlFor="pm-loc">Location</label><input id="pm-loc" value={f.location} onChange={set("location")} className={inp} /></div>
              <div><label className={lab} htmlFor="pm-sub">Sub-location</label><input id="pm-sub" value={f.subLocation} onChange={set("subLocation")} className={inp} /></div>
            </div>
            <div><label className={lab} htmlFor="pm-vil">Village or area</label><input id="pm-vil" value={f.village} onChange={set("village")} className={inp} /></div>
            <div><label className={lab}>Pin the land on the map</label><LocationPicker value={place} onChange={setPlace} /></div>
            {mode === "apply" && (
              <>
                <div><label className={lab}>What will the water be used for?</label>
                  <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">Family (domestic) use<p className="text-[11px] font-semibold text-emerald-800">Recommended: start here, you can upgrade later.</p></div></div>
                <div><label className={lab} htmlFor="pm-kra">{isCo ? "Company KRA PIN (starts with P0)" : "KRA PIN (starts with A0)"}</label><input id="pm-kra" value={f.kraPin} onChange={(e) => setF((v) => ({ ...v, kraPin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }))} maxLength={11} className={inp} placeholder="A012345678B" autoCapitalize="characters" /></div>
                {isCo && (
                  <div className="space-y-3 rounded-2xl border-2 border-primary/25 bg-primary/5 p-3" data-testid="company-block">
                    <p className="flex items-center gap-1.5 text-xs font-extrabold text-primary"><Building2 className="h-4 w-4" /> Company details</p>
                    <div><label className={lab} htmlFor="co-name">Company name (as registered)</label><input id="co-name" value={co.name} onChange={(e) => setCo({ ...co, name: e.target.value })} maxLength={120} className={inp} /></div>
                    <div><label className={lab} htmlFor="co-reg">Registration number</label><input id="co-reg" value={co.regNo} onChange={(e) => setCo({ ...co, regNo: e.target.value })} maxLength={40} className={inp} placeholder="e.g. PVT-ABC123" /></div>
                    <div><label className={lab} htmlFor="co-addr">Company address</label><input id="co-addr" value={co.address} onChange={(e) => setCo({ ...co, address: e.target.value })} maxLength={160} className={inp} placeholder="Postal or physical address" /></div>
                    <Photo label="Certificate of Incorporation" value={files.co_cert ?? ""} onPick={pick("co_cert")} />
                    <Photo label="Company KRA PIN certificate" value={files.co_kra ?? ""} onPick={pick("co_kra")} />
                    <Photo label="CR12 (directors and shareholders)" hint="The official company search showing directors and shareholders." value={files.co_cr12 ?? ""} onPick={pick("co_cr12")} />
                    <div className="space-y-2">
                      <p className="text-xs font-extrabold">Directors</p>
                      {dirs.map((d, i) => (
                        <div key={i} className="space-y-2 rounded-xl border bg-card p-3" data-testid={`director-${i}`}>
                          <div className="flex items-center justify-between"><b className="text-xs">Director {i + 1}</b>{dirs.length > 1 && <button type="button" onClick={() => setDirs((a) => a.filter((_, k) => k !== i))} className="flex items-center gap-1 text-[11px] font-bold text-red-600"><Trash2 className="h-3.5 w-3.5" /> Remove</button>}</div>
                          <IdScanField purpose="permit application" value={d.scan} onChange={(v) => setDir(i, { scan: v })} onFill={(r) => setDir(i, { name: r.name || d.name, idNo: r.idNo || d.idNo })} />
                          <div><label className={lab}>Full names</label><input value={d.name} onChange={(e) => setDir(i, { name: e.target.value })} maxLength={80} className={inp} /></div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div><label className={lab}>ID number</label><input value={d.idNo} onChange={(e) => setDir(i, { idNo: e.target.value })} maxLength={20} className={inp} /></div>
                            <div><label className={lab}>KRA PIN (starts with A0)</label><input value={d.kraPin} onChange={(e) => setDir(i, { kraPin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} maxLength={11} className={inp} placeholder="A012345678B" autoCapitalize="characters" /></div>
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={() => setDirs((a) => (a.length >= 20 ? a : [...a, { name: "", idNo: "", kraPin: "A0", scan: null }]))} data-testid="add-director" className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary/50 px-3 py-2.5 text-xs font-extrabold text-primary"><Plus className="h-4 w-4" /> Add director</button>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-extrabold">Shareholders</p>
                      {shs.map((x, i) => (
                        <div key={i} className="grid grid-cols-[1fr_5rem_auto] items-end gap-2" data-testid={`shareholder-${i}`}>
                          <div><label className={lab}>Name</label><input value={x.name} onChange={(e) => setShs((a) => a.map((y, k) => (k === i ? { ...y, name: e.target.value } : y)))} maxLength={80} className={inp} /></div>
                          <div><label className={lab}>Share %</label><input value={x.pct} onChange={(e) => setShs((a) => a.map((y, k) => (k === i ? { ...y, pct: e.target.value.replace(/[^\d.]/g, "").slice(0, 5) } : y)))} inputMode="decimal" className={inp} placeholder="50" /></div>
                          {shs.length > 1 ? <button type="button" onClick={() => setShs((a) => a.filter((_, k) => k !== i))} aria-label="Remove shareholder" className="mb-1 rounded-lg p-2 text-red-600"><Trash2 className="h-4 w-4" /></button> : <span />}
                        </div>
                      ))}
                      <button type="button" onClick={() => setShs((a) => (a.length >= 40 ? a : [...a, { name: "", pct: "" }]))} data-testid="add-shareholder" className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary/50 px-3 py-2.5 text-xs font-extrabold text-primary"><Plus className="h-4 w-4" /> Add shareholder</button>
                      <p className={`text-[11px] font-semibold ${Math.round(pctTotal * 100) === 10000 ? "text-emerald-700" : "text-sky-700"}`}>Total shares: {Math.round(pctTotal * 100) / 100}%{Math.round(pctTotal * 100) === 10000 ? "" : " (should add up to 100%)"}</p>
                    </div>
                    <Photo label="Authority letter (only if you are not a director)" hint="A letter or board resolution allowing you to apply for the company." value={files.co_auth ?? ""} onPick={pick("co_auth")} />
                  </div>
                )}
                {!isCo && (<div><label className={lab} htmlFor="pm-idno">ID number</label><input id="pm-idno" value={f.idNo} onChange={set("idNo")} maxLength={20} className={inp} placeholder="e.g. 12345678" autoComplete="off" /></div>)}
                <Photo label="Land proof" hint="Title deed, plot number, or chief's letter (for family land)." value={files.land ?? ""} onPick={pick("land")} />
              </>
            )}
            {mode === "self" && (
              <div className="grid gap-3 sm:grid-cols-2"><Photo label="WARMA certificate" value={files.cert_warma ?? ""} onPick={pick("cert_warma")} /><Photo label="NEMA certificate" value={files.cert_nema ?? ""} onPick={pick("cert_nema")} /></div>
            )}
            <p className="text-[11px] text-muted-foreground">Your documents are private. Only our office sees them.</p>
            {err && <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600" role="alert"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {err}</p>}
            <button type="button" disabled={busy} onClick={() => void submit()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-sm font-extrabold text-primary-foreground shadow-lg disabled:opacity-60" data-testid="button-permit-submit">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : mode === "apply" ? `Continue to pay ${kes(fee)}` : "Send my certificates"}
            </button>
            <button type="button" onClick={() => setStep("intro")} className="w-full text-center text-xs font-semibold text-muted-foreground underline">Back</button>
          </div>
        )}

        {step === "pay" && app && (
          <div className="space-y-4 rounded-2xl border bg-card p-4">
            <p className="text-sm font-extrabold">Pay the government fee</p>
            <div className="rounded-xl bg-muted/50 p-3 text-sm"><div className="flex justify-between"><span>{permits === "both" ? "WARMA + NEMA" : permits.toUpperCase()}</span><b>{kes(app.fee)}</b></div><p className="mt-1 text-[11px] text-muted-foreground">This goes to the government. Reference {app.ref}.</p></div>
            {pstate === "paid" ? (
              <p className="flex items-center gap-2 text-sm font-extrabold text-emerald-700"><CheckCircle2 className="h-5 w-5" /> Payment received. We are on it.</p>
            ) : pstate === "sent" ? (
              <p className="text-sm font-bold text-emerald-700">We received your payment details. We are confirming them now.</p>
            ) : pstate === "wait" ? (
              <p className="flex items-center gap-2 text-sm font-bold"><Loader2 className="h-4 w-4 animate-spin" /> Check your phone and enter your M-Pesa PIN...</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  {cfg.mpesa && <button type="button" onClick={() => setMethod("mpesa")} className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 ${method === "mpesa" ? "border-primary bg-primary text-primary-foreground" : ""}`}><Smartphone className="h-4 w-4" /> M-Pesa</button>}
                  <button type="button" onClick={() => setMethod("bank")} className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 ${method === "bank" || !cfg.mpesa ? "border-primary bg-primary text-primary-foreground" : ""}`}><Landmark className="h-4 w-4" /> Bank</button>
                </div>
                {(method === "bank" || !cfg.mpesa) && (
                  <div className="space-y-2 text-xs">{cfg.banks.map((b) => <p key={b.accountNumber} className="rounded-lg border p-2">{b.bankName} · {b.accountName} · <b>{b.accountNumber}</b></p>)}
                    <label className={lab} htmlFor="pm-bref">Paste the bank message or reference</label><input id="pm-bref" value={bankRef} onChange={(e) => setBankRef(e.target.value)} className={inp} /></div>
                )}
                {err && <p className="text-xs font-semibold text-red-600" role="alert">{err}</p>}
                <button type="button" disabled={busy} onClick={() => { if (!cfg.mpesa) setMethod("bank"); void pay(); }} className="w-full rounded-2xl bg-primary px-5 py-3.5 text-sm font-extrabold text-primary-foreground disabled:opacity-60">{busy ? "Please wait..." : `Pay ${kes(app.fee)}`}</button>
              </>
            )}
            <p className="text-center text-[11px] text-muted-foreground">Ref {app.ref}. Drilling soon? <Link href="/quote" className="font-bold text-primary underline">Get your drilling quote</Link></p>
          </div>
        )}

        {step === "done" && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
            <p className="font-extrabold text-emerald-900">Thank you. We have your documents.</p>
            <Link href="/quote" className="mt-3 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground">Get your drilling quote</Link>
          </div>
        )}
        {box && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4" onClick={() => setBox(null)}>
            <img src={box.list[box.i]} alt="Sample permit" className="max-h-[80vh] max-w-full rounded-lg shadow-2xl" />
            <div className="mt-3 flex items-center gap-4 text-sm font-bold text-white" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => setBox({ ...box, i: (box.i + box.list.length - 1) % box.list.length })} className="rounded-full bg-white/15 px-4 py-1.5">Previous</button>
              <span>{box.i + 1} / {box.list.length}</span>
              <button type="button" onClick={() => setBox({ ...box, i: (box.i + 1) % box.list.length })} className="rounded-full bg-white/15 px-4 py-1.5">Next</button>
            </div>
            <p className="mt-2 text-xs text-white/70">Tap anywhere to close</p>
          </div>
        )}
      </div>
    </div>
  );
}
