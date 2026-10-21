import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Smartphone, Landmark, CheckCircle2, Loader2, Wallet, ShieldCheck, Copy, AlertCircle, Upload } from "lucide-react";
import { rememberPhone } from "@/components/NotificationBell";
import { API, memberApi, memberToken, kes } from "@/lib/member";

type Kind = "service" | "product";
type PayType = "deposit" | "balance" | "full";
interface Item { name: string; price: number | null; unit?: string }
interface Bal { found: boolean; agreedTotal: number; paid: number; pending: number; balance: number }
interface Bank { bankName: string; accountName: string; accountNumber: string }
interface Cfg { mpesa: boolean; banks: Bank[] }

const DEPOSIT_PCT = 70; // share of the agreed price taken as the deposit (the client can change the amount)
const inp = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25";
const lab = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const digits = (v: string) => v.replace(/[^\d]/g, "");
const money = (v: string) => (v === "" ? 0 : Number(v));
const fmt = (v: number) => (v ? v.toLocaleString("en-KE") : "");

export const openPay = (detail?: { kind?: Kind; item?: string }) => window.dispatchEvent(new CustomEvent("dighaz:pay", { detail }));

export default function PayDialog() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("service");
  const [items, setItems] = useState<Record<Kind, Item[]>>({ service: [], product: [] });
  const [item, setItem] = useState("");
  const [payType, setPayType] = useState<PayType>("deposit");
  const [total, setTotal] = useState("");
  const [rate, setRate] = useState("");
  const [depth, setDepth] = useState("");
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"mpesa" | "bank">("mpesa");
  const [bankRef, setBankRef] = useState("");
  const [img, setImg] = useState("");
  const [cfg, setCfg] = useState<Cfg>({ mpesa: true, banks: [] });
  const [bal, setBal] = useState<Bal | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [phase, setPhase] = useState<"form" | "wait" | "paid" | "failed" | "bank">("form");
  const [receipt, setReceipt] = useState("");
  const [copied, setCopied] = useState(false);
  const poll = useRef<number | undefined>(undefined);
  const loaded = useRef(false);

  // open from the header button, or from any "Pay" link on the site
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (d.kind) setKind(d.kind);
      if (d.item) setItem(d.item);
      setPhase("form"); setErr(""); setOpen(true);
    };
    window.addEventListener("dighaz:pay", h);
    return () => window.removeEventListener("dighaz:pay", h);
  }, []);

  // first open: load the catalogue, payment options and the signed-in client's details
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    const get = (p: string) => fetch(`${API}/api/${p}`).then((r) => r.json()).catch(() => []);
    Promise.all([get("services"), get("products?limit=100")]).then(([s, p]) => {
      setItems({
        service: (Array.isArray(s) ? s : []).map((x: any) => ({ name: x.name, price: x.priceFrom ?? null, unit: x.priceUnit ?? "" })),
        product: (Array.isArray(p) ? p : (p?.items ?? [])).map((x: any) => ({ name: x.name, price: x.price != null ? Number(x.price) : null })),
      });
    });
    fetch(`${API}/api/payments/config`).then((r) => r.json()).then((c: Cfg) => { setCfg(c); if (!c.mpesa && c.banks?.length) setMethod("bank"); }).catch(() => {});
    if (memberToken()) memberApi<{ member: { name: string; phone: string } }>("/me").then((d) => { setName((v) => v || d.member.name || ""); setPhone((v) => v || d.member.phone || ""); }).catch(() => {});
  }, [open]);

  useEffect(() => () => window.clearInterval(poll.current), []);

  const list = items[kind];
  const chosen = list.find((i) => i.name === item);

  // choosing an item fills the catalogue price (the client may overwrite it with the agreed price)
  const perMetre = kind === "service" && /metre|meter/i.test(chosen?.unit ?? "");
  useEffect(() => {
    if (perMetre) { setRate(chosen?.price ? String(Math.round(chosen.price)) : ""); setDepth(""); setTotal(""); }
    else if (chosen?.price) setTotal(String(Math.round(chosen.price)));
    else if (item) setTotal("");
  }, [item, kind, chosen?.price, perMetre]);
  const existing = !!(bal?.found && bal.paid > 0); // a job already being paid keeps its agreed price
  useEffect(() => { if (perMetre && !existing) setTotal(money(rate) && money(depth) ? String(money(rate) * money(depth)) : ""); }, [rate, depth, perMetre, existing]);
  useEffect(() => { setItem((v) => (items[kind].some((i) => i.name === v) ? v : "")); }, [kind, items]);

  // look up what this phone has already paid for this item
  const phoneOk = digits(phone).length >= 9;
  useEffect(() => {
    setBal(null);
    if (!open || !phoneOk || !item) return;
    const t = window.setTimeout(() => {
      fetch(`${API}/api/payments/balance?phone=${encodeURIComponent(phone)}&item=${encodeURIComponent(item)}`)
        .then((r) => r.json()).then((b: Bal) => {
          setBal(b);
          if (b.found && b.paid > 0) { setTotal(String(b.agreedTotal)); setPayType(b.balance > 0 ? "balance" : "full"); setAmountTouched(false); }
        }).catch(() => {});
    }, 450);
    return () => window.clearTimeout(t);
  }, [phone, item, phoneOk, open]);

  const T = money(total);
  const paid = bal?.found ? bal.paid : 0;
  const left = Math.max(0, T - paid);
  const suggested = useMemo(() => {
    if (!T) return 0;
    if (payType === "deposit") return Math.round((T * DEPOSIT_PCT) / 100);
    if (payType === "balance") return left;
    return T - paid;
  }, [T, payType, left, paid]);
  useEffect(() => { if (!amountTouched) setAmount(suggested ? String(suggested) : ""); }, [suggested, amountTouched]);
  useEffect(() => { setAmountTouched(false); }, [payType, item]);

  const A = money(amount);
  const done = bal?.found && bal.balance <= 0 && bal.paid > 0 && T <= bal.paid;

  const reset = () => { window.clearInterval(poll.current); setPhase("form"); setErr(""); setBankRef(""); setImg(""); setReceipt(""); setBusy(false); };
  const close = (v: boolean) => { setOpen(v); if (!v) reset(); };

  const submit = async () => {
    setErr("");
    if (!item) return setErr("Choose what you are paying for.");
    if (perMetre && !existing && !money(depth)) return setErr("Enter the agreed depth in metres.");
    if (!T) return setErr("Enter the agreed price.");
    if (!A) return setErr("Enter the amount to pay.");
    if (A > T) return setErr("The amount cannot be more than the agreed price.");
    if (name.trim().length < 2) return setErr("Enter your name.");
    if (!phoneOk) return setErr("Enter your phone number.");
    if (method === "bank" && bankRef.trim().length < 3 && !img) return setErr("Upload your payment receipt, or paste the bank message.");
    setBusy(true);
    const body = { name, phone, kind, item, payType, amount: A, agreedTotal: T, bankRef, receiptImg: img || undefined };
    try {
      const r = await fetch(`${API}/api/payments/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Something went wrong.");
      rememberPhone(phone); window.dispatchEvent(new Event("dighaz:phone"));
      if (method === "bank") { setPhase("bank"); setBusy(false); return; }
      setPhase("wait");
      let tries = 0;
      poll.current = window.setInterval(async () => {
        tries++;
        try {
          const s = await fetch(`${API}/api/payments/${d.id}/status`).then((x) => x.json());
          if (s.status === "paid") { window.clearInterval(poll.current); setReceipt(s.receipt || ""); setPhase("paid"); }
          else if (s.status === "failed" || s.status === "cancelled") { window.clearInterval(poll.current); setErr(s.status === "cancelled" ? "The payment was cancelled on your phone." : `The payment did not go through.${s.note ? ` (${s.note})` : ""}`); setPhase("failed"); }
        } catch { /* keep trying */ }
        if (tries > 40) { window.clearInterval(poll.current); setErr("We did not get a reply from M-Pesa. If money was taken, call us and we will confirm it."); setPhase("failed"); }
      }, 3000);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  const pickFile = (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setErr("Please choose a photo or screenshot of the receipt."); return; }
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1100 / Math.max(im.width, im.height));
      const c = document.createElement("canvas");
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
      setImg(c.toDataURL("image/jpeg", 0.72)); setErr("");
      URL.revokeObjectURL(im.src);
    };
    im.onerror = () => setErr("Could not read that image.");
    im.src = URL.createObjectURL(f);
  };

  const copy = (t: string) => { navigator.clipboard?.writeText(t).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-[hsl(160_46%_6%)]/65 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[81] max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-3xl bg-card shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="relative overflow-hidden rounded-t-3xl px-5 pb-4 pt-5 text-white" style={{ background: "linear-gradient(135deg, hsl(160 52% 12%), hsl(155 56% 24%) 60%, hsl(199 80% 38%))" }}>
            <Dialog.Close className="absolute right-3 top-3 rounded-full bg-white/15 p-1.5 transition hover:bg-white/25" aria-label="Close"><X className="h-4 w-4" /></Dialog.Close>
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25"><Wallet className="h-5 w-5" /></span>
              <div>
                <Dialog.Title className="text-base font-extrabold leading-tight">Make a payment</Dialog.Title>
                <p className="text-[11px] text-white/75">Deposit, balance or full payment</p>
              </div>
            </div>
          </div>

          <div className="p-5">
            {phase === "form" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                  {(["service", "product"] as const).map((k) => (
                    <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg py-1.5 text-xs font-bold transition ${kind === k ? "bg-card text-primary shadow" : "text-muted-foreground"}`}>
                      {k === "service" ? "Service" : "Product"}
                    </button>
                  ))}
                </div>

                <div>
                  <label className={lab}>{kind === "service" ? "Service" : "Product"}</label>
                  <select value={item} onChange={(e) => setItem(e.target.value)} className={inp} data-testid="pay-item">
                    <option value="">{list.length ? "Choose…" : "Loading…"}</option>
                    {list.map((i) => <option key={i.name} value={i.name}>{i.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
                  {([["deposit", "Deposit"], ["balance", "Balance"], ["full", "Full"]] as const).map(([k, n]) => (
                    <button key={k} type="button" onClick={() => setPayType(k)} className={`rounded-lg py-1.5 text-xs font-bold transition ${payType === k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"}`}>{n}</button>
                  ))}
                </div>

                {perMetre && !existing && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={lab}>Price per metre (KSh)</label>
                      <input inputMode="numeric" value={fmt(money(rate))} onChange={(e) => setRate(digits(e.target.value))} placeholder="0" className={inp} data-testid="pay-rate" />
                    </div>
                    <div>
                      <label className={lab}>Agreed depth (metres)</label>
                      <input inputMode="numeric" value={depth} onChange={(e) => setDepth(digits(e.target.value))} placeholder="e.g. 150" className={inp} data-testid="pay-depth" />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lab}>{perMetre && !existing ? "Total price (KSh)" : "Agreed price (KSh)"}</label>
                    <input inputMode="numeric" value={fmt(money(total))} onChange={(e) => setTotal(digits(e.target.value))} readOnly={perMetre && !existing} placeholder="0" className={`${inp} ${perMetre && !existing ? "bg-muted/60" : ""}`} data-testid="pay-total" />
                  </div>
                  <div>
                    <label className={lab}>Pay now (KSh)</label>
                    <input inputMode="numeric" value={fmt(A)} onChange={(e) => { setAmountTouched(true); setAmount(digits(e.target.value)); }} placeholder="0" className={`${inp} font-bold text-primary`} data-testid="pay-amount" />
                  </div>
                </div>

                {bal?.found && bal.paid > 0 && (
                  <div className="flex items-center justify-between rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">Paid <b className="text-foreground">{kes(bal.paid)}</b></span>
                    <span className="font-bold text-primary">{bal.balance > 0 ? `Balance ${kes(bal.balance)}` : "Fully paid"}</span>
                  </div>
                )}
                {payType === "deposit" && T > 0 && <p className="-mt-1 text-[11px] text-muted-foreground">Deposit is {DEPOSIT_PCT}% of the price and counts toward the total. You can change the amount.</p>}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lab}>Your name</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={inp} data-testid="pay-name" />
                  </div>
                  <div>
                    <label className={lab}>Phone</label>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="07xx xxx xxx" className={inp} data-testid="pay-phone" />
                  </div>
                </div>

                <div className={`grid gap-1 rounded-xl bg-muted p-1 ${cfg.banks.length > 0 && cfg.mpesa ? "grid-cols-2" : "grid-cols-1"}`}>
                  {cfg.mpesa && (
                    <button type="button" onClick={() => setMethod("mpesa")} className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${method === "mpesa" ? "bg-card text-primary shadow" : "text-muted-foreground"}`}><Smartphone className="h-3.5 w-3.5" /> M-Pesa</button>
                  )}
                  {cfg.banks.length > 0 && (
                    <button type="button" onClick={() => setMethod("bank")} className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${method === "bank" ? "bg-card text-primary shadow" : "text-muted-foreground"}`}><Landmark className="h-3.5 w-3.5" /> Bank transfer</button>
                  )}
                </div>

                {method === "bank" && cfg.banks.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-border bg-background p-3 text-xs">
                    {cfg.banks.map((bk) => (
                      <div key={bk.accountNumber} className="rounded-lg bg-muted/60 p-2.5">
                        <div className="flex items-center justify-between gap-2"><span className="font-bold text-foreground">{bk.bankName}</span>
                          <button type="button" onClick={() => copy(bk.accountNumber)} className="flex items-center gap-1 text-[11px] font-semibold text-primary"><Copy className="h-3 w-3" /> Copy</button></div>
                        <div className="mt-1 text-muted-foreground">{bk.accountName}</div>
                        <div className="text-sm font-extrabold tracking-wide text-foreground">{bk.accountNumber}</div>
                      </div>
                    ))}
                    {copied && <p className="text-[11px] font-semibold text-primary">Account number copied</p>}
                    <div>
                      <label className={lab}>Payment receipt</label>
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 text-xs font-semibold text-primary">
                        <Upload className="h-4 w-4" /> {img ? "Receipt added. Tap to change" : "Upload receipt photo or screenshot"}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} data-testid="pay-receipt" />
                      </label>
                      {img && <img src={img} alt="Receipt" className="mt-2 max-h-28 rounded-lg border border-border object-contain" />}
                    </div>
                    <div>
                      <label className={lab}>Or paste the bank message</label>
                      <textarea value={bankRef} onChange={(e) => setBankRef(e.target.value)} rows={2} placeholder="Transaction code or the confirmation message" className={inp} />
                    </div>
                  </div>
                )}

                {!cfg.mpesa && !cfg.banks.length && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Online payment is not switched on yet. Please call us to pay.</p>}
                {err && <p className="flex items-start gap-1.5 text-xs text-red-600"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{err}</p>}

                <button type="button" onClick={submit} disabled={busy || done || (!cfg.mpesa && !cfg.banks.length)} data-testid="pay-submit"
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-extrabold text-white shadow-lg transition active:scale-[.98] disabled:opacity-50"
                  style={{ background: method === "mpesa" ? "linear-gradient(135deg,#16a34a,#15803d)" : "linear-gradient(135deg, hsl(155 56% 24%), hsl(199 80% 38%))" }}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : method === "mpesa" ? <Smartphone className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                  {done ? "Fully paid" : method === "mpesa" ? `Pay ${A ? kes(A) : ""} with M-Pesa` : "I have paid"}
                </button>
                <p className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground"><ShieldCheck className="h-3 w-3" /> Secure payment to Dighaz Engineering Limited</p>
              </div>
            )}

            {phase === "wait" && (
              <div className="py-6 text-center">
                <Loader2 className="mx-auto h-9 w-9 animate-spin text-primary" />
                <p className="mt-4 font-bold text-foreground">Check your phone</p>
                <p className="mt-1 text-sm text-muted-foreground">Enter your M-Pesa PIN on the prompt to pay {kes(A)}.</p>
              </div>
            )}
            {phase === "paid" && (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600" />
                <p className="mt-3 text-lg font-extrabold text-foreground">Payment received</p>
                <p className="mt-1 text-sm text-muted-foreground">{kes(A)} for {item}.{receipt ? ` M-Pesa code ${receipt}.` : ""}</p>
                {T - paid - A > 0 && <p className="mt-2 text-sm font-semibold text-primary">Balance left: {kes(T - paid - A)}</p>}
                <button onClick={() => close(false)} className="mt-5 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">Done</button>
              </div>
            )}
            {phase === "bank" && (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto h-11 w-11 text-sky-500" />
                <p className="mt-3 text-lg font-extrabold text-foreground">Thank you</p>
                <p className="mt-1 text-sm text-muted-foreground">We will check our bank and confirm your {kes(A)} payment shortly.</p>
                <button onClick={() => close(false)} className="mt-5 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">Done</button>
              </div>
            )}
            {phase === "failed" && (
              <div className="py-6 text-center">
                <AlertCircle className="mx-auto h-11 w-11 text-red-500" />
                <p className="mt-3 font-bold text-foreground">Payment not completed</p>
                <p className="mt-1 text-sm text-muted-foreground">{err}</p>
                <button onClick={reset} className="mt-5 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">Try again</button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
