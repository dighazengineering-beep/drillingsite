import CopyLink from "@/components/CopyLink";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, XCircle, Landmark, Smartphone, FileSpreadsheet, Banknote, ReceiptText } from "lucide-react";
import { API, kes } from "@/lib/member";
import RecordPayment from "./RecordPayment";
import DealsAdmin from "@/components/admin/DealsAdmin";

interface Pay {
  id: number; phone: string; name: string; item: string; payType: string; amount: number; agreedTotal: number; paidSoFar: number;
  method: string; status: string; receipt: string; bankRef: string; hasImg?: boolean; paidAt?: string | null; note: string; createdAt: string;
}
const badge: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800", pending: "bg-sky-100 text-sky-800", failed: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-600", rejected: "bg-red-100 text-red-700",
};

/** Every payment, with the running balance of each job. Bank transfers wait here until you confirm them. */
export default function PaymentsAdmin({ adminKey, onBadAdmin }: { adminKey: string; onBadAdmin: () => void }) {
  const [rows, setRows] = useState<Pay[] | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "paid">("all");
  const h = { "x-admin-key": adminKey };

  const load = () =>
    fetch(`${API}/api/payments-admin/list`, { headers: h })
      .then((r) => { if (r.status === 403) { onBadAdmin(); throw new Error("403"); } return r.json(); })
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows((l) => l ?? []));
  useEffect(() => { load(); const t = window.setInterval(load, 15000); return () => window.clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [view, setView] = useState<string | null>(null);
  const showReceipt = async (id: number) => {
    const d = await fetch(`${API}/api/payments-admin/${id}/receipt`, { headers: h }).then((r) => r.json()).catch(() => ({}));
    if (d.img) setView(d.img);
  };
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const exportXlsx = async () => {
    setExporting(true);
    try {
      const q = new URLSearchParams(); if (from) q.set("from", from); if (to) q.set("to", to);
      const r = await fetch(`${API}/api/payments-admin/export.xlsx?${q}`, { headers: h });
      if (!r.ok) throw new Error();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await r.blob());
      a.download = `payments${from ? `-from-${from}` : ""}${to ? `-to-${to}` : ""}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch { window.alert("Could not make the file. Try again."); }
    setExporting(false);
  };
  const openReceipt = async (id: number) => {
    const r = await fetch(`${API}/api/payments/${id}/receipt`, { headers: h });
    if (!r.ok) return;
    window.open(URL.createObjectURL(new Blob([await r.text()], { type: "text/html" })), "_blank");
  };
  const act = async (id: number, action: "confirm" | "reject") => {
    if (action === "reject" && !window.confirm("Reject this payment?")) return;
    await fetch(`${API}/api/payments-admin/${id}/${action}`, { method: "POST", headers: h });
    load();
  };

  const [rec, setRec] = useState(false);
  const shown = (rows ?? []).filter((r) => filter === "all" || r.status === filter);
  const total = (rows ?? []).filter((r) => r.status === "paid").reduce((a, r) => a + r.amount, 0);

  return (
    <div>
      <DealsAdmin adminKey={adminKey} onBadAdmin={onBadAdmin} />
      <button type="button" onClick={() => setRec((v) => !v)} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground shadow-sm" data-testid="button-record-payment"><ReceiptText className="h-4 w-4" /> {rec ? "Close" : "Record a cash or other payment"}</button>
      {rec && <RecordPayment adminKey={adminKey} onDone={(id) => { setRec(false); load(); void openReceipt(id); }} />}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Received so far: <b className="text-foreground">{kes(total)}</b></p>
        <div className="flex gap-1 rounded-xl bg-muted p-1 text-xs font-semibold">
          {(["all", "pending", "paid"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1 capitalize ${filter === f ? "bg-card text-primary shadow" : "text-muted-foreground"}`}>{f}</button>
          ))}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-muted/30 p-2.5">
        <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-input bg-background px-2 py-1.5 text-xs font-normal normal-case text-foreground" /></label>
        <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg border border-input bg-background px-2 py-1.5 text-xs font-normal normal-case text-foreground" /></label>
        <button onClick={exportXlsx} disabled={exporting} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60"><FileSpreadsheet className="h-3.5 w-3.5" /> {exporting ? "Preparing…" : "Download Excel"}</button>
        <p className="w-full text-[11px] text-muted-foreground">Paid payments only. Leave the dates empty for everything.</p>
      </div>
      {rows === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">No payments yet.</p>}
      <div className="divide-y divide-border">
        {shown.map((p) => (
          <div key={p.id} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{p.name} <span className="font-normal text-muted-foreground">· {p.phone}</span></p>
                <p className="truncate text-xs text-muted-foreground">{p.item} · <span className="capitalize">{p.payType}</span></p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-extrabold text-primary">{kes(p.amount)}</p>
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${badge[p.status] ?? badge.pending}`}>{p.status}</span>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">{p.method === "mpesa" ? <Smartphone className="h-3 w-3" /> : p.method === "bank" ? <Landmark className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}{p.method === "mpesa" ? "M-Pesa" : p.method === "bank" ? "Bank" : p.method === "cheque" ? "Cheque" : "Cash"} {p.receipt || p.bankRef.slice(0, 40)}</span>
              <span>Price {kes(p.agreedTotal)}</span>
              <span>Paid {kes(p.paidSoFar)}</span>
              <span className="font-semibold text-foreground">Balance {kes(Math.max(0, p.agreedTotal - p.paidSoFar))}</span>
              <span>{new Date(p.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
            {p.method !== "mpesa" && p.bankRef && (p.method !== "bank" || p.bankRef.length > 40) && <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-muted px-2 py-1 text-[11px] text-foreground/80">{p.bankRef}</p>}
            {p.status === "paid" && p.agreedTotal - p.paidSoFar > 0 && (
              <a href={`https://wa.me/${p.phone}?text=${encodeURIComponent(`Hello ${p.name.split(" ")[0]}, thank you for your payment of ${kes(p.paidSoFar)} for ${p.item}. The remaining balance is ${kes(p.agreedTotal - p.paidSoFar)}. Kindly pay when ready. Dighaz Engineering Limited.`)}`}
                target="_blank" rel="noreferrer" className="mt-1 mr-3 inline-block text-[11px] font-bold text-emerald-700 underline underline-offset-2">WhatsApp balance reminder</a>
            )}
            {p.status === "paid" && <button onClick={() => openReceipt(p.id)} className="mt-1 mr-3 text-[11px] font-bold text-primary underline underline-offset-2" data-testid={`button-receipt-${p.id}`}>Print receipt</button>}
            {p.status === "paid" && <span className="mt-1 mr-3 inline-block"><CopyLink label="Copy receipt link" testId={`button-copy-receipt-${p.id}`} url={async () => { const r = await fetch(`${API}/api/payments-admin/${p.id}/link`, { headers: h }); const j = await r.json().catch(() => ({})); return String(j.url ?? ""); }} /></span>}
            {p.paidAt && p.method !== "mpesa" && <p className="mt-1 text-[11px] text-muted-foreground">Paid on {new Date(p.paidAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</p>}
            {p.hasImg && <button onClick={() => showReceipt(p.id)} className="mt-1 text-[11px] font-bold text-primary underline underline-offset-2">View photo</button>}
            {p.note && <p className="mt-1 text-[11px] text-sky-700">{p.note}</p>}
            {p.method !== "mpesa" && p.status !== "paid" && (
              <div className="mt-2 flex gap-2">
                <button onClick={() => act(p.id, "confirm")} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"><CheckCircle2 className="h-3.5 w-3.5" /> Confirm</button>
                {p.status === "pending" && <button onClick={() => act(p.id, "reject")} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"><XCircle className="h-3.5 w-3.5" /> Reject</button>}
              </div>
            )}
            {p.method !== "mpesa" && p.status === "paid" && <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700"><Clock className="h-3 w-3" /> Confirmed by you</p>}
          </div>
        ))}
      </div>
      {view && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4" onClick={() => setView(null)}>
          <img src={view} alt="Receipt" className="max-h-[90dvh] max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
