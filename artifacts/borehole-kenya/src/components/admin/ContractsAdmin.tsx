import CopyLink from "@/components/CopyLink";
import { useEffect, useState } from "react";
import { Printer, Copy } from "lucide-react";
import { API, kes, docUrl } from "@/lib/member";
import { copyText } from "@/lib/copy";

interface Row { token: string; no: string; name: string; phone: string; item: string; agreedTotal: number; quotedTotal: number; paid: number; signed: boolean; idMatch?: string; idKinds?: string[]; createdAt: string }

// Contracts made on the site. Each one shows what was agreed, whether the client signed, and how much has really been paid.
export default function ContractsAdmin({ adminKey }: { adminKey: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [idImg, setIdImg] = useState<{ src: string; label: string } | null>(null);
  const viewId = async (tok: string, kind: string) => { const r = await fetch(`${API}/api/admin/contracts/${tok}/id/${kind}`, { headers: { "x-admin-key": adminKey } }); if (r.ok) setIdImg({ src: URL.createObjectURL(await r.blob()), label: kind === "id_front" ? "ID front" : "ID back" }); };
  const [copied, setCopied] = useState(""), [hist, setHist] = useState<{ tok: string; rows: { at: string; actor: string; action: string; detail: string }[] } | null>(null);
  const showHist = (tok: string) => fetch(`${API}/api/admin/contracts/${tok}/history`, { headers: { "x-admin-key": adminKey } }).then((r) => (r.ok ? r.json() : [])).then((rows) => setHist({ tok, rows })).catch(() => {});
  useEffect(() => { fetch(`${API}/api/admin/contracts`, { headers: { "x-admin-key": adminKey } }).then((r) => (r.ok ? r.json() : [])).then(setRows).catch(() => setRows([])); }, [adminKey]);
  if (!rows) return null;
  return (
    <div className="mt-6" data-testid="contracts-admin">
      <h3 className="mb-2 text-sm font-bold text-foreground">Contracts ({rows.length})</h3>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">No contracts yet. Clients make them from the Contract button on the home page.</p>}
      <div className="grid gap-2">
        {rows.map((c) => (
          <div key={c.token} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">{c.no} · {c.item}</p>
                <p className="text-xs text-muted-foreground">{c.name} · {c.phone}</p>
                <p className="text-xs text-muted-foreground">Issued · Paid {kes(c.paid)} of {kes(c.agreedTotal)}{c.quotedTotal > c.agreedTotal ? ` (quoted ${kes(c.quotedTotal)})` : ""}</p>
              </div>
              <p className="shrink-0 text-sm font-extrabold text-primary">{kes(c.agreedTotal)}</p>
            </div>
            <div className="mt-1.5 flex gap-4 text-[11px] font-bold">
              <button onClick={() => { void copyText(`${window.location.origin}/contract/${c.token}`).then((ok) => { if (ok) setCopied(c.token); }); }} className="flex items-center gap-1 text-primary"><Copy className="h-3 w-3" /> {copied === c.token ? "Copied" : "Copy link"}</button>
              <CopyLink url={docUrl(`/api/contracts/${c.token}/pdf`)} label="Copy PDF link" />
              <a href={docUrl(`/api/contracts/${c.token}/page`)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary"><Printer className="h-3 w-3" /> Open</a>
              <button onClick={() => void showHist(c.token)} className="text-primary">History</button>
              {(c.idKinds ?? []).map((k) => <button key={k} onClick={() => void viewId(c.token, k)} className="text-primary">{k === "id_front" ? "ID front" : "ID back"}</button>)}
              {c.idMatch !== undefined && <span className={c.idMatch === "strong" ? "text-emerald-700" : "text-sky-700"}>{({ strong: "ID read OK", weak: "ID partly read", unverified: "ID NOT read: check pictures" } as Record<string, string>)[c.idMatch] ?? "ID not scanned"}</span>}
            </div>
            {hist?.tok === c.token && <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-[11px] text-muted-foreground">{hist.rows.length === 0 ? <li>No history yet.</li> : hist.rows.map((h, k) => <li key={k}><b className="text-foreground">{new Date(h.at).toLocaleString("en-KE")}</b> · {h.actor}: {h.action}{h.detail ? ` (${h.detail})` : ""}</li>)}</ul>}
          </div>
        ))}
      </div>
      {idImg && <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4" onClick={() => { URL.revokeObjectURL(idImg.src); setIdImg(null); }}><p className="mb-2 text-sm font-bold text-white">{idImg.label} (tap to close)</p><img src={idImg.src} alt={idImg.label} className="max-h-[85vh] max-w-full rounded" /></div>}
    </div>
  );
}
