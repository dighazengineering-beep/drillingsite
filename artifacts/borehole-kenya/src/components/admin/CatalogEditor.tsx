import { useEffect, useMemo, useState } from "react";
import { Trash2, Plus, ChevronDown, Search, Check } from "lucide-react";
import { API } from "@/pages/Feed";
import PhotoField from "@/components/admin/PhotoField";

type Kind = "products" | "services" | "projects";
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const input = "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const num = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(Number(v)));
const kes = (v: unknown) => (v === null || v === undefined || v === "" ? "-" : `Ksh ${Number(v).toLocaleString()}`);

interface Field { key: string; label: string; type?: "text" | "number" | "area" | "bool" | "lines" | "photo"; hint?: string; readOnlyWhenEditing?: boolean }

const FIELDS: Record<Kind, Field[]> = {
  products: [
    { key: "name", label: "Name", hint: "If you rename a product, upload a photo for it below" },
    { key: "category", label: "Category" },
    { key: "brand", label: "Brand" },
    { key: "price", label: "Price (Ksh)", type: "number" },
    { key: "comparePrice", label: "Old price to cross out (Ksh, optional)", type: "number" },
    { key: "stockQty", label: "Quantity in stock", type: "number" },
    { key: "deliveryDays", label: "Delivery days", type: "number" },
    { key: "description", label: "Description", type: "area" },
    { key: "specifications", label: "Specifications (one per line, Name: value)", type: "lines" },
    { key: "inStock", label: "In stock", type: "bool" },
    { key: "deliveryAvailable", label: "Delivery available", type: "bool" },
    { key: "whatsappOrderEnabled", label: "Order on WhatsApp", type: "bool" },
    { key: "featured", label: "Show on home page", type: "bool" },
    { key: "imageUrl", label: "Photo", type: "photo" },
  ],
  services: [
    { key: "name", label: "Name" },
    { key: "category", label: "Category" },
    { key: "priceFrom", label: "Price from (Ksh)", type: "number" },
    { key: "priceUnit", label: "Price per (e.g. per metre, per borehole)" },
    { key: "duration", label: "Duration" },
    { key: "shortDescription", label: "Short description (shown on the card)", type: "area" },
    { key: "description", label: "Full description (prices written in here are not updated automatically)", type: "area" },
    { key: "highlights", label: "Highlights (one per line)", type: "lines" },
    { key: "coverageAreas", label: "Areas covered (one per line)", type: "lines" },
    { key: "featured", label: "Show on home page", type: "bool" },
    { key: "imageUrl", label: "Photo", type: "photo" },
  ],
  projects: [
    { key: "title", label: "Project title" },
    { key: "serviceType", label: "Type of work (e.g. Borehole Drilling, Survey, Solar Pump)" },
    { key: "county", label: "County / country" },
    { key: "town", label: "Town" },
    { key: "region", label: "Region" },
    { key: "clientType", label: "Client type (Private, Government, Humanitarian…)" },
    { key: "depth", label: "Depth (metres)", type: "number" },
    { key: "yield", label: "Yield (e.g. 5.5 m³/hr)" },
    { key: "duration", label: "Duration" },
    { key: "completionYear", label: "Year (0 hides it)", type: "number" },
    { key: "description", label: "Description", type: "area" },
    { key: "challenge", label: "Challenge", type: "area" },
    { key: "solution", label: "Solution", type: "area" },
    { key: "outcome", label: "Outcome", type: "area" },
    { key: "featured", label: "Show first (featured)", type: "bool" },
    { key: "imageUrl", label: "Photo", type: "photo" },
  ],
};
const TITLE = (k: Kind, r: Row) => String(k === "projects" ? r.title : r.name);
const SUB = (k: Kind, r: Row) => (k === "projects" ? `${r.serviceType} · ${r.town || r.county}` : `${r.category}${k === "products" && !r.inStock ? " · out of stock" : ""}`);
const SIDE = (k: Kind, r: Row) => (k === "projects" ? (r.featured ? "Featured" : "") : kes(k === "products" ? r.price : r.priceFrom));

const toForm = (kind: Kind, r: Row): Row => {
  const f: Row = {};
  FIELDS[kind].forEach(({ key, type }) => {
    const v = r[key];
    if (type === "lines") f[key] = Array.isArray(v) ? v.join("\n") : v && typeof v === "object" ? Object.entries(v).map(([k, x]) => `${k}: ${x}`).join("\n") : "";
    else if (type === "number") f[key] = num(v);
    else if (type === "bool") f[key] = !!v;
    else f[key] = v ?? "";
  });
  return f;
};

export default function CatalogEditor({ kind, adminKey, onBadAdmin }: { kind: Kind; adminKey: string; onBadAdmin: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | "new" | null>(null);
  const noun = kind === "products" ? "product" : kind === "services" ? "service" : "project";

  const call = async (path: string, method: string, body?: unknown) => {
    const r = await fetch(`${API}/api/admin/${kind}${path}`, {
      method, headers: { "x-admin-key": adminKey, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 403) { onBadAdmin(); throw new Error("Admin key no longer valid"); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? "Something went wrong");
    return d;
  };

  useEffect(() => { setRows(null); call("", "GET").then(setRows).catch(() => setRows([])); }, [kind, adminKey]);

  const shown = useMemo(() => (rows ?? []).filter((r) => `${TITLE(kind, r)} ${r.category ?? r.serviceType ?? ""} ${r.brand ?? r.town ?? ""}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input className={`${input} pl-8`} placeholder={`Search ${kind}`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button onClick={() => setOpen(open === "new" ? null : "new")} className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> Add {noun}
        </button>
      </div>

      {open === "new" && (
        <Editor kind={kind} adminKey={adminKey} initial={toForm(kind, {})} creating onCancel={() => setOpen(null)}
          onSave={async (f) => { const d = await call("", "POST", f); setRows((l) => [...(l ?? []), d]); setOpen(null); }} />
      )}

      {rows === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      <div className="divide-y divide-border">
        {shown.map((r) => (
          <div key={r.id} className="py-2">
            <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center justify-between gap-3 text-left">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{TITLE(kind, r)}</p>
                <p className="truncate text-xs text-muted-foreground">{SUB(kind, r)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-bold text-primary">{SIDE(kind, r)}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${open === r.id ? "rotate-180" : ""}`} />
              </div>
            </button>
            {open === r.id && (
              <div className="mt-2">
                <Editor kind={kind} adminKey={adminKey} initial={toForm(kind, r)}
                  onCancel={() => setOpen(null)}
                  onSave={async (f) => { const d = await call(`/${r.id}`, "PATCH", f); setRows((l) => (l ?? []).map((x) => (x.id === r.id ? d : x))); setOpen(null); }}
                  onDelete={async () => {
                    if (!window.confirm(`Delete "${TITLE(kind, r)}"? This cannot be undone.`)) return;
                    await call(`/${r.id}`, "DELETE"); setRows((l) => (l ?? []).filter((x) => x.id !== r.id)); setOpen(null);
                  }} />
              </div>
            )}
          </div>
        ))}
        {rows && shown.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nothing found.</p>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Changes show on the website the next time a visitor opens or refreshes the page.</p>
    </div>
  );
}

function Editor({ kind, adminKey, initial, creating, onSave, onCancel, onDelete }: {
  kind: Kind; adminKey: string; initial: Row; creating?: boolean; onSave: (f: Row) => Promise<void>; onCancel: () => void; onDelete?: () => Promise<void>;
}) {
  const [f, setF] = useState<Row>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    try { await onSave(f); } catch (x) { setMsg(x instanceof Error ? x.message : "Could not save"); }
    setBusy(false);
  };

  return (
    <form onSubmit={save} className="space-y-3 rounded-xl border border-border bg-background/60 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS[kind].filter((x) => x.type !== "bool").map((x) => {
          const wide = x.type === "area" || x.type === "lines" || x.type === "photo";
          const ro = x.readOnlyWhenEditing && !creating;
          return (
            <div key={x.key} className={wide ? "sm:col-span-2" : ""}>
              <label className={label}>{x.label}</label>
              {x.type === "photo" ? (
                <PhotoField value={f[x.key] ?? ""} onChange={(v) => set(x.key, v)} adminKey={adminKey} />
              ) : wide ? (
                <textarea className={input} rows={x.type === "lines" ? 4 : 3} value={f[x.key]} onChange={(e) => set(x.key, e.target.value)} />
              ) : (
                <input className={`${input} ${ro ? "opacity-60" : ""}`} type={x.type === "number" ? "number" : "text"} inputMode={x.type === "number" ? "decimal" : undefined}
                  min={x.type === "number" ? 0 : undefined} step={x.type === "number" ? "any" : undefined} value={f[x.key]} readOnly={ro} onChange={(e) => set(x.key, e.target.value)} />
              )}
              {ro && x.hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{x.hint}</p>}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {FIELDS[kind].filter((x) => x.type === "bool").map((x) => (
          <label key={x.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!f[x.key]} onChange={(e) => set(x.key, e.target.checked)} className="h-4 w-4" /> {x.label}
          </label>
        ))}
      </div>
      {msg && <p className="text-xs text-red-600">{msg}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy} className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Check className="h-4 w-4" /> {busy ? "Saving…" : creating ? "Add" : "Save changes"}</button>
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Cancel</button>
        {onDelete && <button type="button" onClick={onDelete} className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button>}
      </div>
    </form>
  );
}
