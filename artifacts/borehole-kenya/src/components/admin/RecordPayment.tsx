import { useEffect, useState } from "react";
import { Loader2, ReceiptText } from "lucide-react";
import { API, kes } from "@/lib/member";
import { PhoneField } from "@/components/PhoneField";

interface CRow { token: string; no: string; name: string; item: string; agreedTotal: number; paid: number }
interface Stage { id: string; label: string; amount: number; status: "paid" | "pending" | "open" }
const inp = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";
const lab = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground";

/** Admin: record a payment taken outside the website (cash, cheque, bank or M-Pesa paid another way). The client gets a receipt by SMS and email. */
export default function RecordPayment({ adminKey, onDone }: { adminKey: string; onDone: (id: number) => void }) {
  const h = { "x-admin-key": adminKey, "content-type": "application/json" };
  const [mode, setMode] = useState<"contract" | "other">("contract");
  const [contracts, setContracts] = useState<CRow[]>([]);
  const [token, setToken] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [stage, setStage] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState(""), [note, setNote] = useState("");
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [item, setItem] = useState(""), [amount, setAmount] = useState(""), [total, setTotal] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");

  useEffect(() => { fetch(`${API}/api/admin/contracts`, { headers: h }).then((r) => r.json()).then((d) => setContracts(Array.isArray(d) ? d.filter((x: CRow) => x.paid < x.agreedTotal) : [])).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!token) { setStages([]); setStage(""); return; }
    fetch(`${API}/api/contracts/${token}`).then((r) => r.json()).then((d) => { const st: Stage[] = d.stages ?? []; setStages(st); setStage(st.find((x) => x.status === "open")?.id ?? ""); }).catch(() => {});
  }, [token]);

  // the whole balance in one payment (covers every step still unpaid)
  const unpaid = stages.filter((x) => x.status !== "paid");
  const canAll = unpaid.length >= 2 && unpaid.every((x) => x.status === "open");
  const allAmt = unpaid.reduce((t, x) => t + x.amount, 0);
  const cur = stage === "all" ? { amount: allAmt } : stages.find((x) => x.id === stage);
  const save = async () => {
    setErr("");
    if (mode === "contract" && (!token || !stage)) return setErr("Choose the contract and the step that was paid.");
    setBusy(true);
    try {
      const body = mode === "contract" ? { contractToken: token, stage, method, reference, note } : { name, phone, item, amount, agreedTotal: total || amount, payType: total && Number(total) > Number(amount) ? "deposit" : "full", method, reference, note };
      const r = await fetch(`${API}/api/payments-admin/record`, { method: "POST", headers: h, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not record the payment.");
      onDone(d.id);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="mb-4 rounded-2xl border border-primary/30 bg-primary/5 p-4" data-testid="record-payment">
      <p className="mb-3 flex items-center gap-2 text-sm font-extrabold text-foreground"><ReceiptText className="h-4 w-4 text-primary" /> Record a payment and make a receipt</p>
      <div className="mb-3 flex gap-1 rounded-xl bg-muted p-1 text-xs font-semibold">
        {([["contract", "Contract payment"], ["other", "Other payment"]] as const).map(([k, t]) => <button key={k} type="button" onClick={() => setMode(k)} className={`flex-1 rounded-lg px-3 py-1.5 ${mode === k ? "bg-card text-primary shadow" : "text-muted-foreground"}`}>{t}</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {mode === "contract" ? (<>
          <div className="sm:col-span-2"><label className={lab}>Contract</label>
            <select value={token} onChange={(e) => setToken(e.target.value)} className={inp} data-testid="rec-contract"><option value="">Choose a contract…</option>{contracts.map((c) => <option key={c.token} value={c.token}>{c.no} · {c.name} · {c.item} · balance {kes(c.agreedTotal - c.paid)}</option>)}</select></div>
          {token && <div className="sm:col-span-2"><label className={lab}>Step paid</label>
            <select value={stage} onChange={(e) => setStage(e.target.value)} className={inp} data-testid="rec-stage">{stages.map((s) => <option key={s.id} value={s.id} disabled={s.status !== "open"}>{s.label} · {kes(s.amount)}{s.status === "paid" ? " (paid)" : s.status === "pending" ? " (being confirmed)" : ""}</option>)}{canAll && <option value="all">Full balance, all remaining steps · {kes(allAmt)}</option>}</select>
            {cur && <p className="mt-1 text-xs text-muted-foreground">Amount on the receipt: <b className="text-foreground">{kes(cur.amount)}</b> (set by the contract)</p>}</div>}
        </>) : (<>
          <div><label className={lab}>Client name</label><input value={name} onChange={(e) => setName(e.target.value)} className={inp} data-testid="rec-name" /></div>
          <div><label className={lab}>Phone</label><PhoneField value={phone} onChange={setPhone} className={inp} testId="record-phone" /></div>
          <div className="sm:col-span-2"><label className={lab}>Being payment for</label><input value={item} onChange={(e) => setItem(e.target.value)} placeholder="e.g. Pump installation" className={inp} data-testid="rec-item" /></div>
          <div><label className={lab}>Amount received (KSh)</label><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className={inp} data-testid="rec-amount" /></div>
          <div><label className={lab}>Agreed total (if part payment)</label><input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="numeric" placeholder="same as amount" className={inp} /></div>
        </>)}
        <div><label className={lab}>Paid by</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inp} data-testid="rec-method"><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="bank">Bank transfer</option><option value="mpesa">M-Pesa (paid another way)</option></select></div>
        <div><label className={lab}>{method === "cash" ? "Reference (optional)" : method === "cheque" ? "Cheque number" : method === "bank" ? "Bank reference" : "M-Pesa code"}</label><input value={reference} onChange={(e) => setReference(e.target.value)} className={inp} /></div>
        <div className="sm:col-span-2"><label className={lab}>Note (optional)</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Cash received on site" className={inp} /></div>
      </div>
      {err && <p className="mt-2 text-xs font-semibold text-red-600" role="alert">{err}</p>}
      <button type="button" disabled={busy} onClick={() => void save()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-60" data-testid="rec-save">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />} Save and show receipt</button>
      <p className="mt-2 text-[11px] text-muted-foreground">The client gets an SMS (and an email if we have one) with the link to the receipt.</p>
    </div>
  );
}
