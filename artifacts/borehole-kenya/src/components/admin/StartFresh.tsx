import { useEffect, useState } from "react";
import { Eraser, Loader2 } from "lucide-react";
import { API } from "@/lib/member";

interface G { key: string; label: string; count: number }
// Clears the test records before real customers arrive. A full backup is saved first; the website content is never touched.
export default function StartFresh({ adminKey }: { adminKey: string }) {
  const h = { "x-admin-key": adminKey, "Content-Type": "application/json" };
  const [groups, setGroups] = useState<G[] | null>(null), [pick, setPick] = useState<Record<string, boolean>>({}), [word, setWord] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [bad, setBad] = useState(false);
  const load = () => fetch(`${API}/api/admin/cleanup`, { headers: h }).then((r) => (r.ok ? r.json() : null)).then(setGroups).catch(() => setGroups(null));
  useEffect(() => { void load(); }, [adminKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = Object.keys(pick).filter((k) => pick[k]);
  const go = async () => {
    setBusy(true); setMsg(""); setBad(false);
    try {
      const r = await fetch(`${API}/api/admin/cleanup`, { method: "POST", headers: h, body: JSON.stringify({ groups: chosen, confirm: word }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setBad(true); setMsg(j.error || "Could not clear."); }
      else { setMsg(`Done. A backup (number ${j.backupId}) was saved first. Cleared: ${Object.entries(j.cleared as Record<string, number>).map(([k, v]) => `${k} (${v})`).join(", ")}.`); setPick({}); setWord(""); await load(); }
    } catch { setBad(true); setMsg("Could not reach the server."); }
    setBusy(false);
  };
  if (!groups) return null;
  return (
    <div className="mt-6 rounded-2xl border border-red-300 bg-red-50/60 p-4 dark:bg-red-500/5" data-testid="start-fresh">
      <p className="flex items-center gap-2 text-sm font-bold text-red-700"><Eraser className="h-4 w-4" /> Start fresh (clear test records)</p>
      <p className="mt-1 text-xs text-foreground/80">Tick what to delete. A full backup is saved first. Your services, products, projects and videos are not touched. Numbers start again from 1.</p>
      <div className="mt-3 grid gap-1.5">
        {groups.map((g) => (
          <label key={g.key} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground">
            <span className="flex items-center gap-2"><input type="checkbox" checked={!!pick[g.key]} onChange={(e) => setPick({ ...pick, [g.key]: e.target.checked })} className="h-4 w-4" data-testid={`clear-${g.key}`} />{g.label}</span>
            <span className="text-muted-foreground">{g.count}</span>
          </label>
        ))}
      </div>
      <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Type DELETE to confirm" className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-red-500" data-testid="input-clear-confirm" />
      <button disabled={busy || !chosen.length || word !== "DELETE"} onClick={() => void go()} className="mt-2 flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition active:scale-95 disabled:opacity-40" data-testid="button-clear-go">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />} Clear the ticked records</button>
      {msg && <p className={`mt-2 text-xs font-semibold ${bad ? "text-red-600" : "text-emerald-700"}`} role="status">{msg}</p>}
    </div>
  );
}
