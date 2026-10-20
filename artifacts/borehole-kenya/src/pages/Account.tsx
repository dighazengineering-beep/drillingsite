import { useEffect, useState } from "react";
import { LiveTitle } from "@/components/LiveTitle";
import { useLocation } from "wouter";
import { Copy, LogOut, Share2, Plus, Check, MessageCircle, ClipboardList, ShoppingBag, Coins, BadgeCheck } from "lucide-react";
import { Link } from "wouter";
import { whatsappLink } from "@/lib/utils";
import { IMAGES, pageBackdrop } from "@/lib/images";
import { memberApi, memberToken, signOutMember, kes, STATUS_LABEL, type Member, type Referral, type Enquiry } from "@/lib/member";

interface Me {
  member: Member;
  rates: { service: number; product: number };
  enquiries?: Enquiry[];
  referrals: Referral[];
  totals: { payable: number; paid: number; expected: number };
}

const card = "rounded-2xl bg-card/95 p-4 shadow-xl sm:p-5";
const input = "w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const BADGE: Record<Referral["status"], string> = {
  in_progress: "bg-blue-100 text-blue-700",
  awaiting_payment: "bg-sky-100 text-sky-800",
  payable: "bg-green-100 text-green-700",
  paid: "bg-gray-200 text-gray-700",
};

export default function Account() {
  const [, go] = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ clientName: "", clientPhone: "", kind: "service", need: "" });
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    memberApi<Me>("/me").then(setMe).catch((e) => {
      if (e.status === 401) { signOutMember(); go("/join"); } else setErr(e.message);
    });

  useEffect(() => { if (!memberToken()) { go("/join"); return; } load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const link = me ? `${window.location.origin}/?ref=${me.member.code}` : "";
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); } catch { window.prompt("Copy this:", text); }
    setCopied(what); setTimeout(() => setCopied(""), 1800);
  };
  const share = async () => {
    const text = `Need a borehole, a hydrogeological survey or solar water? Dighaz Engineering Limited will help. Use my link: ${link}`;
    if (navigator.share) { try { await navigator.share({ text }); } catch { /* cancelled */ } }
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setFormErr("");
    try {
      await memberApi("/referrals", { body: f });
      setF({ clientName: "", clientPhone: "", kind: "service", need: "" });
      setAdding(false);
      await load();
    } catch (e: any) { setFormErr(e.message); }
    setBusy(false);
  };

  const bg = pageBackdrop(IMAGES.backdropTruck, "center 50%");
  if (!me) {
    return (
      <div className="grid min-h-[calc(100dvh-4rem)] place-items-center px-4 pt-20" style={bg}>
        <p className="rounded-xl bg-card/95 px-4 py-3 text-sm text-foreground">{err || "Loading your account…"}</p>
      </div>
    );
  }
  const { member, rates, referrals, totals } = me;
  const enquiries = me.enquiries ?? [];
  const startEarning = async () => {
    setBusy(true);
    try { await memberApi("/affiliate", { method: "POST", body: {} }); await load(); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="min-h-[calc(100dvh-4rem)] px-4 pt-24 pb-12" style={bg}>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <h1 className="text-lg font-bold text-foreground">Hello, {member.name.split(" ")[0]}</h1>
            <p className="text-xs text-muted-foreground">{member.email}</p>
          </div>
          <button onClick={() => { signOutMember(); go("/join"); }} className="flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-sm font-semibold"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>

        {/* Client view: everyone sees this */}
        <section className={card}>
          <h2 className="font-bold text-foreground"><LiveTitle text="What do you need?" hi="#0ea5e9" level="sub" /></h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link href="/contact" className="flex items-center gap-2 rounded-xl bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground"><ClipboardList className="h-4 w-4" /> Get a free quote</Link>
            <Link href="/products" className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground"><ShoppingBag className="h-4 w-4 text-primary" /> Browse products</Link>
            <a href={whatsappLink(`Hello, I am ${member.name}. I need help with a borehole project.`)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground"><MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp us</a>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-bold text-foreground">Your enquiries {enquiries.length ? `(${enquiries.length})` : ""}</h2>
          {enquiries.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No enquiries yet. Send one through the quote form using the same email or phone number as this account and it will show here.</p>
          ) : (
            <div className="mt-2 divide-y divide-border">
              {enquiries.map((q) => (
                <div key={q.id} className="py-2.5">
                  <p className="text-sm font-semibold capitalize text-foreground">{q.type.replace(/_/g, " ")}{q.county ? ` · ${q.county}` : ""}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{q.message}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(q.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {!member.affiliate && (
          <section className={`${card} border border-sky-300/60`}>
            <h2 className="flex items-center gap-2 font-bold text-foreground"><Coins className="h-4 w-4 text-sky-500" /> <LiveTitle level="sub" text="Want to make money too?" hi="#0ea5e9" /></h2>
            <p className="mt-1 text-sm text-muted-foreground">Optional. Refer clients and earn <b className="text-foreground">{rates.service}%</b> on services and <b className="text-foreground">{rates.product}%</b> on products, paid once the work is complete and the client has paid in full.</p>
            <button onClick={startEarning} disabled={busy} data-testid="button-start-earning" className="mt-3 flex items-center gap-1.5 rounded-md bg-sky-400 px-4 py-2.5 text-sm font-bold text-slate-900 disabled:opacity-50"><BadgeCheck className="h-4 w-4" /> {busy ? "Please wait…" : "Start earning"}</button>
          </section>
        )}

        {member.affiliate && (<>
        <section className={card}>
          <h2 className="font-bold text-foreground"><LiveTitle text="Your referral code" hi="#0ea5e9" level="sub" /></h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-primary/10 px-4 py-2 font-mono text-xl font-bold tracking-wider text-primary">{member.code}</span>
            <button onClick={() => copy(member.code, "code")} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-semibold">{copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Code</button>
            <button onClick={() => copy(link, "link")} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-semibold">{copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Link</button>
            <button onClick={share} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Share2 className="h-4 w-4" /> Share</button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Anyone who opens your link and sends an enquiry is credited to you. You can also add a client yourself below.
            You earn <b className="text-foreground">{rates.service}%</b> on services and <b className="text-foreground">{rates.product}%</b> on products, once the work is complete and the client has paid in full.
          </p>
        </section>

        <div className="grid grid-cols-3 gap-2">
          {[["Ready to pay you", totals.payable, "text-green-700"], ["Expected", totals.expected, "text-blue-700"], ["Paid to you", totals.paid, "text-foreground"]].map(([label, v, c]) => (
            <div key={label as string} className="rounded-2xl bg-card/95 p-3 text-center shadow-xl">
              <p className={`text-base font-bold sm:text-lg ${c}`}>{kes(v as number)}</p>
              <p className="text-[11px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        <section className={card}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-foreground">Your clients {referrals.length ? `(${referrals.length})` : ""}</h2>
            <button onClick={() => setAdding((a) => !a)} className="flex items-center gap-1.5 rounded-md bg-sky-400 px-3 py-2 text-sm font-bold text-slate-900"><Plus className="h-4 w-4" /> Add client</button>
          </div>

          {adding && (
            <form onSubmit={add} className="mb-4 space-y-2 rounded-xl border border-border bg-muted/40 p-3">
              <input className={input} placeholder="Client's name" value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} required />
              <input className={input} type="tel" placeholder="Client's phone" value={f.clientPhone} onChange={(e) => setF({ ...f, clientPhone: e.target.value })} required />
              <select className={input} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                <option value="service">A service (survey, drilling, pump or solar installation)</option>
                <option value="product">A product (pump, tank, solar panel…)</option>
              </select>
              <input className={input} placeholder="What do they need? (e.g. survey in Kitengela)" value={f.need} onChange={(e) => setF({ ...f, need: e.target.value })} />
              {formErr && <p className="text-xs text-red-600">{formErr}</p>}
              <button disabled={busy} className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save client"}</button>
            </form>
          )}

          {referrals.length === 0 && <p className="text-sm text-muted-foreground">No clients yet. Share your link or add your first client.</p>}
          <div className="divide-y divide-border">
            {referrals.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{r.clientName}</p>
                  <p className="text-xs text-muted-foreground">{r.kind === "product" ? "Product" : "Service"} · {r.rate}%{r.need ? ` · ${r.need}` : ""}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}{r.source === "link" ? " · came through your link" : ""}</p>
                </div>
                <div className="text-right">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  <p className="mt-1 text-sm font-bold text-foreground">{r.commission == null ? "To be priced" : kes(r.commission)}</p>
                  {r.amount != null && <p className="text-[11px] text-muted-foreground">on {kes(r.amount)}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
        </>)}
      </div>
    </div>
  );
}
