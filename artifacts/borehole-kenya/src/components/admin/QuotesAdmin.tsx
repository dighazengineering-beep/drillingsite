import { surveyFirst } from "@/lib/order";
import { useEffect, useMemo, useState } from "react";
import { Trash2, Copy, MessageCircle, Printer, Plus } from "lucide-react";
import { API, kes, docUrl } from "@/lib/member";
import { copyText } from "@/lib/copy";
import QuoteTemplatesAdmin from "./QuoteTemplatesAdmin";
import { PhoneField } from "@/components/PhoneField";

interface Svc { id: number; name: string; priceFrom: number | null; priceUnit: string | null }
interface Quote { id: number; token: string; name: string; phone: string; item: string; casing: string; depth: number; rate: number; total: number; depositPct: number; note: string; validDays: number; source?: string; size?: string; itemised?: boolean; location?: string; lat?: number | null; lng?: number | null; reportUrl?: string; nemaUrl?: string; warmaUrl?: string; pumpReportUrl?: string; customPrice?: boolean; agreedTotal?: number | null; createdAt: string }
const STEEL_RATE = 6500;
const inp = "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30";
const lab = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground";
const num = (v: string) => Number(String(v).replace(/[^\d.]/g, "")) || 0;

export default function QuotesAdmin({ adminKey, onBadAdmin }: { adminKey: string; onBadAdmin: () => void }) {
  const h = { "x-admin-key": adminKey, "content-type": "application/json" };
  const [svcs, setSvcs] = useState<Svc[]>([]);
  const [rows, setRows] = useState<Quote[] | null>(null);
  const [item, setItem] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [casing, setCasing] = useState<"pvc" | "steel">("pvc");
  const [depth, setDepth] = useState("");
  const [total, setTotal] = useState("");
  const [totalTouched, setTotalTouched] = useState(false);
  const [pct, setPct] = useState("70");
  const [note, setNote] = useState("");
  const [days, setDays] = useState("14");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(0);
  const [tab, setTab] = useState<"quotes" | "lines">("quotes");
  const [opts, setOpts] = useState<Record<string, { label: string; price: number }[]>>({});
  const [size, setSize] = useState("");

  const load = () =>
    fetch(`${API}/api/admin/quotes`, { headers: h })
      .then((r) => { if (r.status === 403) { onBadAdmin(); throw new Error("403"); } return r.json(); })
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows((l) => l ?? []));
  useEffect(() => {
    load();
    fetch(`${API}/api/services`).then((r) => r.json()).then((d) => setSvcs(Array.isArray(d) ? surveyFirst(d) : [])).catch(() => {});
    fetch(`${API}/api/quote-options`).then((r) => r.json()).then((d) => setOpts(d && typeof d === "object" ? d : {})).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = svcs.find((s) => s.name === item);
  const sizes = chosen ? opts[String(chosen.id)] ?? [] : [];
  const sized = sizes.length > 0;
  const perMetre = !sized && /metre|meter/i.test(chosen?.priceUnit ?? "");
  const rate = perMetre ? (casing === "steel" && !/flush|open\s+(borehole\s+)?drill/i.test(item) ? STEEL_RATE : Math.round(chosen?.priceFrom ?? 0)) : 0;
  const auto = sized ? sizes.find((o) => o.label === size)?.price ?? 0 : perMetre ? rate * num(depth) : Math.round(chosen?.priceFrom ?? 0);
  const shownTotal = totalTouched ? total : auto ? String(auto) : "";
  useEffect(() => { setTotalTouched(false); setTotal(""); }, [item, casing, depth, size]);

  const linkOf = (q: Quote) => docUrl(`/api/quotes/${q.token}/page?site=${encodeURIComponent(window.location.origin)}`);
  const create = async () => {
    setErr("");
    if (!item) return setErr("Choose the service.");
    if (sized && !size) return setErr("Choose the size.");
    if (perMetre && !num(depth)) return setErr("Enter the depth in metres.");
    if (!num(shownTotal)) return setErr("Enter the price.");
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/admin/quotes`, { method: "POST", headers: h, body: JSON.stringify({ item, size: sized ? size : "", name, phone, casing: perMetre ? casing : "", depth: perMetre ? num(depth) : 0, rate, total: num(shownTotal), depositPct: num(pct), note, validDays: num(days) }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 403) { onBadAdmin(); return; }
      if (!r.ok) throw new Error(d.error || "Could not save.");
      setRows((l) => [d, ...(l ?? [])]);
      setName(""); setPhone(""); setDepth(""); setNote(""); setTotalTouched(false); setTotal("");
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const [bp, setBp] = useState<Record<number, string>>({});
  const saveBest = async (q: Quote, clear = false) => {
    setErr("");
    const r = await fetch(`${API}/api/admin/quotes/${q.id}/best`, { method: "PUT", headers: h, body: JSON.stringify({ price: clear ? 0 : Number(bp[q.id]) || 0 }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error || "Could not save."); return; }
    setBp((m) => ({ ...m, [q.id]: "" })); load();
  };
  const del = async (q: Quote) => {
    if (!window.confirm(`Delete quote QT-${String(q.id).padStart(5, "0")}?`)) return;
    await fetch(`${API}/api/admin/quotes/${q.id}`, { method: "DELETE", headers: h });
    setRows((l) => (l ?? []).filter((x) => x.id !== q.id));
  };
  const copy = async (q: Quote) => {
    try { if (!(await copyText(linkOf(q)))) throw new Error("no"); setCopied(q.id); window.setTimeout(() => setCopied(0), 1800); } catch { window.prompt("Copy this link", linkOf(q)); }
  };
  const wa = (q: Quote) => {
    const msg = `Hello${q.name ? ` ${q.name.split(" ")[0]}` : ""}, here is your quotation from Dighaz Engineering Limited for ${q.item}: ${kes(q.total)}. You can open or download it here: ${linkOf(q)}`;
    return `https://wa.me/${q.phone || ""}?text=${encodeURIComponent(msg)}`;
  };
  const sorted = useMemo(() => rows ?? [], [rows]);

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {([["quotes", "Quotes"], ["lines", "Quote lines"]] as const).map(([k, v]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-lg py-1.5 text-xs font-bold ${tab === k ? "bg-card text-primary shadow" : "text-muted-foreground"}`}>{v}</button>
        ))}
      </div>
      {tab === "lines" ? <QuoteTemplatesAdmin adminKey={adminKey} onBadAdmin={onBadAdmin} /> : (<>
      <div className="rounded-2xl border border-border bg-muted/30 p-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={lab}>Service</label>
            <select value={item} onChange={(e) => { setItem(e.target.value); setSize(""); }} className={inp}>
              <option value="">Choose…</option>
              {svcs.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div><label className={lab}>Client name</label><input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="Optional" /></div>
          <div><label className={lab}>Client phone</label><PhoneField value={phone} onChange={setPhone} className={inp} /></div>
          {sized && (
            <div className="sm:col-span-2">
              <label className={lab}>Size</label>
              <div className="flex flex-wrap gap-1.5">
                {sizes.map((o) => (
                  <button key={o.label} type="button" onClick={() => setSize(o.label)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${size === o.label ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground"}`}>{o.label} · {kes(o.price)}</button>
                ))}
              </div>
            </div>
          )}
          {perMetre && (
            <>
              {!/flush|open\s+(borehole\s+)?drill/i.test(item) && <div>
                <label className={lab}>Casing</label>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                  {(["pvc", "steel"] as const).map((c) => (
                    <button key={c} type="button" onClick={() => setCasing(c)} className={`rounded-lg py-1.5 text-xs font-bold ${casing === c ? "bg-card text-primary shadow" : "text-muted-foreground"}`}>{c === "pvc" ? "PVC" : "Steel"} · {kes(c === "steel" ? STEEL_RATE : Math.round(chosen?.priceFrom ?? 0))}/m</button>
                  ))}
                </div>
              </div>}
              <div><label className={lab}>Depth (metres)</label><input inputMode="numeric" value={depth} onChange={(e) => setDepth(e.target.value.replace(/\D/g, ""))} className={inp} placeholder="e.g. 150" /></div>
            </>
          )}
          <div><label className={lab}>Total price (KSh)</label><input inputMode="numeric" value={shownTotal ? Number(shownTotal).toLocaleString("en-KE") : ""} onChange={(e) => { setTotalTouched(true); setTotal(e.target.value.replace(/\D/g, "")); }} className={inp} placeholder="0" /></div>
          <div className="grid grid-cols-1 gap-3">
            <div><label className={lab}>Valid (days)</label><input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} className={inp} /></div>
          </div>
          <div className="sm:col-span-2"><label className={lab}>Note on the quote</label><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inp} placeholder="Optional. For example: includes survey, drilling, casing and flushing." /></div>
        </div>
        {err && <p className="mt-2 text-xs font-semibold text-red-600">{err}</p>}
        <button onClick={create} disabled={busy} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"><Plus className="h-4 w-4" /> {busy ? "Saving…" : "Create quote"}</button>
      </div>

      <h3 className="mt-6 mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Your quotes</h3>
      {rows === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">No quotes yet.</p>}
      <div className="divide-y divide-border">
        {sorted.map((q) => (
          <div key={q.id} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">QT-{String(q.id).padStart(5, "0")} · {q.item}{q.source === "client" && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-800">Client made</span>}{q.itemised && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-800">Itemised</span>}{q.customPrice && <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase text-purple-800">Custom price</span>}</p>
                <p className="text-xs text-muted-foreground">{q.name || "No name"}{q.phone ? ` · ${q.phone}` : ""} · {new Date(q.createdAt).toLocaleDateString()}</p>
                {q.size && <p className="text-xs text-muted-foreground">Size: {q.size}</p>}
                {q.depth > 0 && <p className="text-xs text-muted-foreground">{q.casing.toUpperCase()} · {q.depth} m</p>}
                {(q.location || q.lat != null) && <p className="text-xs text-muted-foreground">📍 {q.location || "Pinned location"}{q.lat != null && <> · <a href={`https://www.google.com/maps?q=${q.lat},${q.lng}`} target="_blank" rel="noreferrer" className="font-bold text-primary">Open map</a></>}</p>}
                {(q.reportUrl || q.nemaUrl || q.warmaUrl || q.pumpReportUrl) && <p className="flex flex-wrap gap-x-3 text-xs">
                  {q.reportUrl && <a href={q.reportUrl} target="_blank" rel="noreferrer" className="font-bold text-emerald-700">📎 Hydrogeological survey report</a>}
                  {q.nemaUrl && <a href={q.nemaUrl} target="_blank" rel="noreferrer" className="font-bold text-emerald-700">📎 NEMA permit</a>}
                  {q.warmaUrl && <a href={q.warmaUrl} target="_blank" rel="noreferrer" className="font-bold text-emerald-700">📎 WARMA permit</a>}
                  {q.pumpReportUrl && <a href={q.pumpReportUrl} target="_blank" rel="noreferrer" className="font-bold text-emerald-700">📎 Test pumping report</a>}
                </p>}
              </div>
              <p className="shrink-0 text-sm font-extrabold text-primary">{kes(q.total)}</p>
            </div>
            {!/ \+ /.test(q.item) && (
              <div className="mt-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2 text-xs" data-testid={`best-price-${q.id}`}>
                <p className="font-bold text-foreground">Our best price {q.depth > 0 ? "per metre" : "(total)"}{q.agreedTotal ? <span className="ml-2 text-emerald-700">now {kes(q.agreedTotal)}{q.depth > 0 ? ` (${kes(Math.round(q.agreedTotal / q.depth))}/m)` : ""}</span> : <span className="ml-2 font-normal text-muted-foreground">not set: the client sees the standard price</span>}</p>
                <div className="mt-1.5 flex gap-2">
                  <input inputMode="numeric" value={bp[q.id] ?? ""} onChange={(e) => setBp((m) => ({ ...m, [q.id]: e.target.value.replace(/\D/g, "") }))} placeholder={q.depth > 0 ? "KSh per metre, e.g. 5200" : "KSh total"} className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-xs" />
                  <button type="button" disabled={!bp[q.id]} onClick={() => void saveBest(q)} className="rounded-lg bg-primary px-3 py-1.5 font-bold text-primary-foreground disabled:opacity-50">Save</button>
                  {q.agreedTotal ? <button type="button" onClick={() => void saveBest(q, true)} className="rounded-lg border px-3 py-1.5 font-bold text-red-600">Remove</button> : null}
                </div>
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold">
              <button onClick={() => copy(q)} className="flex items-center gap-1 text-primary"><Copy className="h-3 w-3" /> {copied === q.id ? "Copied" : "Copy link"}</button>
              <a href={wa(q)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-700"><MessageCircle className="h-3 w-3" /> Send on WhatsApp</a>
              <a href={linkOf(q)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary"><Printer className="h-3 w-3" /> Open</a>
              <button onClick={() => del(q)} className="flex items-center gap-1 text-red-600"><Trash2 className="h-3 w-3" /> Delete</button>
            </div>
          </div>
        ))}
      </div>
      </>)}
    </div>
  );
}
