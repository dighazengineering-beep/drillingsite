import { RelationSelect } from "@/components/RelationSelect";
import { useEffect, useState } from "react";
import { Copy, Trash2, Users } from "lucide-react";
import { API } from "@/lib/member";
import { copyText } from "@/lib/copy";
import { PhoneField } from "@/components/PhoneField";

interface Sg { id: number; role: string; name: string; idNo: string; phone: string; relation: string; address: string; signed: boolean; signedAt: string | null }
interface Ev { at: string; actor: string; action: string; detail: string }

// Witness / lawyer of this contract, their private signing links, and the activity history.
export default function ContractPeople({ token }: { token: string }) {
  const [d, setD] = useState<{ locked: boolean; signers: Sg[]; history: Ev[] } | null>(null);
  const [role, setRole] = useState("witness"), [name, setName] = useState(""), [idNo, setIdNo] = useState(""), [rel, setRel] = useState(""), [phone, setPhone] = useState(""), [err, setErr] = useState(""), [copied, setCopied] = useState(0);
  // The private signing links are shown by the server ONCE and kept only on this device: the main contract link can never read them again.
  const store = `kws-sl-${token}`;
  const [links, setLinks] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem(store) || "{}"); } catch { return {}; } });
  const keep = (k: string, link: string) => setLinks((l) => { const n = { ...l, [k]: link }; try { localStorage.setItem(store, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const linkFor = async (s: Sg): Promise<string> => {   // the link kept on this device, or a fresh one (the old link then stops working)
    const k = `${s.role}:${s.name}`; if (links[k]) return links[k];
    setErr(""); const r = await fetch(`${API}/api/contracts/${token}/signers/${s.id}/newlink`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || "Could not make a link."); return ""; }
    keep(k, j.link); return j.link as string;
  };
  const addPerson = async () => {
    setErr(""); const r = await fetch(`${API}/api/contracts/${token}/signers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role, name, idNo, phone, relation: rel }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErr(j.error || "Failed."); else { if (j.link) keep(`${role}:${name.trim()}`, j.link); setName(""); setIdNo(""); setPhone(""); setRel(""); }
    load();
  };
  const load = () => fetch(`${API}/api/contracts/${token}/signers`).then((r) => r.json()).then(setD).catch(() => {});
  useEffect(() => { load(); const t = window.setInterval(load, 15000); return () => window.clearInterval(t); }, [token]);
  const act = async (url: string, method: string, body?: unknown) => {
    setErr(""); const r = await fetch(`${API}/api/contracts/${token}${url}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || "Failed."); else { setName(""); setIdNo(""); setPhone(""); setRel(""); } load();
  };
  if (!d) return null;
  const inp = "w-full rounded-xl border bg-background px-3 py-2 text-sm";
  return (
    <div className="rounded-2xl border bg-card p-4" data-testid="contract-people">
      <p className="mb-1 flex items-center gap-2 text-sm font-extrabold"><Users className="h-4 w-4 text-primary" /> Witnesses (up to 3) and lawyer (optional)</p>
      <p className="mb-3 text-xs text-muted-foreground">Add only the name. The witness fills in their own ID and address before signing: send them their private link, or if they are with you, tap "sign on this phone". Each person gets their own private link to read and sign. You can remove them until the first payment is confirmed; after that the contract is locked.</p>
      {d.signers.map((s) => (
        <div key={s.id} className="mb-2 rounded-xl border p-3 text-xs">
          <p className="font-bold">{s.role === "lawyer" ? "Lawyer" : "Witness"}: {s.name}{s.relation ? ` (${s.relation})` : ""}{s.idNo ? ` · ID ${s.idNo}` : ""}{s.phone ? ` · ${s.phone}` : ""} <span className={s.signed ? "text-emerald-700" : "text-sky-700"}>({s.signed ? "signed" : "not signed yet"})</span></p>
          <div className="mt-2 flex gap-3"><button type="button" onClick={async () => { const l = await linkFor(s); if (l) { void copyText(l); setCopied(s.id); } }} className="flex items-center gap-1 font-bold text-primary"><Copy className="h-3 w-3" /> {copied === s.id ? "Link copied" : "Copy signing link"}</button>
            {!s.signed && !d.locked && <button type="button" onClick={async () => { const l = await linkFor(s); if (l) window.location.href = l; }} className="flex items-center gap-1 font-bold text-emerald-700" data-testid="sign-here-link">Witness is here: sign on this phone</button>}
            {!d.locked && <button type="button" onClick={() => void act(`/signers/${s.id}`, "DELETE")} className="flex items-center gap-1 font-bold text-red-600"><Trash2 className="h-3 w-3" /> Remove</button>}</div>
        </div>
      ))}
      {!d.locked ? (
        <div className="mt-2 space-y-2">
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inp}><option value="witness" disabled={d.signers.filter((x) => x.role === "witness").length >= 3}>Witness (up to 3)</option><option value="lawyer" disabled={d.signers.some((x) => x.role === "lawyer")}>Lawyer</option></select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" maxLength={80} className={inp} />
          {role === "witness" && <RelationSelect value={rel} onChange={setRel} className={inp} />}
          <div className="grid gap-2"><input value={idNo} onChange={(e) => setIdNo(e.target.value)} placeholder={role === "lawyer" ? "ID (optional)" : "ID number (optional)"} maxLength={20} className={inp} /><PhoneField value={phone} onChange={setPhone} className={inp} /></div>
          <button type="button" disabled={name.trim().length < 2} onClick={() => void addPerson()} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground disabled:opacity-50">Add {role}</button>
        </div>
      ) : <p className="text-xs font-semibold text-sky-700">Locked: the first payment is confirmed.</p>}
      {err && <p className="mt-2 text-xs font-semibold text-red-600" role="alert">{err}</p>}
      <p className="mb-1 mt-4 text-xs font-extrabold">Activity history</p>
      <ul className="max-h-48 space-y-1 overflow-auto text-[11px] text-muted-foreground">{d.history.map((h, k) => <li key={k}><b className="text-foreground">{new Date(h.at).toLocaleString("en-KE")}</b> · {h.actor}: {h.action}{h.detail ? ` (${h.detail})` : ""}</li>)}</ul>
    </div>
  );
}
