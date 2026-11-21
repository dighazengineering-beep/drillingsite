import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Loader2, FileSignature, CheckCircle, Trash2 } from "lucide-react";
import PageBanner from "@/components/PageBanner";
import { API, kes } from "@/lib/member";
import IdScanField from "@/components/IdScanField";
import type { ScanResult } from "@/components/IdScanner";
import SignaturePad from "@/components/SignaturePad";
import StampPicker from "@/components/StampPicker";
import { PhoneField } from "@/components/PhoneField";

interface Info { role: string; name: string; idNo: string; phone: string; relation: string; address: string; signed: boolean; signedAt: string | null; locked: boolean; contractNo: string; clientName: string; item: string; agreedTotal: number; pageUrl: string }

// The private page of a witness or lawyer: read the contract, then sign (a lawyer may add a stamp picture).
export default function SignerView() {
  const [, p] = useRoute("/sign/:st"); const st = p?.st ?? "";
  const [i, setI] = useState<Info | null>(null), [bad, setBad] = useState(false), [sig, setSig] = useState(""), [open, setOpen] = useState(false), [draft, setDraft] = useState("");
  const [scan, setScan] = useState<ScanResult | null>(null), [dName, setDName] = useState(""), [dId, setDId] = useState(""), [dAddr, setDAddr] = useState(""), [dPhone, setDPhone] = useState(""), [stamp, setStamp] = useState(""), [agree, setAgree] = useState(false), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const load = () => fetch(`${API}/api/signing/${st}`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setI).catch(() => setBad(true));
  useEffect(() => { if (st) load(); }, [st]);
  useEffect(() => { if (i) { setDName((v) => v || i.name); setDId((v) => v || i.idNo); setDAddr((v) => v || i.address); setDPhone((v) => v || i.phone); } }, [i?.idNo, i?.address, i?.phone]);
  const lawyer = i?.role === "lawyer";
  const pick = (f?: File) => { if (!f) return; if (f.size > 400_000) return setErr("Stamp picture is too big. Use a small PNG or JPG (under 400 KB)."); const rd = new FileReader(); rd.onload = () => setStamp(String(rd.result)); rd.readAsDataURL(f); };
  const call = async (path: string, method: string, body?: unknown) => {
    setErr(""); setBusy(true);
    try { const r = await fetch(`${API}/api/signing/${st}${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Something went wrong."); setSig(""); setStamp(""); setAgree(false); await load(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  if (bad) return <div className="p-8 text-center text-sm">This link is not valid.</div>;
  if (!i) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div>
      <PageBanner eyebrow="Contract" title={`${lawyer ? "Lawyer" : "Witness"} signing`} description={`Contract ${i.contractNo}`} />
      <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <div className="rounded-2xl border bg-card p-4 text-sm"><p className="font-extrabold">{i.name}</p><p className="text-xs text-muted-foreground">{lawyer ? "Lawyer" : "Witness"}{i.relation ? ` (${i.relation})` : ""} for {i.clientName} · {i.item} · {kes(i.agreedTotal)}</p>
          <a href={`${API}${i.pageUrl}`} target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-xl border border-primary px-4 py-2.5 text-center text-sm font-bold text-primary">Read the contract</a></div>
        {i.signed ? (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm"><p className="flex items-center gap-2 font-extrabold text-emerald-800"><CheckCircle className="h-4 w-4" /> You signed{i.signedAt ? ` on ${new Date(i.signedAt).toLocaleString("en-KE")}` : ""}.</p>
            {i.locked ? <p className="mt-2 text-xs text-emerald-900">The first payment is confirmed, so the contract is locked.</p>
              : <button type="button" disabled={busy} onClick={() => void call("/signature", "DELETE")} className="mt-3 flex items-center gap-1.5 text-xs font-bold text-red-600"><Trash2 className="h-3.5 w-3.5" /> Delete my signature (until the first payment)</button>}</div>
        ) : (
          <div className="rounded-2xl border bg-card p-4">
            <p className="mb-2 text-sm font-extrabold">Your details</p>
            <div className="mb-3 space-y-2 text-xs">
              <IdScanField purpose="contract" value={scan} onChange={setScan} onFill={(f) => { if (f.name) setDName(f.name); if (f.idNo) setDId(f.idNo); }} />
              <div><label className="font-bold" htmlFor="sg-name">Full name</label><input id="sg-name" value={dName} onChange={(e) => setDName(e.target.value)} maxLength={80} className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm" /></div>
              <div><label className="font-bold" htmlFor="sg-id">ID number</label><input id="sg-id" value={dId} onChange={(e) => setDId(e.target.value)} maxLength={20} inputMode="numeric" className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm" data-testid="signer-id" /></div>
              <div><label className="font-bold" htmlFor="sg-addr">Address</label><input id="sg-addr" value={dAddr} onChange={(e) => setDAddr(e.target.value)} maxLength={120} placeholder="For example: P.O. Box 12, Nakuru" className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm" data-testid="signer-address" /></div>
              <div><label className="font-bold" htmlFor="sg-ph">Phone (optional)</label><PhoneField id="sg-ph" value={dPhone} onChange={setDPhone} className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm" /></div>
            </div>
            <button type="button" onClick={() => { setDraft(""); setOpen(true); }} className="flex h-32 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-primary/40 bg-white">
              {sig ? <img src={sig} alt="Signature" className="max-h-28 w-auto" /> : <span className="flex items-center gap-2 text-sm font-bold text-primary"><FileSignature className="h-5 w-5" /> Tap here to sign</span>}
            </button>
            {lawyer && <div className="mt-3"><p className="mb-1 text-xs font-bold">Stamp (optional)</p><StampPicker value={stamp} onChange={setStamp} /></div>}
            <label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4" /> I have read this contract.</label>
            {err && <p className="mt-2 text-xs font-semibold text-red-600" role="alert">{err}</p>}
            <button type="button" disabled={busy || !sig || !agree || dId.trim().length < 4} onClick={() => void call("/sign", "POST", { signature: sig, stamp, agree, name: dName.trim(), idNo: dId.trim(), address: dAddr.trim(), phone: dPhone.trim() })} className="mt-3 w-full rounded-2xl bg-primary px-5 py-3.5 text-sm font-extrabold text-primary-foreground disabled:opacity-50">Save my signature</button>
            <p className="mt-2 text-[11px] text-muted-foreground">Your signature is saved with the date, time and your device.</p>
          </div>
        )}
        {open && (
          <div className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center"><div className="w-full rounded-t-3xl bg-background p-4 sm:max-w-lg sm:rounded-3xl">
            <p className="mb-2 text-sm font-extrabold">Sign here, {i.name}</p>
            <SignaturePad onChange={setDraft} heightClass="h-[40vh] max-h-[360px]" />
            <div className="mt-3 flex gap-2"><button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button>
              <button type="button" disabled={!draft} onClick={() => { setSig(draft); setOpen(false); }} className="flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-50">Use this</button></div>
          </div></div>
        )}
      </div>
    </div>
  );
}
