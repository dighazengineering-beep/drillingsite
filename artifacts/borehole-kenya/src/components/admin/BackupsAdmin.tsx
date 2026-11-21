import { useEffect, useState } from "react";
import { DatabaseBackup, Download, CloudCheck } from "lucide-react";
import { API } from "@/lib/member";
import StartFresh from "./StartFresh";

interface B { id: number; kind: string; bytes: number; tableCount: number; rowCount: number; offsite: string; note: string; downloadable: boolean; createdAt: string }
const size = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function BackupsAdmin({ adminKey, onBadAdmin }: { adminKey: string; onBadAdmin: () => void }) {
  const h = { "x-admin-key": adminKey };
  const [list, setList] = useState<B[] | null>(null);
  const [offsiteOn, setOffsiteOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () =>
    fetch(`${API}/api/admin/backups`, { headers: h })
      .then((r) => { if (r.status === 403) { onBadAdmin(); throw new Error("403"); } return r.json(); })
      .then((d) => { setList(d.backups ?? []); setOffsiteOn(!!d.offsiteOn); })
      .catch(() => setList((l) => l ?? []));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`${API}/api/admin/backups`, { method: "POST", headers: h });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Backup failed.");
      setMsg(d.note || "Backup saved.");
      load();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  const download = async (b: B) => {
    const r = await fetch(`${API}/api/admin/backups/${b.id}/download`, { headers: h });
    if (!r.ok) { window.alert("That copy is no longer stored here."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await r.blob());
    a.download = `backup-${b.createdAt.slice(0, 10)}.json.gz`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">A backup of all your data is made every week by itself. You can also make one now, and download any of the last 4. Photos and videos are not inside it (they live on Cloudinary and GitHub).</p>
      <div className={`mb-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${offsiteOn ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}`}>
        <CloudCheck className="mt-0.5 h-4 w-4 shrink-0" />
        {offsiteOn ? "Copies are also saved to your private backup repo (last 8 kept)." : "Copies stay on the server only. For safety, add BACKUP_GITHUB_REPO on Render (a private GitHub repo, like yourname/sab-backups) to also keep them outside."}
      </div>
      <button onClick={run} disabled={busy} className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"><DatabaseBackup className="h-4 w-4" /> {busy ? "Backing up…" : "Back up now"}</button>
      {msg && <p className="mb-3 text-xs font-semibold text-foreground">{msg}</p>}
      {list === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {list?.length === 0 && <p className="text-sm text-muted-foreground">No backups yet. The first one is made automatically soon after the server starts, or tap Back up now.</p>}
      <div className="divide-y divide-border">
        {list?.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{new Date(b.createdAt).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">· {b.kind === "auto" ? "weekly" : "manual"}</span></p>
              <p className="text-xs text-muted-foreground">{size(b.bytes)} · {b.tableCount} tables · {b.rowCount.toLocaleString()} records{b.offsite ? " · saved to repo" : ""}</p>
              {b.note && <p className="text-[11px] text-sky-700">{b.note}</p>}
            </div>
            {b.downloadable ? <button onClick={() => download(b)} aria-label="Download" className="shrink-0 rounded-lg p-2 text-primary hover:bg-primary/10"><Download className="h-4 w-4" /></button> : <span className="shrink-0 text-[10px] text-muted-foreground">in repo</span>}
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">To restore, send the backup file to a developer: it is a compressed JSON file with every table, so records can be loaded back into a fresh database.</p>
      <StartFresh adminKey={adminKey} />
    </div>
  );
}
