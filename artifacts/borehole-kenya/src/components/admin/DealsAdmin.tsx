import { useEffect, useMemo, useState } from "react";
import { Trash2, Pencil, BadgeCheck, Hourglass } from "lucide-react";
import { API, kes } from "@/lib/member";

interface Deal { id: number; phone: string; name: string; item: string; kind: string; rate: number | null; metres: number | null; total: number; paid: number; balance: number; overpaid: number; note: string }
interface Waiting { phone: string; name: string; item: string; kind: string; paid: number; pending: number; quote: string | null }
interface Cat { name: string; unit: string; price: number | null; kind: "service" | "product" }

const inp = "w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25";
const lab = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const digits = (v: string) => v.replace(/[^\d]/g, "");
const num = (v: string) => (v === "" ? 0 : Number(v));

/**
 * The agreed price of each job. Clients bargain, so the price is whatever you agree with them: you record it here (per metre x metres,
 * or one fixed total) and the client then pays against it and cannot change it. If the metres change after drilling, change them
 * here and the balance updates; the client is told in their notification bell.
 */
export default function DealsAdmin({ adminKey, onBadAdmin }: { adminKey: string; onBadAdmin: () => void }) {
  const h = { "Content-Type": "application/json", "x-admin-key": adminKey };
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [cat, setCat] = useState<Cat[]>([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [item, setItem] = useState("");
  const [kind, setKind] = useState<"service" | "product">("service");
  const [mode, setMode] = useState<"metre" | "fixed">("metre");
  const [rate, setRate] = useState("");
  const [metres, setMetres] = useState("");
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch(`${API}/api/payments-admin/deals`, { headers: h })
      .then((r) => { if (r.status === 403) { onBadAdmin(); throw new Error("403"); } return r.json(); })
      .then((d) => { setDeals(d.deals ?? []); setWaiting(d.unpriced ?? []); })
      .catch(() => setDeals((l) => l ?? []));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // the same names the Pay card offers, so a price always matches the job the client picks
  useEffect(() => {
    const get = (p: string) => fetch(`${API}/api/${p}`).then((r) => r.json()).catch(() => []);
    Promise.all([get("services"), get("products?limit=100")]).then(([s, p]) => {
      setCat([
        ...(Array.isArray(s) ? s : []).map((x: any) => ({ name: x.name, unit: x.priceUnit ?? "", price: x.priceFrom ?? null, kind: "service" as const })),
        ...(Array.isArray(p) ? p : (p?.items ?? [])).map((x: any) => ({ name: x.name, unit: "", price: x.price != null ? Number(x.price) : null, kind: "product" as const })),
      ]);
    });
  }, []);

  const preview = useMemo(() => (mode === "metre" ? num(rate) * num(metres) : num(total)), [mode, rate, metres, total]);

  const pickItem = (v: string) => {
    setItem(v);
    const c = cat.find((x) => x.name === v);
    if (!c) return;
    setKind(c.kind);
    if (/metre|meter/i.test(c.unit)) { setMode("metre"); if (!rate && c.price) setRate(String(Math.round(c.price))); }
    else { setMode("fixed"); }
  };
  const reset = () => { setPhone(""); setName(""); setItem(""); setRate(""); setMetres(""); setTotal(""); setNote(""); setErr(""); };
  const edit = (x: { phone: string; name: string; item: string; kind: string; rate?: number | null; metres?: number | null; total?: number; note?: string }) => {
    setPhone(x.phone); setName(x.name ?? ""); setItem(x.item); setKind(x.kind === "product" ? "product" : "service");
    if (x.rate && x.metres) { setMode("metre"); setRate(String(x.rate)); setMetres(String(x.metres)); setTotal(""); }
    else { setMode("fixed"); setTotal(x.total ? String(x.total) : ""); setRate(""); setMetres(""); }
    setNote(x.note ?? ""); setErr(""); setOk("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // "Set price" on a waiting job: read the client's own estimate (for example "PVC casing, 150 m at KSh 6,000 per metre") to start from
  const fromWaiting = (w: Waiting) => {
    const m = w.quote?.match(/([\d,.]+) m at KSh ([\d,]+) per metre/);
    edit({ phone: w.phone, name: w.name, item: w.item, kind: w.kind, rate: m ? Number(m[2].replace(/,/g, "")) : null, metres: m ? Number(m[1].replace(/,/g, "")) : null });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(""); setOk("");
    const body = mode === "metre" ? { phone, name, item, kind, rate: num(rate), metres: num(metres), note } : { phone, name, item, kind, total: num(total), note };
    const r = await fetch(`${API}/api/payments-admin/deals`, { method: "POST", headers: h, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 403) onBadAdmin();
    else if (!r.ok) setErr(d.error ?? "Could not save the price.");
    else { setOk(`Saved: ${kes(d.total)}. The client was told in their bell.`); reset(); load(); }
    setBusy(false);
  };
  const remove = async (x: Deal) => {
    if (!window.confirm(`Remove the agreed price for ${x.name || x.phone} (${x.item})? Payments stay, and the job goes back to "waiting for a price".`)) return;
    await fetch(`${API}/api/payments-admin/deals/${x.id}`, { method: "DELETE", headers: h });
    load();
  };

  return (
    <div className="mb-6 space-y-4">
      <form onSubmit={save} className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-3.5">
        <p className="text-sm font-bold text-foreground">Set a client's agreed price</p>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={lab}>Client phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="07xx xxx xxx" className={inp} data-testid="deal-phone" /></div>
          <div><label className={lab}>Client name</label><input value={name} onChange={(e) => setName(e.target.value)} className={inp} data-testid="deal-name" /></div>
        </div>
        <div>
          <label className={lab}>Job</label>
          <input value={item} onChange={(e) => pickItem(e.target.value)} list="deal-items" placeholder="Choose from the list" className={inp} data-testid="deal-item" />
          <datalist id="deal-items">{cat.map((c) => <option key={`${c.kind}-${c.name}`} value={c.name} />)}</datalist>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-xs font-bold">
          {([["metre", "Per metre × metres"], ["fixed", "One fixed price"]] as const).map(([k, n]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-lg py-1.5 ${mode === k ? "bg-card text-primary shadow" : "text-muted-foreground"}`}>{n}</button>
          ))}
        </div>
        {mode === "metre" ? (
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lab}>Price per metre (KSh)</label><input value={rate} onChange={(e) => setRate(digits(e.target.value))} inputMode="numeric" className={inp} data-testid="deal-rate" /></div>
            <div><label className={lab}>Agreed metres</label><input value={metres} onChange={(e) => setMetres(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={inp} data-testid="deal-metres" /></div>
          </div>
        ) : (
          <div><label className={lab}>Agreed price (KSh)</label><input value={total} onChange={(e) => setTotal(digits(e.target.value))} inputMode="numeric" className={inp} data-testid="deal-total" /></div>
        )}
        <div><label className={lab}>Note (only you see it)</label><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={inp} /></div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Total: <b className="text-base text-primary" data-testid="deal-preview">{preview ? kes(preview) : "KSh 0"}</b></p>
          <button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50" data-testid="deal-save">{busy ? "Saving…" : "Save price"}</button>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        {ok && <p className="text-xs font-semibold text-emerald-700">{ok}</p>}
      </form>

      {waiting.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-foreground"><Hourglass className="h-4 w-4 text-amber-600" /> Paid, waiting for a price ({waiting.length})</p>
          <div className="divide-y divide-border rounded-xl border border-border">
            {waiting.map((w) => (
              <div key={`${w.phone}|${w.item}`} className="flex items-start justify-between gap-3 p-2.5">
                <div className="min-w-0 text-xs">
                  <p className="truncate font-semibold text-foreground">{w.name || "Client"} <span className="font-normal text-muted-foreground">· {w.phone}</span></p>
                  <p className="truncate text-muted-foreground">{w.item} · paid {kes(w.paid)}{w.pending > 0 ? `, ${kes(w.pending)} pending` : ""}</p>
                  {w.quote && <p className="text-[11px] text-amber-800">Client estimate: {w.quote}</p>}
                </div>
                <button onClick={() => fromWaiting(w)} className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground" data-testid="deal-set-price">Set price</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-foreground"><BadgeCheck className="h-4 w-4 text-emerald-600" /> Agreed prices {deals ? `(${deals.length})` : ""}</p>
        {deals === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {deals?.length === 0 && <p className="text-sm text-muted-foreground">No prices set yet.</p>}
        <div className="divide-y divide-border rounded-xl border border-border">
          {deals?.map((d) => (
            <div key={d.id} className="flex items-start justify-between gap-3 p-2.5">
              <div className="min-w-0 text-xs">
                <p className="truncate font-semibold text-foreground">{d.name || "Client"} <span className="font-normal text-muted-foreground">· {d.phone}</span></p>
                <p className="truncate text-muted-foreground">{d.item}{d.rate && d.metres ? ` · ${kes(d.rate)}/m × ${d.metres} m` : ""}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px]">
                  <span>Price <b className="text-foreground">{kes(d.total)}</b></span>
                  <span>Paid <b className="text-foreground">{kes(d.paid)}</b></span>
                  {d.overpaid > 0 ? <b className="text-amber-700">Overpaid by {kes(d.overpaid)}: refund or credit</b>
                    : <b className={d.balance > 0 ? "text-primary" : "text-emerald-700"}>{d.balance > 0 ? `Balance ${kes(d.balance)}` : "Fully paid"}</b>}
                </p>
                {d.note && <p className="text-[11px] text-muted-foreground">Note: {d.note}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => edit(d)} aria-label="Change price" className="rounded-lg border border-border p-2 hover:bg-muted" data-testid="deal-edit"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(d)} aria-label="Remove price" className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
