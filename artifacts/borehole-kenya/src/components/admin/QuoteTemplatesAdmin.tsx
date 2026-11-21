import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, RotateCcw, Save } from "lucide-react";
import { API, kes } from "@/lib/member";
import QuoteTable, { type QLine } from "@/components/QuoteTable";

type Qty = { mode: "fixed" | "first" | "rest" | "per"; n: number } | { mode: "share" | "restshare"; n: number; d: number } | { mode: "blank" };
interface TLine { kind: "line" | "section" | "mob"; description: string; unit: string; qty: Qty; rate: number; rateOnly?: boolean; label?: string; fixedRate?: boolean; balance?: boolean }
interface Opt { label: string; price: number }
interface Tpl { id: string; name: string; needsDepth: boolean; lines: TLine[]; footer: string; options?: Opt[] }
interface Preview { ok: boolean; built: { lines: QLine[]; total: number; templateTotal: number } | null; total: number | null; siteTotal: number | null; service: string | null; problems: string[]; error?: string }

const inp = "w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/30";
const lab = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground";
const digits = (v: string) => Number(v.replace(/\D/g, "")) || 0;
const MODES: [Qty["mode"], string][] = [["fixed", "Fixed number"], ["first", "First N metres"], ["rest", "Metres after N"], ["share", "Share of depth (n/d)"], ["restshare", "Rest of depth (after n/d)"], ["per", "Depth ÷ N"], ["blank", "No quantity (rate only)"]];

export default function QuoteTemplatesAdmin({ adminKey, onBadAdmin }: { adminKey: string; onBadAdmin: () => void }) {
  const h = { "x-admin-key": adminKey, "content-type": "application/json" };
  const [data, setData] = useState<{ templates: Tpl[]; defaults: Tpl[]; types: { id: string; label: string }[] } | null>(null);
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [cur, setCur] = useState("");
  const [depth, setDepth] = useState("180");
  const [casing, setCasing] = useState<"pvc" | "steel">("steel");
  const [size, setSize] = useState("");
  const [total, setTotal] = useState("");
  const [pv, setPv] = useState<Preview | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const [next, setNext] = useState("");
  const [nextDef, setNextDef] = useState("");
  const [nextMsg, setNextMsg] = useState("");
  const [shown, setShown] = useState<{ label: string; value: string }[]>([]);
  useEffect(() => {
    fetch(`${API}/api/admin/quote-settings`, { headers: h }).then((r) => r.json()).then((d) => { setNext(d.nextStep ?? ""); setNextDef(d.defaultNextStep ?? ""); setShown(Array.isArray(d.contacts) ? d.contacts : []); }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const saveNext = async () => {
    setNextMsg("");
    const r = await fetch(`${API}/api/admin/quote-settings`, { method: "PUT", headers: h, body: JSON.stringify({ nextStep: next }) });
    setNextMsg(r.ok ? "Saved. New quotes will say this." : "Could not save.");
  };

  useEffect(() => {
    fetch(`${API}/api/admin/quote-templates`, { headers: h })
      .then((r) => { if (r.status === 403) { onBadAdmin(); throw new Error("403"); } return r.json(); })
      .then((d) => { setData(d); setTpls(d.templates); setCur(d.templates[0]?.id ?? ""); })
      .catch(() => setMsg("Could not load the quote lines."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const t = tpls.find((x) => x.id === cur);
  const setT = (fn: (t: Tpl) => Tpl) => setTpls((l) => l.map((x) => (x.id === cur ? fn(x) : x)));
  const setLine = (i: number, p: Partial<TLine>) => setT((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) }));

  // live preview: asks the server to build the lines with the same function real quotes use
  useEffect(() => {
    if (!t) return;
    const my = ++seq.current;
    const id = setTimeout(() => {
      fetch(`${API}/api/admin/quote-templates/preview`, { method: "POST", headers: h, body: JSON.stringify({ id: t.id, template: t, depth: digits(depth), casing, size, total: digits(total) }) })
        .then((r) => r.json()).then((d) => { if (my === seq.current) setPv(d); }).catch(() => {});
    }, 400);
    return () => clearTimeout(id);
  }, [t, depth, casing, size, total]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!t) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`${API}/api/admin/quote-templates/${t.id}`, { method: "PUT", headers: h, body: JSON.stringify(t) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 403) { onBadAdmin(); return; }
      if (!r.ok) throw new Error(d.error || "Could not save.");
      setTpls((l) => l.map((x) => (x.id === t.id ? d : x)));
      setMsg("Saved. New quotes will use these lines. Old quotes do not change.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
    setBusy(false);
  };
  const addTemplate = (id: string) => {
    const ty = data?.types.find((x) => x.id === id);
    if (!ty) return;
    setTpls((l) => [...l, { id, name: ty.label, needsDepth: false, lines: [{ kind: "line", description: "", unit: "Ls", qty: { mode: "fixed", n: 1 }, rate: 0 }], footer: "" }]);
    setCur(id);
  };
  const restore = () => {
    const d = data?.defaults.find((x) => x.id === cur);
    if (d && window.confirm("Put back the original lines for this service? Your edits to it will be lost until you save.")) setT(() => JSON.parse(JSON.stringify(d)));
  };

  if (!data) return <p className="text-sm text-muted-foreground">{msg || "Loading…"}</p>;
  const free = data.types.filter((x) => !tpls.some((p) => p.id === x.id));
  const shownTotal = pv?.built?.total ?? 0;

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3.5">
      <p className="mb-3 text-xs text-muted-foreground">These are the lines that appear on a quote. The quote total always stays the price on the site; the lines are scaled to it. Services without lines here keep a single-line quote.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[160px] flex-1"><label className={lab}>Service type</label>
          <select value={cur} onChange={(e) => setCur(e.target.value)} className={inp}>{tpls.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        {free.length > 0 && (
          <div><label className={lab}>Add lines for</label>
            <select value="" onChange={(e) => e.target.value && addTemplate(e.target.value)} className={inp}><option value="">Choose…</option>{free.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
        )}
      </div>

      <div className="mb-4 rounded-xl border border-border bg-card p-3">
        <label className={lab}>"Next step" panel (bottom of every new quote)</label>
        <textarea value={next} onChange={(e) => setNext(e.target.value)} rows={3} className={inp} />
        <p className="mt-1 text-[11px] text-muted-foreground">Shown with Call, WhatsApp and Email buttons. Contact lines come from the server settings{shown.length ? `: ${shown.map((c) => c.label).join(", ")}` : ""}. Email and Website appear only when COMPANY_EMAIL / COMPANY_WEBSITE are set on Render.</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={saveNext} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Save wording</button>
          {nextDef && <button type="button" onClick={() => setNext(nextDef)} className="text-xs font-bold text-primary">Use original wording</button>}
          {nextMsg && <span className="text-xs font-semibold text-emerald-700">{nextMsg}</span>}
        </div>
      </div>

      {t && (
        <>
          <label className="mt-3 flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={t.needsDepth} onChange={(e) => setT((x) => ({ ...x, needsDepth: e.target.checked }))} /> Quantities depend on the depth (per-metre services)</label>

          <div className="mt-3 space-y-2">
            {t.lines.map((l, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-2.5">
                <div className="flex items-center gap-1.5">
                  <select value={l.kind} onChange={(e) => setLine(i, { kind: e.target.value as TLine["kind"] })} className={`${inp} !w-auto`}><option value="line">Line</option><option value="section">Heading</option><option value="mob">Mobilization (small table on top)</option></select>
                  <textarea value={l.description} rows={l.description.includes("\n") ? Math.min(6, l.description.split("\n").length + 1) : 1} onChange={(e) => setLine(i, { description: e.target.value })} className={inp} placeholder={l.kind === "section" ? "Heading text" : "Description (press Enter for a new line under it)"} />
                  <button type="button" disabled={i === 0} onClick={() => setT((x) => { const a = [...x.lines]; [a[i - 1], a[i]] = [a[i]!, a[i - 1]!]; return { ...x, lines: a }; })} className="p-1 text-muted-foreground disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" disabled={i === t.lines.length - 1} onClick={() => setT((x) => { const a = [...x.lines]; [a[i + 1], a[i]] = [a[i]!, a[i + 1]!]; return { ...x, lines: a }; })} className="p-1 text-muted-foreground disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setT((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))} className="p-1 text-red-600" aria-label="Delete line"><Trash2 className="h-4 w-4" /></button>
                </div>
                {l.kind === "mob" && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div><label className={lab}>Amount (KSh)</label><input inputMode="numeric" value={l.rate} onChange={(e) => setLine(i, { rate: digits(e.target.value) })} className={inp} /></div>
                    <div><label className={lab}>Note beside it</label><input value={l.label ?? ""} onChange={(e) => setLine(i, { label: e.target.value })} className={inp} /></div>
                    <p className="col-span-2 text-[11px] text-muted-foreground">Shown in its own small table above the numbered items. It is deducted from the total, never added to it.</p>
                  </div>
                )}
                {l.kind === "line" && (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[80px_1fr_80px_100px_auto]">
                    <div><label className={lab}>Unit</label><input value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} className={inp} /></div>
                    <div className="col-span-2 sm:col-span-1"><label className={lab}>Quantity</label>
                      <select value={l.qty.mode} onChange={(e) => { const m = e.target.value as Qty["mode"]; setLine(i, { qty: m === "blank" ? { mode: "blank" } : m === "share" || m === "restshare" ? { mode: m, n: 1, d: 2 } : { mode: m, n: m === "per" ? 20 : m === "fixed" ? 1 : 100 } }); }} className={inp}>{MODES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                    {l.qty.mode !== "blank" && (
                      <div><label className={lab}>{l.qty.mode === "share" || l.qty.mode === "restshare" ? "n / d" : "N"}</label>
                        <div className="flex items-center gap-1">
                          <input inputMode="numeric" value={l.qty.n} onChange={(e) => setLine(i, { qty: { ...l.qty, n: digits(e.target.value) } as Qty })} className={inp} />
                          {(l.qty.mode === "share" || l.qty.mode === "restshare") && <><span>/</span><input inputMode="numeric" value={l.qty.d} onChange={(e) => setLine(i, { qty: { ...l.qty, d: digits(e.target.value) } as Qty })} className={inp} /></>}
                        </div></div>
                    )}
                    <div><label className={lab}>Rate (KSh)</label><input inputMode="numeric" value={l.rate} onChange={(e) => setLine(i, { rate: digits(e.target.value) })} className={inp} /></div>
                    <label className="flex items-end gap-1 pb-1.5 text-[11px] font-semibold"><input type="checkbox" checked={!!l.rateOnly} onChange={(e) => setLine(i, { rateOnly: e.target.checked })} /> Not in total</label>
                    <div className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold sm:col-span-5">
                      <label className="flex items-center gap-1"><input type="checkbox" checked={!!l.fixedRate} onChange={(e) => setLine(i, { fixedRate: e.target.checked })} /> Rate is fixed (never changed to fit the total)</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={!!l.balance} onChange={(e) => setLine(i, { balance: e.target.checked })} /> Balancing line (its amount makes the lines add up exactly)</label>
                    </div>
                    {l.rateOnly && <div className="col-span-2 sm:col-span-5"><label className={lab}>Word shown instead of the amount</label><input value={l.label ?? ""} onChange={(e) => setLine(i, { label: e.target.value })} className={inp} placeholder='e.g. Included (blank = "Rate only")' /></div>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Use {"{depth}"}, {"{qty}"} and {"{casing}"} in a description to fill in the depth, the line's quantity and PVC/steel.</p>
          <button type="button" onClick={() => setT((x) => ({ ...x, lines: [...x.lines, { kind: "line", description: "", unit: "Ls", qty: { mode: "fixed", n: 1 }, rate: 0 }] }))} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary"><Plus className="h-3.5 w-3.5" /> Add line</button>
          <button type="button" onClick={() => setT((x) => ({ ...x, lines: [...x.lines, { kind: "section", description: "", unit: "", qty: { mode: "blank" }, rate: 0 }] }))} className="ml-4 inline-flex items-center gap-1 text-xs font-bold text-primary"><Plus className="h-3.5 w-3.5" /> Add heading</button>

          <div className="mt-4 rounded-xl border border-border bg-card p-3">
            <label className={lab}>Sizes the client can choose (optional)</label>
            <p className="mb-2 text-[11px] text-muted-foreground">For services sold in sizes, such as water purification (250 L/hr, 500 L/hr…). The price of the chosen size is the quote total, and the lines are scaled to it. A price of 0 means "not set yet", so clients cannot choose that size. Use {"{size}"} in a line description to print the chosen size.</p>
            {(t.options ?? []).map((o, i) => (
              <div key={i} className="mb-1.5 flex items-center gap-1.5">
                <input value={o.label} onChange={(e) => setT((x) => ({ ...x, options: (x.options ?? []).map((q, j) => (j === i ? { ...q, label: e.target.value } : q)) }))} className={inp} placeholder="e.g. 500 L/hr" />
                <input inputMode="numeric" value={o.price} onChange={(e) => setT((x) => ({ ...x, options: (x.options ?? []).map((q, j) => (j === i ? { ...q, price: digits(e.target.value) } : q)) }))} className={`${inp} !w-32`} placeholder="Price KSh" />
                <button type="button" onClick={() => setT((x) => ({ ...x, options: (x.options ?? []).filter((_, j) => j !== i) }))} className="p-1 text-red-600" aria-label="Delete size"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setT((x) => ({ ...x, options: [...(x.options ?? []), { label: "", price: 0 }] }))} className="inline-flex items-center gap-1 text-xs font-bold text-primary"><Plus className="h-3.5 w-3.5" /> Add size</button>
          </div>

          <div className="mt-3"><label className={lab}>Note at the bottom of the quote</label>
            <textarea value={t.footer} onChange={(e) => setT((x) => ({ ...x, footer: e.target.value }))} rows={2} className={inp} placeholder="Optional. For example: fees and permits not included." /></div>

          <h4 className="mt-4 mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Live preview</h4>
          <div className="mb-2 grid grid-cols-3 gap-2">
            {t.needsDepth && <>
              <div><label className={lab}>Depth (m)</label><input inputMode="numeric" value={depth} onChange={(e) => setDepth(e.target.value.replace(/\D/g, ""))} className={inp} /></div>
              <div><label className={lab}>Casing</label><select value={casing} onChange={(e) => setCasing(e.target.value as "pvc" | "steel")} className={inp}><option value="steel">Steel</option><option value="pvc">PVC</option></select></div>
            </>}
            {(t.options?.length ?? 0) > 0 && <div><label className={lab}>Size</label><select value={size} onChange={(e) => setSize(e.target.value)} className={inp}><option value="">First priced size</option>{t.options!.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}</select></div>}
            <div><label className={lab}>Total (optional)</label><input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, ""))} className={inp} placeholder="site price" /></div>
          </div>
          {pv?.built ? (
            <>
              <QuoteTable lines={pv.built.lines} total={shownTotal} />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Quote total: <b>{kes(shownTotal)}</b>{pv.service && pv.siteTotal ? ` (site price for ${pv.service})` : ""}. The template on its own adds up to {kes(pv.built.templateTotal)}; that is only a guide, the lines are scaled to the quote total.
              </p>
            </>
          ) : <p className="text-xs text-muted-foreground">{pv?.error || "Nothing to show yet."}</p>}
          {pv && pv.problems.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-xl bg-sky-50 p-2.5 text-xs font-semibold text-sky-900">{pv.problems.map((p, i) => <li key={i}>⚠ {p}</li>)}</ul>
          )}

          {msg && <p className="mt-2 text-xs font-semibold text-emerald-700">{msg}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"><Save className="h-4 w-4" /> {busy ? "Saving…" : "Save quote lines"}</button>
            {data.defaults.some((d) => d.id === cur) && <button onClick={restore} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground"><RotateCcw className="h-4 w-4" /> Restore original</button>}
          </div>
        </>
      )}
    </div>
  );
}
