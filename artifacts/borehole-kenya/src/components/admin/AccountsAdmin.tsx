import { useEffect, useMemo, useState } from "react";
import { Search, Ban, CheckCircle2, Trash2, ShieldCheck } from "lucide-react";
import { API } from "@/pages/Feed";

interface Acc { id: number; name: string; email: string; phone: string | null; google: boolean; suspended: boolean; createdAt: string; referrals: number }

/** Every account on the site. Suspend (signs the person out and blocks log in) or delete. */
export default function AccountsAdmin({ adminKey, onBadAdmin }: { adminKey: string; onBadAdmin: () => void }) {
  const [rows, setRows] = useState<Acc[] | null>(null);
  const [q, setQ] = useState("");
  const h = { "x-admin-key": adminKey, "Content-Type": "application/json" };

  const load = () =>
    fetch(`${API}/api/admin/members`, { headers: h })
      .then((r) => { if (r.status === 403) { onBadAdmin(); throw new Error("403"); } return r.json(); })
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows((l) => l ?? []));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const suspend = async (a: Acc) => {
    if (!a.suspended && !window.confirm(`Suspend ${a.name}? They will be signed out and cannot log in.`)) return;
    await fetch(`${API}/api/admin/members/${a.id}/suspend`, { method: "POST", headers: h, body: JSON.stringify({ suspended: !a.suspended }) });
    load();
  };
  const del = async (a: Acc) => {
    if (!window.confirm(`Delete the account of ${a.name} (${a.email})? This cannot be undone.`)) return;
    await fetch(`${API}/api/admin/members/${a.id}`, { method: "DELETE", headers: h });
    setRows((l) => (l ?? []).filter((x) => x.id !== a.id));
  };

  const shown = useMemo(() => (rows ?? []).filter((a) => `${a.name} ${a.email} ${a.phone ?? ""}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);

  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or phone" className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
      </div>
      {rows === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows && <p className="mb-2 text-xs text-muted-foreground">{rows.length} accounts · {rows.filter((a) => a.suspended).length} suspended</p>}
      <div className="divide-y divide-border">
        {shown.map((a) => (
          <div key={a.id} className="flex items-center gap-3 py-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-extrabold text-white ${a.suspended ? "bg-slate-400" : "bg-gradient-to-br from-emerald-600 to-sky-500"}`}>{a.name.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">{a.name}
                {a.google && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-sky-500" aria-label="Signed in with Google" />}
                {a.suspended && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Suspended</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{a.email}{a.phone ? ` · ${a.phone}` : ""}</p>
              <p className="text-[11px] text-muted-foreground/80">Joined {new Date(a.createdAt).toLocaleDateString("en-KE", { dateStyle: "medium" })}{a.referrals ? ` · ${a.referrals} referrals` : ""}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button onClick={() => suspend(a)} title={a.suspended ? "Restore account" : "Suspend account"} className={`rounded-lg p-2 ${a.suspended ? "text-emerald-700 hover:bg-emerald-50" : "text-amber-600 hover:bg-amber-50"}`}>
                {a.suspended ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
              </button>
              <button onClick={() => del(a)} title="Delete account" className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        {rows && shown.length === 0 && <p className="py-4 text-sm text-muted-foreground">No accounts found.</p>}
      </div>
    </div>
  );
}
