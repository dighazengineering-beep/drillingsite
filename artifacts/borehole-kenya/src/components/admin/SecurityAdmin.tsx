import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { API } from "@/lib/member";

interface Row { id: number; ok: boolean; ip: string; deviceLabel: string; note: string; createdAt: string }

export default function SecurityAdmin({ adminKey, onBadAdmin }: { adminKey: string; onBadAdmin: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    fetch(`${API}/api/admin/security`, { headers: { "x-admin-key": adminKey } })
      .then((r) => { if (r.status === 403) { onBadAdmin(); throw new Error("403"); } return r.json(); })
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows((l) => l ?? []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const bad = (rows ?? []).filter((r) => !r.ok && Date.now() - new Date(r.createdAt).getTime() < 86_400_000).length;
  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">Every admin sign-in is listed here, and you get a text when someone signs in. After 8 wrong passwords from one device, it is blocked for 15 minutes. If a sign-in is not yours, change <b>ADMIN_KEY</b> on Render.</p>
      <div className={`mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${bad ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"}`}>
        {bad ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        {bad ? `${bad} wrong password attempt${bad > 1 ? "s" : ""} in the last 24 hours` : "No wrong password attempts in the last 24 hours"}
      </div>
      {rows === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>}
      <div className="divide-y divide-border">
        {rows?.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{r.deviceLabel}</p>
              <p className="truncate text-xs text-muted-foreground">{r.ip} · {r.note}</p>
            </div>
            <div className="shrink-0 text-right">
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${r.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>{r.ok ? "Signed in" : "Failed"}</span>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
