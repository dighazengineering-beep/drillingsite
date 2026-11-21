import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Radio, PlayCircle, Phone, Wallet, Clock, RefreshCw } from "lucide-react";
import PageBanner from "@/components/PageBanner";
import JobTimeline from "@/components/JobTimeline";
import { LiveTitle } from "@/components/LiveTitle";
import { IMAGES, photoLayer } from "@/lib/images";
import { whatsappLink } from "@/lib/utils";
import { API, kes, memberApi, memberToken } from "@/lib/member";
import { keyFor, rememberPhone } from "@/components/NotificationBell";
import { openPay } from "@/components/PayDialog";
import { ago, STATUS_LABEL, STATUS_STYLE, type ClientJob } from "@/lib/jobs";
import { PhoneField } from "@/components/PhoneField";

const read = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const inp = "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30";

/** The client's jobs, each with its timeline, live button, photos and payment status. Opens with the phone and view key this browser saved when the client paid. */
export default function MyJobs() {
  const [phone, setPhone] = useState(() => read("site_phone"));
  const [typed, setTyped] = useState(() => read("site_phone"));
  const [jobs, setJobs] = useState<ClientJob[] | null>(null);
  const [, tick] = useState(0);

  const load = useCallback(async (ph: string) => {
    if (!ph) { setJobs([]); return; }
    try {
      const r = await fetch(`${API}/api/payments/jobs?phone=${encodeURIComponent(ph)}&key=${encodeURIComponent(keyFor(ph))}`);
      const d = await r.json();
      setJobs(Array.isArray(d) ? d : []);
    } catch { setJobs((j) => j ?? []); }
  }, []);

  // a signed-in member's phone is used when this browser has not saved one yet
  useEffect(() => {
    if (phone || !memberToken()) return;
    memberApi<{ member: { phone: string } }>("/me").then((d) => { if (d.member.phone) { setPhone(d.member.phone); setTyped(d.member.phone); } }).catch(() => {});
  }, [phone]);
  useEffect(() => { load(phone); const t = window.setInterval(() => { load(phone); tick((n) => n + 1); }, 20000); return () => window.clearInterval(t); }, [phone, load]);

  const open = (e: React.FormEvent) => { e.preventDefault(); if (typed.replace(/\D/g, "").length >= 9) { rememberPhone(typed); setJobs(null); setPhone(typed); } };

  return (
    <div>
      <PageBanner eyebrow="Track my job" title="My jobs" description="See where your job is, watch it live, and view photos from the site." />
      <div
        style={{
          backgroundColor: "var(--live-bg, hsl(160 52% 10%))",
          backgroundImage: `linear-gradient(180deg, hsl(160 52% 8% / .50) 0%, hsl(160 52% 8% / .22) 45%, hsl(160 52% 8% / .50) 100%), ${photoLayer(IMAGES.backdropRig)}`,
          backgroundSize: "cover", backgroundPosition: "center 50%",
        }}
      >
        <div className="mx-auto max-w-2xl space-y-3 px-4 py-6 sm:px-6">
          <form onSubmit={open} className="flex gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-sm">
            <PhoneField value={typed} onChange={setTyped} className={inp} testId="input-jobs-phone" />
            <button type="submit" className="shrink-0 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Show</button>
          </form>

          {jobs === null && <p className="rounded-2xl bg-card/95 p-4 text-sm text-muted-foreground">Loading…</p>}
          {jobs?.length === 0 && (
            <div className="rounded-2xl border border-border bg-card/95 p-5 text-sm shadow-sm" data-testid="jobs-empty">
              <p className="font-bold text-foreground">No jobs to show yet</p>
              <p className="mt-1 text-muted-foreground">
                {phone ? "We could not open jobs for this number on this device. Please open this page on the phone or computer you paid from." : "Enter the phone number you paid with."}{" "}
                A job appears here once your first payment is confirmed.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/quote" className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Get a Quote</Link>
                <a href="tel:+254719117660" className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-foreground">Call us</a>
                <a href={whatsappLink("Hello, I would like to check on my job.")} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-emerald-700">WhatsApp</a>
              </div>
            </div>
          )}

          {jobs?.map((j) => (
            <article key={j.item} className="rounded-2xl border border-border bg-card/95 p-4 shadow-sm" data-testid="job-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{j.typeLabel}</p>
                  <h2 className="text-base font-extrabold leading-tight text-foreground">{j.item}</h2>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[j.status]}`}>{STATUS_LABEL[j.status]}</span>
              </div>

              <p className="mt-3 text-xl font-extrabold text-primary" data-testid="job-headline">{j.step}</p>
              {j.updatedAt && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> Updated {ago(j.updatedAt)}</p>}
              <div className="mt-2 flex gap-1" aria-label={`Step ${j.index + 1} of ${j.steps.length}`}>
                {j.steps.map((s, i) => <span key={s} title={s} className={`h-1.5 flex-1 rounded-full ${i <= j.index ? "bg-primary" : "bg-muted-foreground/20"}`} />)}
              </div>
              {j.eta && <p className="mt-2 text-sm font-semibold text-sky-700">{j.eta}</p>}
              {j.note && <p className="mt-1 text-sm text-foreground/80">{j.note}</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                {j.liveUrl && (
                  <a href={j.liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-red-700" data-testid="button-watch-live">
                    <Radio className="h-4 w-4 animate-pulse" /> Watch live
                  </a>
                )}
                {!j.liveUrl && j.recordingUrl && (
                  <a href={j.recordingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20">
                    <PlayCircle className="h-4 w-4" /> Watch recording
                  </a>
                )}
                {j.team && (
                  <a href={`tel:+${j.team.phone.replace(/\D/g, "")}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm font-bold text-foreground" data-testid="button-call-team">
                    <Phone className="h-4 w-4 text-primary" /> Call the site team{j.team.name ? ` (${j.team.name})` : ""}
                  </a>
                )}
              </div>

              <div className="mt-4 rounded-xl bg-muted/60 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-muted-foreground">Paid <b className="text-foreground">{kes(j.paid)}</b> of {kes(j.agreedTotal)}</p>
                  {j.balance > 0
                    ? <button type="button" onClick={() => openPay({ kind: j.kind, item: j.item })} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-bold text-slate-900"><Wallet className="h-3.5 w-3.5" /> Pay balance</button>
                    : <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">Paid in full</span>}
                </div>
                {j.balance > 0 && <p className="mt-1 text-xs font-semibold text-foreground">Balance {kes(j.balance)}</p>}
              </div>

              <h3 className="mb-3 mt-5 text-xs font-bold uppercase tracking-wide text-muted-foreground"><LiveTitle text="Progress" hi="#0ea5e9" level="sub" /></h3>
              <JobTimeline steps={j.steps} index={j.index} events={j.events} />
            </article>
          ))}
          {jobs && jobs.length > 0 && <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-white/80"><RefreshCw className="h-3 w-3" /> Updates automatically</p>}
        </div>
      </div>
    </div>
  );
}
