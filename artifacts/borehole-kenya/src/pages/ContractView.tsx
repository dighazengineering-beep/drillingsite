import CopyLink from "@/components/CopyLink";
import { useEffect, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Banknote, FileText, ArrowLeft, CheckCircle, Printer, Smartphone, Landmark, Loader2, FileSignature, Copy, ShieldCheck, ScrollText, Wallet, Clock, ChevronDown, Lock } from "lucide-react";
import PageBanner from "@/components/PageBanner";
import { API, kes, docUrl } from "@/lib/member";
import ContractPeople from "@/components/ContractPeople";
import SignaturePad from "@/components/SignaturePad";
import StampPicker from "@/components/StampPicker";
import { copyText } from "@/lib/copy";
import QuoteTable, { type QLine } from "@/components/QuoteTable";
import { PhoneField } from "@/components/PhoneField";
import { OfflinePayFields, emptyOffline, offlineBody, type OfflineState } from "@/components/OfflinePayFields";

interface Stage { id: string; label: string; amount: number; status: "paid" | "pending" | "open"; paidId?: number }
interface Contract {
  token: string; no: string; quoteId: number; name: string; phone: string; item: string; casing: string; depth: number; location: string;
  quoteRate: number; agreedRate: number; quoteTotal: number; agreedTotal: number; discount: number; stages: Stage[]; paid: number; pending: number; remaining: number;
  signed: boolean; signedName: string; signedAt: string | null; lines: QLine[] | null; terms: string; idNo: string; address: string; witnessName: string; witnessId: string; email: string; payMode?: string; siteDay?: string; quoteToken: string;
}
interface Bank { bankName: string; accountName: string; accountNumber: string; paybill?: string }

const Rich = ({ t }: { t: string }) => <>{t.split(/\*\*(.+?)\*\*/g).map((x, i) => (i % 2 ? <b key={i} className="text-foreground">{x}</b> : x))}</>;   // **text** is shown bold
const clausesOf = (terms: string) => terms.split("\n\n").map((t) => { const [h, ...rest] = t.split("\n"); return { title: h.replace(/^\d+\.\s*/, ""), lines: rest }; });
const inp = "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30";
const lab = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground";

export default function ContractView() {
  const [, params] = useRoute("/contract/:token");
  const [, nav] = useLocation();
  const token = params?.token ?? "";
  const [c, setC] = useState<Contract | null>(null);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [payStage, setPayStage] = useState<string | null>(null);
  const [method, setMethod] = useState<"mpesa" | "bank" | "cash" | "cheque">("mpesa");
  const [off, setOff] = useState<OfflineState>(emptyOffline());
  const [phone, setPhone] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [cfg, setCfg] = useState<{ mpesa: boolean; banks: Bank[] }>({ mpesa: true, banks: [] });
  const [note, setNote] = useState("");
  const [copiedAcc, setCopiedAcc] = useState("");
  const poll = useRef<number | undefined>(undefined);
  const [sig, setSig] = useState(""), [padOpen, setPadOpen] = useState<"" | "client" | "witness">(""), [draftSig, setDraftSig] = useState(""), [wSig, setWSig] = useState(""), [agree, setAgree] = useState(false), [signing, setSigning] = useState(false), [sigErr, setSigErr] = useState("");

  const load = () => fetch(`${API}/api/contracts/${token}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((d: Contract) => { setC(d); setPhone((p) => p || d.phone); }).catch(() => setMissing(true));
  useEffect(() => { if (token) load(); fetch(`${API}/api/payments/config`).then((r) => r.json()).then((d) => setCfg({ mpesa: !!d.mpesa, banks: Array.isArray(d.banks) ? d.banks : [] })).catch(() => {}); return () => window.clearInterval(poll.current); }, [token]);

  const [cStamp, setCStamp] = useState("");
  const signNow = async () => {
    setSigErr(""); setSigning(true);
    try {
      const r = await fetch(`${API}/api/contracts/${token}/sign`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signature: sig, agree, stamp: cStamp || undefined }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not save your signature.");
      await load();
    } catch (e) { setSigErr((e as Error).message); }
    setSigning(false);
  };

  const pay = async (stage: string) => {
    setErr(""); setNote(""); setBusy(true);
    try {
      const r = await fetch(`${API}/api/payments/${method === "cash" || method === "cheque" ? "offline" : method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractToken: token, stage, phone, name: c?.name, bankRef: method === "bank" ? bankRef : undefined, ...(method === "cash" || method === "cheque" ? { method, ...offlineBody(off) } : {}) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not start the payment.");
      if (method !== "mpesa") { setNote(method === "bank" ? "We received your payment proof and will confirm it shortly." : `We noted your ${method} payment. We will confirm it once we receive it, then send your receipt.`); setPayStage(null); setBankRef(""); setOff(emptyOffline()); await load(); }
      else {
        setNote("Check your phone and enter your M-Pesa PIN.");
        let n = 0;
        window.clearInterval(poll.current);
        poll.current = window.setInterval(async () => {
          n++;
          const s = await fetch(`${API}/api/payments/${d.id}/status?key=${d.key}`).then((x) => x.json()).catch(() => ({}));
          if (s.status && s.status !== "pending") { window.clearInterval(poll.current); setNote(s.status === "paid" ? "Payment received. Thank you!" : "The payment did not go through. You can try again."); setPayStage(null); await load(); }
          else if (n > 60) { window.clearInterval(poll.current); await load(); }
        }, 3000);
        await load();
      }
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  if (missing) return <div className="mx-auto max-w-xl px-4 py-16 text-center text-sm text-muted-foreground">We could not find this contract. Please check the link.</div>;
  if (!c) return <div className="flex justify-center py-20 text-primary"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  const nextOpen = c.stages.find((s) => s.status !== "paid");
  const canChange = !c.signed && c.paid === 0 && c.pending === 0;   // until it is paid, the details can still be changed
  if (!canChange) { try { sessionStorage.removeItem("kws-contract-draft"); sessionStorage.removeItem("kws-contract-last"); } catch { /* ignore */ } }   // once paid the contract is final: the next contract starts with a clean form
  const payable = c.stages.find((s) => s.status === "open");
  const unpaidSteps = c.stages.filter((s) => s.status !== "paid");
  const fullOpen = unpaidSteps.length >= 2 && unpaidSteps.every((s) => s.status === "open");   // the client may settle everything in one payment
  const pct = c.agreedTotal > 0 ? Math.min(100, Math.round((c.paid * 100) / c.agreedTotal)) : 0;
  const clauses = clausesOf(c.terms);
  const phase = c.remaining === 0 ? 4 : c.paid > 0 || c.pending > 0 || c.signed ? 3 : 2;
  const journey = [{ n: 1, t: "Review", i: ScrollText }, { n: 2, t: "Sign", i: FileSignature }, { n: 3, t: "Pay", i: Wallet }];
  const openPay = (id: string) => { setPayStage(id); setErr(""); setNote(""); window.setTimeout(() => document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60); };
  const payForm = (id: string, amount: number) => (
                      <div className="mt-3 grid gap-3 border-t border-border pt-3">
                        <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
                          {([["mpesa", "M-Pesa", Smartphone], ["bank", "Bank", Landmark], ["cash", "Cash", Banknote], ["cheque", "Cheque", FileText]] as const).map(([id, label, Icon]) => (
                            <button key={id} type="button" onClick={() => setMethod(id)} data-testid={`method-${id}`} className={`flex items-center justify-center gap-1 rounded-lg py-2.5 text-xs font-bold transition-all ${method === id ? "bg-card text-primary shadow" : "text-muted-foreground"}`}><Icon className="h-3.5 w-3.5" /> {label}</button>
                          ))}
                        </div>
                        {method === "mpesa" ? (
                          <div><label className={lab} htmlFor="pp-phone">M-Pesa phone number</label><PhoneField id="pp-phone" value={phone} onChange={setPhone} kenyaOnly className={inp} />{!cfg.mpesa && <p className="mt-1 text-[11px] text-sky-700">M-Pesa is not switched on yet. Please use the bank option.</p>}</div>
                        ) : method === "cash" || method === "cheque" ? (
                          <OfflinePayFields method={method} state={off} onChange={setOff} amount={kes(amount)} payee={cfg.banks[0]?.accountName || "Dighaz Engineering Limited"} inp={inp} lab={lab} />
                        ) : (
                          <div className="grid gap-2">
                            {cfg.banks.map((b) => <div key={b.accountNumber} className="rounded-xl bg-muted px-3 py-2 text-xs"><b>{b.bankName}</b> · {b.accountName}<br /><span className="inline-flex items-center gap-1 font-bold">{b.accountNumber}<button type="button" aria-label="Copy account number" onClick={() => { void copyText(b.accountNumber).then((ok) => { if (ok) { setCopiedAcc(b.accountNumber); window.setTimeout(() => setCopiedAcc(""), 1500); } else window.prompt("Copy this:", b.accountNumber); }); }} className="inline-flex items-center gap-0.5 text-primary"><Copy className="h-3 w-3" />{copiedAcc === b.accountNumber ? <span className="text-[10px]">Copied</span> : null}</button></span>{b.paybill ? <span> · Paybill {b.paybill}</span> : null}</div>)}
                            <div><label className={lab} htmlFor="pp-ref">Paste the bank message or reference</label><input id="pp-ref" value={bankRef} onChange={(e) => setBankRef(e.target.value)} className={inp} placeholder="Transaction code / message" /></div>
                          </div>
                        )}
                        <button type="button" disabled={busy || (method === "mpesa" && !cfg.mpesa)} onClick={() => pay(id)} className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-[#0a3a80] px-4 py-3.5 text-sm font-extrabold text-primary-foreground shadow-lg transition-all active:scale-[0.98] disabled:opacity-50" data-testid="button-confirm-pay">{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Working…</> : <><Lock className="h-4 w-4" /> Pay {kes(amount)}</>}</button>
                      </div>
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageBanner eyebrow={c.no} title="Your contract" description="Read it, download it, sign and stamp it, and pay each step as it falls due. Every payment is recorded against this contract." />
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        {canChange && (
          <button type="button" onClick={() => nav("/contract")} className="mb-3 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-bold text-primary shadow-sm transition-all duration-200 hover:-translate-x-0.5 hover:shadow-md active:scale-95" data-testid="button-change-contract"><ArrowLeft className="h-4 w-4" /> Change my details</button>
        )}

        <ol className="mb-4 grid grid-cols-3 gap-2" aria-label="Progress" data-testid="contract-journey">
          {journey.map((j) => {
            const done = phase > j.n, now = phase === j.n || (phase === 4 && j.n === 3);
            const Icon = j.i;
            return (
              <li key={j.n} className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 text-center transition-all ${done ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10" : now ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/20" : "border-border bg-card opacity-70"}`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold ${done ? "bg-emerald-600 text-white" : now ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{done ? <CheckCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span>
                <span className="text-[11px] font-bold uppercase tracking-wide text-foreground">{j.t}</span>
              </li>
            );
          })}
        </ol>

        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm" data-testid="contract-view">
          <div className="border-b-4 border-sky-400 bg-gradient-to-r from-[#0b1d3a] via-[#0a3a80] to-[#14407f] px-5 py-4 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-300">Service contract</p>
            <p className="mt-0.5 text-lg font-extrabold leading-tight">{c.item}</p>
            <p className="mt-1 text-xs text-slate-200">{c.name}{c.location ? ` · ${c.location}` : ""}{c.depth > 0 && c.agreedRate > 0 ? ` · ${c.casing ? `${c.casing.toUpperCase()} casing · ` : ""}${c.depth} m` : ""}</p>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-muted px-3 py-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{c.discount > 0 ? "Quoted price" : "Quote"}</p><p className={`text-lg font-extrabold ${c.discount > 0 ? "text-muted-foreground line-through" : "text-foreground"}`}>{kes(c.quoteTotal)}</p></div>
              <div className="rounded-2xl border border-sky-300 bg-gradient-to-br from-sky-50 to-sky-100 px-3 py-2.5 dark:from-sky-500/10 dark:to-sky-500/20"><p className="text-[10px] font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300">Agreed price</p><p className="text-lg font-extrabold text-primary" data-testid="agreed-total">{kes(c.agreedTotal)}</p></div>
            </div>
            {c.agreedRate > 0 && c.discount > 0 && <p className="mt-1 text-[11px] text-muted-foreground">{kes(c.agreedRate)} per metre instead of {kes(c.quoteRate)}.</p>}

            <div className="mt-4" aria-label={`Paid ${pct} percent`}>
              <div className="mb-1 flex justify-between text-[11px] font-bold text-muted-foreground"><span>Paid {kes(c.paid)}</span><span>{pct}%</span></div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-700" style={{ width: `${pct}%` }} /></div>
            </div>

            {c.lines && c.lines.length > 0 && (
              <details className="group mt-4 rounded-2xl border border-border p-3"><summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-primary">See the quotation breakdown<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary><div className="mt-2"><QuoteTable lines={c.lines} total={c.quoteTotal} /></div></details>
            )}
            <a href={docUrl(`/api/contracts/${c.token}/page`)} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-1.5 rounded-2xl border border-primary px-3 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/5" data-testid="link-contract-page"><Printer className="h-4 w-4" /> Open contract / download PDF</a>
            <a href={docUrl(`/api/contracts/${c.token}/pdf`)} target="_blank" rel="noopener noreferrer" className="mt-2 block text-center text-xs font-bold text-primary underline">PDF link</a>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-4" data-testid="contract-share-row">
              <CopyLink url={`${window.location.origin}/contract/${c.token}`} label="Copy contract link" withShare testId="button-copy-contract-link" />
              <CopyLink url={docUrl(`/api/contracts/${c.token}/pdf`)} label="Copy PDF link" testId="button-copy-pdf-link" />
            </div>
            <p className="mt-1 text-center text-[11px] text-muted-foreground">Paying by: {({ mpesa: "M-Pesa", bank: "Bank transfer", cheque: "Cheque, into our bank", cash: "Cash, against an official receipt" } as Record<string, string>)[c.payMode ?? "mpesa"] ?? "M-Pesa"}. This page updates live as payments are confirmed.</p>
            {c.quoteToken && <a href={docUrl(`/api/quotes/${c.quoteToken}/page`)} target="_blank" rel="noopener noreferrer" className="mt-2 block text-center text-[11px] font-semibold text-muted-foreground underline" data-testid="link-original-quote">View the original quotation (QT-{String(c.quoteId).padStart(5, "0")})</a>}
          </div>
        </div>

        <details open className="group mt-4 rounded-3xl border border-border bg-card p-5 shadow-sm" data-testid="contract-terms">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-extrabold text-foreground"><span className="flex items-center gap-2"><ScrollText className="h-4 w-4 text-primary" /> Terms of the contract</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
          <ol className="mt-4 grid gap-3">
            {clauses.map((cl, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1 border-b border-border/60 pb-3 last:border-0">
                  <p className="text-sm font-bold text-foreground">{cl.title}</p>
                  <div className="mt-1 text-xs leading-relaxed text-foreground/90">
                    {cl.lines.map((l, k) => l.startsWith("- ")
                      ? <p key={k} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-sky-500" /><span><Rich t={l.slice(2)} /></span></p>
                      : <p key={k} className="mb-1"><Rich t={l} /></p>)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </details>

        <div className="mt-4 rounded-3xl border-2 border-primary/30 bg-card p-5 shadow-md" data-testid="contract-sign">
          {c.signed ? (
            <div>
              <p className="flex items-center gap-2 text-sm font-extrabold text-emerald-700"><CheckCircle className="h-5 w-5" /> Signed by {c.signedName}{c.signedAt ? ` on ${new Date(c.signedAt).toLocaleDateString("en-KE", { dateStyle: "long" })}` : ""}. Thank you!</p>
              {c.paid === 0 && c.pending === 0 && (
                <div className="mt-2">
                  <button type="button" onClick={async () => { if (!window.confirm("Delete your signature? You can sign again afterwards. This is written to the activity history.")) return; const r = await fetch(`${API}/api/contracts/${c.token}/signature`, { method: "DELETE" }); if (!r.ok) setErr((await r.json().catch(() => ({}))).error || "Could not delete."); else load(); }} className="text-xs font-bold text-red-600 underline underline-offset-2" data-testid="button-delete-signature">Delete my signature</button>
                  <p className="mt-1 text-[11px] text-muted-foreground">You can delete it and sign again until the first payment is confirmed. After that the contract is locked.</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="mb-1 flex items-center gap-2 text-sm font-extrabold text-foreground"><FileSignature className="h-4 w-4 text-primary" /> Sign this contract</p>
              <p className="mb-3 text-xs leading-relaxed text-foreground/90">Read the terms above, then sign in the box like you would in a book. Your signature is saved on the contract with the date and time.</p>
              <button type="button" onClick={() => { setDraftSig(""); setPadOpen("client"); }} className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-primary/40 bg-white shadow-inner transition active:scale-[0.99]" data-testid="button-open-pad">
                {sig ? <img src={sig} alt="Your signature" className="max-h-28 w-auto" /> : <span className="flex items-center gap-2 text-sm font-bold text-primary"><FileSignature className="h-5 w-5" /> Tap here to sign</span>}
                {sig && <span className="absolute bottom-1.5 right-2.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">Tap to sign again</span>}
              </button>
              <div className="mt-3"><p className="mb-1 text-xs font-bold text-foreground">Your stamp (optional)</p><StampPicker value={cStamp} onChange={setCStamp} /></div>
              <label className="mt-3 flex items-start gap-2 text-xs text-foreground"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4" data-testid="check-agree" /> I have read this contract and I agree to it.</label>
              {sigErr && <p className="mt-2 text-xs font-semibold text-red-600" role="alert">{sigErr}</p>}
              <button type="button" disabled={signing || !sig || !agree} onClick={() => void signNow()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-sm font-extrabold text-primary-foreground shadow-lg transition-all active:scale-[0.98] disabled:opacity-50" data-testid="button-sign">{signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />} Sign contract</button>
            </>
          )}
        </div>

        {padOpen !== "" && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 p-3 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200" role="dialog" aria-modal="true" aria-label="Sign here" data-testid="sign-modal">
            <div className="w-full max-w-2xl rounded-3xl bg-card p-4 shadow-2xl">
              <p className="mb-2 text-sm font-extrabold text-foreground">{padOpen === "witness" ? `Witness ${c.witnessName}: sign here` : `Sign here, ${c.name}`}</p>
              <SignaturePad onChange={setDraftSig} heightClass="h-[52vh] max-h-[420px]" />
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setPadOpen("")} className="flex-1 rounded-2xl border border-border px-4 py-3 text-sm font-bold text-foreground transition active:scale-95" data-testid="button-pad-cancel">Cancel</button>
                <button type="button" disabled={!draftSig} onClick={() => { if (padOpen === "witness") setWSig(draftSig); else setSig(draftSig); setPadOpen(""); }} className="flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground shadow-lg transition active:scale-95 disabled:opacity-50" data-testid="button-pad-done">Done</button>
              </div>
            </div>
          </div>
        )}

        <ContractPeople token={c.token} />
        <div className="mt-4 rounded-3xl border-2 border-primary/30 bg-card p-5 shadow-md" data-testid="contract-print">
          <p className="mb-2 flex items-center gap-2 text-sm font-extrabold text-foreground"><FileSignature className="h-4 w-4 text-primary" /> Download a copy</p>
          <p className="text-xs leading-relaxed text-foreground/90">Your details are already filled in. Download the contract as a PDF to keep. If you signed online, your signature is printed on it. You can add your stamp if you have one.</p>
          <div className="mt-3 grid gap-1 rounded-xl bg-muted/60 p-3 text-xs">
            <p><b>{c.name}</b></p>
            {c.idNo && <p className="text-muted-foreground">ID / passport no. {c.idNo}</p>}
            {c.address && <p className="text-muted-foreground">{c.address}</p>}
          </div>
          <a href={docUrl(`/api/contracts/${c.token}/page`)} target="_blank" rel="noopener noreferrer" className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-sm font-extrabold text-primary-foreground shadow-lg transition-all active:scale-[0.98]" data-testid="button-print-contract"><Printer className="h-4 w-4" /> Open and download the contract</a>
          <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><ShieldCheck className="h-3 w-3" /> Each page has a QR code that opens this contract on our website.</p>
        </div>
          <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-sm" data-testid="contract-pay">
            <p className="mb-1 flex items-center gap-2 text-sm font-extrabold text-foreground"><Wallet className="h-4 w-4 text-primary" /> Payments</p>
            <p className="mb-4 text-xs text-muted-foreground">Paid {kes(c.paid)} · Still to pay {kes(c.remaining)}</p>
            <ol className="relative grid gap-3">
              {c.stages.map((s, i) => {
                const active = s.id === nextOpen?.id && s.status === "open";
                return (
                  <li key={s.id} id={`stage-${s.id}`} className={`rounded-2xl border p-3.5 transition-all ${s.status === "paid" ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10" : active ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/15" : "border-border"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-extrabold ${s.status === "paid" ? "bg-emerald-600 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{s.status === "paid" ? <CheckCircle className="h-4 w-4" /> : i + 1}</span>
                        <div className="min-w-0"><p className="text-xs font-bold text-foreground">{s.label}</p><p className="text-base font-extrabold text-primary">{kes(s.amount)}</p></div>
                      </div>
                      {s.status === "paid" ? <span className="flex flex-col items-end gap-1"><span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-extrabold uppercase text-white">Paid</span>{s.paidId && <a href={docUrl(`/api/payments/${s.paidId}/receipt?ct=${encodeURIComponent(token)}`)} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-primary underline underline-offset-2" data-testid={`link-receipt-${s.id}`}>Receipt</a>}{s.paidId && <CopyLink url={docUrl(`/api/payments/${s.paidId}/receipt?ct=${encodeURIComponent(token)}`)} label="Copy receipt link" />}</span>
                        : s.status === "pending" ? <span className="flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-extrabold uppercase text-sky-800"><Clock className="h-3 w-3" /> Being confirmed</span>
                        : active ? <button type="button" onClick={() => (payStage === s.id ? setPayStage(null) : openPay(s.id))} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground shadow-md transition-all active:scale-95" data-testid={`button-pay-${s.id}`}>{payStage === s.id ? "Close" : "Pay now"}</button>
                        : <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-extrabold uppercase text-muted-foreground">Later</span>}
                    </div>
                    {payStage === s.id && s.status === "open" && payForm(s.id, s.amount)}
                  </li>
                );
              })}
            </ol>
            {fullOpen && (
              <div id="stage-all" className="mt-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-3.5" data-testid="pay-all-card">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">Pay the full balance now</p>
                    <p className="text-base font-extrabold text-primary">{kes(c.remaining)}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">One payment for all {unpaidSteps.length} remaining steps. The price stays the same.</p>
                  </div>
                  <button type="button" onClick={() => (payStage === "all" ? setPayStage(null) : openPay("all"))} className="flex-none rounded-xl border-2 border-primary px-4 py-2.5 text-xs font-extrabold text-primary transition-all active:scale-95" data-testid="button-pay-all">{payStage === "all" ? "Close" : "Pay all"}</button>
                </div>
                {payStage === "all" && payForm("all", c.remaining)}
              </div>
            )}
            {note && <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary" role="status">{note}</p>}
            {err && <p className="mt-2 text-xs font-semibold text-red-600" role="alert">{err}</p>}
            {c.remaining === 0 && <p className="mt-4 rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-extrabold text-white">Fully paid. Thank you!</p>}
          </div>
      </div>

      {payable && !payStage && (
        <div className="fixed inset-x-0 bottom-9 z-40 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-6px_20px_rgba(15,23,42,.12)] backdrop-blur" data-testid="pay-bar">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <div className="min-w-0"><p className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{payable.label}</p><p className="text-lg font-extrabold text-primary">{kes(payable.amount)}</p></div>
            <button type="button" onClick={() => openPay(payable.id)} className="flex-none rounded-2xl bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground shadow-lg transition-all active:scale-95" data-testid="button-pay-bar">Pay now</button>
          </div>
        </div>
      )}
    </div>
  );
}
