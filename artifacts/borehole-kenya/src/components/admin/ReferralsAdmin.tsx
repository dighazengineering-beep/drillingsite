import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { kes, STATUS_LABEL, type Referral } from "@/lib/member";

const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");
type Item = Referral & { member: { name: string; email: string; phone: string; code: string } };
const BADGE: Record<Referral["status"], string> = {
  in_progress: "bg-blue-100 text-blue-700",
  awaiting_payment: "bg-sky-100 text-sky-800",
  payable: "bg-green-100 text-green-700",
  paid: "bg-gray-200 text-gray-700",
};
const inp = "rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

export default function ReferralsAdmin({ adminKey, onBadAdmin }: { adminKey: string; onBadAdmin: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [members, setMembers] = useState(0);
  const [rates, setRates] = useState({ service: 15, product: 3 });
  const [filter, setFilter] = useState<"all" | "payable" | "open">("all");
  const [msg, setMsg] = useState("");
  const [amounts, setAmounts] = useState<Record<number, string>>({});

  const h = { "x-admin-key": adminKey, "Content-Type": "application/json" };
  const load = () =>
    fetch(`${API}/api/admin/referrals`, { headers: h })
      .then((r) => { if (r.status === 403) { onBadAdmin(); throw 0; } return r.json(); })
      .then((d) => { setItems(d.items ?? []); setMembers(d.memberCount ?? 0); if (d.rates) setRates(d.rates); })
      .catch(() => setItems((x) => x ?? []));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (id: number, body: object) => {
    const r = await fetch(`${API}/api/admin/referrals/${id}`, { method: "PATCH", headers: h, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(d.error || "Could not save."); return; }
    setMsg("");
    setItems((l) => (l ?? []).map((x) => (x.id === id ? { ...x, ...d } : x)));
  };
  const del = async (x: Item) => {
    if (!window.confirm(`Delete the referral for ${x.clientName}?`)) return;
    const r = await fetch(`${API}/api/admin/referrals/${x.id}`, { method: "DELETE", headers: h });
    if (r.ok) setItems((l) => (l ?? []).filter((y) => y.id !== x.id));
  };
  const saveRates = async () => {
    const r = await fetch(`${API}/api/admin/member-settings`, { method: "PUT", headers: h, body: JSON.stringify(rates) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Rates saved. They apply to new referrals; existing ones keep the rate they started with." : d.error || "Could not save.");
  };

  const shown = (items ?? []).filter((x) => filter === "all" || (filter === "payable" ? x.status === "payable" : x.status !== "paid"));
  const owed = (items ?? []).filter((x) => x.status === "payable").reduce((a, x) => a + (x.commission ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/40 p-3">
        <p className="mb-2 text-sm font-semibold text-foreground">Commission rates</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">Services %<input type="number" min={0} max={100} step="0.5" className={`${inp} mt-1 block w-24`} value={rates.service} onChange={(e) => setRates({ ...rates, service: Number(e.target.value) })} /></label>
          <label className="text-xs text-muted-foreground">Products %<input type="number" min={0} max={100} step="0.5" className={`${inp} mt-1 block w-24`} value={rates.product} onChange={(e) => setRates({ ...rates, product: Number(e.target.value) })} /></label>
          <button onClick={saveRates} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Save rates</button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{members} member{members === 1 ? "" : "s"} signed up · You currently owe members <b className="text-foreground">{kes(owed)}</b></p>
      </div>

      <div className="flex gap-1.5">
        {([["all", "All"], ["open", "Not yet paid out"], ["payable", "Ready to pay"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === k ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>{l}</button>
        ))}
      </div>
      {msg && <p className="text-xs text-foreground">{msg}</p>}
      {items === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {items?.length === 0 && <p className="text-sm text-muted-foreground">No referrals yet.</p>}

      <div className="divide-y divide-border">
        {shown.map((x) => (
          <div key={x.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{x.clientName} <span className="font-normal text-muted-foreground">· {x.clientPhone}</span></p>
                <p className="text-xs text-muted-foreground">{x.need || "No details"} · {x.source === "link" ? "via link" : "added by member"}</p>
                <p className="text-xs text-muted-foreground">Member: <b className="text-foreground">{x.member.name}</b> · {x.member.phone || x.member.email} · {x.member.code}</p>
              </div>
              <div className="text-right">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[x.status]}`}>{STATUS_LABEL[x.status]}</span>
                <p className="mt-1 text-sm font-bold text-foreground">{x.commission == null ? "No amount yet" : kes(x.commission)}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select className={inp} value={x.kind} onChange={(e) => patch(x.id, { kind: e.target.value })}>
                <option value="service">Service</option><option value="product">Product</option>
              </select>
              <span className="text-muted-foreground">{x.rate}% of</span>
              <input className={`${inp} w-32`} type="number" min={0} placeholder="Price paid (KSh)" value={amounts[x.id] ?? (x.amount ?? "")}
                onChange={(e) => setAmounts({ ...amounts, [x.id]: e.target.value })}
                onBlur={() => { if (amounts[x.id] !== undefined) { patch(x.id, { amount: amounts[x.id] }); } }} />
              <label className="flex items-center gap-1"><input type="checkbox" checked={x.completed} onChange={(e) => patch(x.id, { completed: e.target.checked })} /> Work complete</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={x.fullyPaid} onChange={(e) => patch(x.id, { fullyPaid: e.target.checked })} /> Client paid in full</label>
              <label className="flex items-center gap-1 font-semibold"><input type="checkbox" checked={x.paidOut} disabled={x.status !== "payable" && !x.paidOut} onChange={(e) => patch(x.id, { paidOut: e.target.checked })} /> Member paid</label>
              <button onClick={() => del(x)} aria-label="Delete referral" className="ml-auto rounded-md p-1.5 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
