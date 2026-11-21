import { useEffect, useState } from "react";
import { API, kes } from "@/lib/member";

interface Row { id: number; ref: string; mode: string; permits: string; name: string; phone: string; phone2: string; email: string; county: string; ward: string; subLocation: string; location: string; village: string; placeText: string; lat: number | null; lng: number | null; useType: string; kraPin: string; applicant?: string; company?: { name: string; regNo: string; address: string; directors: { name: string; idNo: string; kraPin: string }[]; shareholders: { name: string; pct: number }[] } | null; idNo?: string; idMatch?: string; idSource?: string; fee: number; paid: number; status: string; notes: string; files: string[]; createdAt: string }
const LABEL: Record<string, string> = { co_cert: "Certificate of Incorporation", co_kra: "Company KRA certificate", co_cr12: "CR12", co_auth: "Authority letter", id_front: "ID front", id_back: "ID back", land: "Land proof", kra: "KRA", cert_warma: "WARMA certificate", cert_nema: "NEMA certificate" };

const labelOf = (k: string) => { const m = /^dir(\d+)_(front|back)$/.exec(k); return m ? `Director ${Number(m[1]) + 1} ID ${m[2]}` : LABEL[k] ?? k; };

// WARMA / NEMA permit applications. Documents are private: fetched with the admin key, never public links.
export default function PermitsAdmin({ adminKey }: { adminKey: string; onBadAdmin?: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null), [open, setOpen] = useState(0), [img, setImg] = useState<{ src: string; label: string } | null>(null);
  const h = { "x-admin-key": adminKey };
  const load = () => fetch(`${API}/api/admin/permits`, { headers: h }).then((r) => (r.ok ? r.json() : [])).then(setRows).catch(() => setRows([]));
  useEffect(() => { void load(); }, [adminKey]);
  const view = async (id: number, kind: string) => { const r = await fetch(`${API}/api/admin/permits/${id}/file/${kind}`, { headers: h }); if (r.ok) setImg({ src: URL.createObjectURL(await r.blob()), label: labelOf(kind) }); };
  const save = async (r: Row, status: string, notes: string) => { await fetch(`${API}/api/admin/permits/${r.id}`, { method: "PATCH", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ status, notes }) }); void load(); };
  if (!rows) return <p className="text-xs text-muted-foreground">Loading...</p>;
  return (
    <div data-testid="permits-admin">
      {rows.length === 0 && <p className="text-xs text-muted-foreground">No permit applications yet.</p>}
      <div className="space-y-2">{rows.map((r) => (
        <div key={r.id} className="rounded-xl border bg-card p-3 text-xs">
          <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setOpen(open === r.id ? 0 : r.id)}>
            <span><b className="text-sm">{r.ref} · {r.name}</b><br />{r.phone} · {r.mode === "apply" ? `${r.applicant === "company" ? "COMPANY, apply" : "Apply"} for client (${r.permits.toUpperCase()})` : "Client applied himself"} · {r.useType}</span>
            <span className="text-right"><b>{r.status}</b><br />{r.fee ? `${kes(r.paid)} of ${kes(r.fee)}` : "no fee"}</span>
          </button>
          {open === r.id && (
            <div className="mt-2 space-y-1.5 border-t pt-2">
              <p>{r.email}{r.phone2 ? ` · ${r.phone2}` : ""}</p>
              <p>County {r.county || "-"} · Ward {r.ward || "-"} · Location {r.location || "-"} · Sub-location {r.subLocation || "-"} · Village {r.village || "-"}</p>
              {r.kraPin && <p>{r.applicant === "company" ? "Company KRA PIN" : "KRA PIN"}: <b>{r.kraPin}</b></p>}
              {r.applicant === "company" && r.company && (
                <div className="space-y-1 rounded-lg border border-primary/30 bg-primary/5 p-2">
                  <p><b>COMPANY: {r.company.name}</b> · Reg. no. <b>{r.company.regNo}</b>{r.company.address ? ` · ${r.company.address}` : ""}</p>
                  <p className="font-bold">Directors</p>
                  {r.company.directors.map((d, i) => <p key={i}>{i + 1}. {d.name} · ID {d.idNo}{d.kraPin ? ` · PIN ${d.kraPin}` : ""}</p>)}
                  <p className="font-bold">Shareholders</p>
                  {r.company.shareholders.map((x, i) => <p key={i}>{x.name}: {x.pct}%</p>)}
                </div>
              )}
              {r.idNo && <p>ID number: <b>{r.idNo}</b> · <b className={r.idMatch === "strong" ? "text-emerald-700" : "text-sky-700"}>{({ strong: "Name and ID number read from the scanned ID", weak: "ID only partly read: check the pictures", unverified: "ID could not be read: check the pictures" } as Record<string, string>)[r.idMatch ?? ""] ?? "not scanned"}</b>{r.idSource === "photo" ? " (photo, camera not available)" : ""}</p>}
              {r.lat != null && <a className="font-bold text-primary underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}>Open map pin</a>}
              <div className="flex flex-wrap gap-2">{r.files.map((k) => <button key={k} type="button" onClick={() => void view(r.id, k)} className="rounded-lg border border-primary px-2.5 py-1 font-bold text-primary">{labelOf(k)}</button>)}</div>
              <PermitEdit r={r} save={save} />
            </div>
          )}
        </div>))}
      </div>
      {img && <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4" onClick={() => { URL.revokeObjectURL(img.src); setImg(null); }}><p className="mb-2 text-sm font-bold text-white">{img.label} (tap to close)</p><img src={img.src} alt={img.label} className="max-h-[85vh] max-w-full rounded" /></div>}
    </div>
  );
}
function PermitEdit({ r, save }: { r: Row; save: (r: Row, s: string, n: string) => void }) {
  const [s, setS] = useState(r.status), [n, setN] = useState(r.notes);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={s} onChange={(e) => setS(e.target.value)} className="rounded-lg border bg-background px-2 py-1.5"><option value="new">New</option><option value="working">Working on it</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="closed">Closed</option></select>
      <input value={n} onChange={(e) => setN(e.target.value)} placeholder="Note" maxLength={500} className="min-w-[8rem] flex-1 rounded-lg border bg-background px-2 py-1.5" />
      <button type="button" onClick={() => save(r, s, n)} className="rounded-lg bg-primary px-3 py-1.5 font-bold text-primary-foreground">Save</button>
    </div>
  );
}
