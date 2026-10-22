import { useEffect, useState } from "react";
import { Trash2, Phone, Mail, MapPin } from "lucide-react";
import { API } from "@/pages/Feed";

interface Enq { id: number; name: string; phone: string; email: string | null; county: string | null; inquiryType: string; message: string; createdAt: string }

/** Messages sent through the Contact form. Call or email back from here, delete when done. */
export default function EnquiriesAdmin({ adminKey, onBadAdmin }: { adminKey: string; onBadAdmin: () => void }) {
  const [rows, setRows] = useState<Enq[] | null>(null);
  const h = { "x-admin-key": adminKey };
  useEffect(() => {
    fetch(`${API}/api/admin/inquiries`, { headers: h })
      .then((r) => { if (r.status === 403) { onBadAdmin(); throw new Error("403"); } return r.json(); })
      .then((d) => setRows(Array.isArray(d) ? d : [])).catch(() => setRows([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const del = async (e: Enq) => {
    if (!window.confirm("Delete this enquiry?")) return;
    await fetch(`${API}/api/admin/inquiries/${e.id}`, { method: "DELETE", headers: h });
    setRows((l) => (l ?? []).filter((x) => x.id !== e.id));
  };
  return (
    <div>
      {rows === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">No enquiries yet.</p>}
      <div className="space-y-3">
        {rows?.map((e) => (
          <div key={e.id} className="rounded-2xl border border-border bg-background/60 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{e.name}</p>
                <p className="text-[11px] text-muted-foreground">{e.inquiryType} · {new Date(e.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
              <button onClick={() => del(e)} aria-label="Delete" className="shrink-0 rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground/90">{e.message}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
              <a href={`tel:${e.phone}`} className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-primary"><Phone className="h-3 w-3" /> {e.phone}</a>
              {e.email && <a href={`mailto:${e.email}`} className="flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-sky-700"><Mail className="h-3 w-3" /> {e.email}</a>}
              {e.county && <span className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-muted-foreground"><MapPin className="h-3 w-3" /> {e.county}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
