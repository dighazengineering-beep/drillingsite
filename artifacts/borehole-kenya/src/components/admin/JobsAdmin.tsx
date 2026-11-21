import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, ImagePlus, Loader2, Radio, Search, Trash2, X, History } from "lucide-react";
import { API, kes } from "@/lib/member";
import { ago, clock, STATUS_LABEL, STATUS_STYLE, type JobEvent } from "@/lib/jobs";
import { Media } from "@/components/JobTimeline";
import { PhoneField } from "@/components/PhoneField";

interface Job {
  phone: string; item: string; name: string; type: string; steps: string[]; index: number; step: string; status: "waiting" | "progress" | "done";
  note: string; eta: string; updatedAt: string | null; teamName: string; teamPhone: string; agreedTotal: number; paid: number;
  liveUrl: string; liveNow: boolean; recordingUrl: string; updates: number;
}
interface TypeInfo { id: string; label: string; steps: string[] }
interface Form { note: string; eta: string; teamName: string; teamPhone: string; mediaUrl: string; mediaType: string; liveUrl: string; recUrl: string }
type Filter = "all" | "progress" | "waiting" | "done";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" }, { id: "progress", label: "In progress" }, { id: "waiting", label: "Waiting" }, { id: "done", label: "Completed" },
];
const inp = "min-w-0 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs";
const idOf = (j: Job) => `${j.phone}|${j.item}`;
const formOf = (j: Job): Form => ({ note: "", eta: "", teamName: j.teamName, teamPhone: j.teamPhone, mediaUrl: "", mediaType: "", liveUrl: j.liveUrl, recUrl: j.recordingUrl });
const MAX_IMAGE = 10 * 1024 * 1024, MAX_VIDEO = 100 * 1024 * 1024;

export default function JobsAdmin({ adminKey, onBadAdmin }: { adminKey: string; onBadAdmin: () => void }) {
  const h = useMemo(() => ({ "x-admin-key": adminKey, "content-type": "application/json" }), [adminKey]);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [types, setTypes] = useState<TypeInfo[]>([]);
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<Record<string, JobEvent[] | undefined>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [saved, setSaved] = useState("");
  const [err, setErr] = useState<{ id: string; msg: string } | null>(null);
  const files = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(() =>
    fetch(`${API}/api/payments-admin/jobs`, { headers: h })
      .then((r) => { if (r.status === 403) { onBadAdmin(); throw new Error("403"); } return r.json(); })
      .then((d) => {
        const list: Job[] = d.jobs ?? [];
        setTypes(d.types ?? []);
        setJobs(list);
        setForms((f) => { const n = { ...f }; for (const j of list) if (!n[idOf(j)]) n[idOf(j)] = formOf(j); return n; });
      })
      .catch(() => setJobs((l) => l ?? [])), [h, onBadAdmin]);
  useEffect(() => { load(); }, [load]);

  const setForm = (id: string, patch: Partial<Form>) => setForms((f) => ({ ...f, [id]: { ...f[id]!, ...patch } }));

  /** One call to the server. `extra` is what this button does (next step, jump to a step, live switch…); the typed note, time, team and media go with step moves and updates. */
  const send = async (j: Job, extra: Record<string, unknown>, withUpdate: boolean) => {
    const id = idOf(j), f = forms[id] ?? formOf(j);
    setBusy(id); setErr(null);
    const body: Record<string, unknown> = { phone: j.phone, item: j.item, ...extra };
    if (withUpdate) {
      body.note = f.note; body.eta = f.eta; body.teamName = f.teamName; body.teamPhone = f.teamPhone;
      if (f.mediaUrl) body.mediaUrl = f.mediaUrl;
    }
    try {
      const r = await fetch(`${API}/api/payments-admin/job`, { method: "POST", headers: h, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 403) { onBadAdmin(); return; }
      if (!r.ok) { setErr({ id, msg: d.error || "Could not save." }); if (/live/i.test(d.error ?? "")) setOpen((o) => ({ ...o, [id]: true })); return; }
      if (withUpdate) setForm(id, { note: "", eta: "", mediaUrl: "", mediaType: "" });
      setHistory((x) => ({ ...x, [id]: undefined }));
      setSaved(id); window.setTimeout(() => setSaved((s) => (s === id ? "" : s)), 2000);
      await load();
    } catch { setErr({ id, msg: "Could not reach the server. Try again." }); }
    finally { setBusy(""); }
  };

  const upload = async (j: Job, file?: File) => {
    if (!file) return;
    const id = idOf(j);
    setErr(null);
    const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "";
    if (!kind) { setErr({ id, msg: "Choose a photo or a short video." }); return; }
    if (file.size > (kind === "video" ? MAX_VIDEO : MAX_IMAGE)) { setErr({ id, msg: kind === "video" ? "That video is too big (limit 100 MB). Record a shorter one." : "That photo is too big (limit 10 MB)." }); return; }
    setBusy(`up:${id}`);
    try {
      const s = await fetch(`${API}/api/payments-admin/job-upload-sign`, { method: "POST", headers: h }).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error ?? "Could not start the upload"); return d; });
      const form = new FormData();
      form.append("file", file); form.append("api_key", s.apiKey); form.append("timestamp", String(s.timestamp)); form.append("signature", s.signature); form.append("folder", s.folder);
      const r = await fetch(`https://api.cloudinary.com/v1_1/${s.cloudName}/${kind}/upload`, { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok || !d.secure_url) throw new Error(d.error?.message ?? "Upload failed");
      const url = kind === "image" ? String(d.secure_url).replace("/upload/", "/upload/f_auto,q_auto,w_1400/") : String(d.secure_url);
      setForm(id, { mediaUrl: url, mediaType: kind });
    } catch (e) { setErr({ id, msg: e instanceof Error ? e.message : "Upload failed" }); }
    finally { setBusy(""); }
  };

  const showHistory = async (j: Job) => {
    const id = idOf(j);
    if (history[id]) { setHistory((x) => ({ ...x, [id]: undefined })); return; }
    const r = await fetch(`${API}/api/payments-admin/job-events?phone=${encodeURIComponent(j.phone)}&item=${encodeURIComponent(j.item)}`, { headers: h });
    const d = await r.json().catch(() => []);
    setHistory((x) => ({ ...x, [id]: Array.isArray(d) ? d : [] }));
  };
  const delEvent = async (j: Job, e: JobEvent) => {
    if (!window.confirm("Delete this update from the client's timeline?")) return;
    await fetch(`${API}/api/payments-admin/job-events/${e.id}`, { method: "DELETE", headers: h });
    setHistory((x) => ({ ...x, [idOf(j)]: (x[idOf(j)] ?? []).filter((y) => y.id !== e.id) }));
    load();
  };

  const counts = useMemo(() => {
    const c = { all: 0, progress: 0, waiting: 0, done: 0 };
    for (const j of jobs ?? []) { c.all++; c[j.status]++; }
    return c;
  }, [jobs]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = t.replace(/\D/g, "");
    const digits = all.replace(/^(254|0)/, ""); // 0712 345 678, +254 712… and 712… all find the same client
    const byPhone = (j: Job) => all.length >= 3 && (j.phone.includes(all) || (digits.length >= 3 && j.phone.includes(digits)));
    return (jobs ?? []).filter((j) => (filter === "all" || j.status === filter) && (!t || `${j.name} ${j.item}`.toLowerCase().includes(t) || byPhone(j)));
  }, [jobs, filter, q]);

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">Every client who has paid appears here. Tap <b>Next</b> to move a job on. The client sees it on the site and in their bell, and gets an SMS when SMS is set up.</p>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} data-testid={`filter-${f.id}`} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-bold transition ${filter === f.id ? "bg-primary text-primary-foreground shadow" : "bg-muted text-foreground/70"}`}>
            {f.label} <span className="opacity-70">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by client, phone or service" className="w-full rounded-xl border border-input bg-background py-2 pl-8 pr-3 text-xs" data-testid="input-job-search" />
      </div>

      {jobs === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {jobs && jobs.length === 0 && <p className="text-sm text-muted-foreground">No paid jobs yet.</p>}
      {jobs && jobs.length > 0 && shown.length === 0 && <p className="text-sm text-muted-foreground">No jobs match.</p>}

      <div className="space-y-3">
        {shown.map((j) => {
          const id = idOf(j), f = forms[id] ?? formOf(j), isOpen = !!open[id];
          const next = j.steps[j.index + 1];
          const working = busy === id;
          const hist = history[id];
          return (
            <div key={id} className="rounded-2xl border border-border bg-card p-3" data-testid="job-admin-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{j.item}</p>
                  <p className="text-xs text-muted-foreground">{j.name} · {j.phone}</p>
                </div>
                <p className="shrink-0 text-right text-[11px] text-muted-foreground">Paid {kes(j.paid)}<br /><b className="text-foreground">Balance {kes(Math.max(0, j.agreedTotal - j.paid))}</b></p>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <select value={j.type} onChange={(e) => send(j, { jobType: e.target.value }, false)} aria-label="Job type" className="rounded-lg border border-input bg-background px-2 py-1 text-xs">
                  {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[j.status]}`}>{STATUS_LABEL[j.status]}</span>
                {j.updatedAt && <span className="text-[11px] text-muted-foreground">Updated {ago(j.updatedAt)}</span>}
              </div>

              <p className="mt-2.5 text-base font-extrabold leading-tight text-foreground">{j.step}</p>
              <div className="mt-1.5 flex gap-1" aria-label={`Step ${j.index + 1} of ${j.steps.length}`}>
                {j.steps.map((s, i) => <span key={s} title={s} className={`h-1.5 flex-1 rounded-full ${i <= j.index ? "bg-primary" : "bg-muted-foreground/20"}`} />)}
              </div>
              {(j.eta || j.note) && <p className="mt-1.5 text-xs text-muted-foreground">{j.eta && <b className="text-sky-700">{j.eta}. </b>}{j.note}</p>}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => send(j, { next: true }, true)} disabled={!next || working} data-testid="button-next-step"
                  className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground shadow disabled:opacity-50"
                >
                  {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : next ? <ChevronRight className="h-3.5 w-3.5 shrink-0" /> : <Check className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{next ? `Next: ${next}` : "Completed"}</span>
                </button>
                <select
                  value="" onChange={(e) => e.target.value && send(j, { step: e.target.value }, true)} aria-label="Jump to a step" disabled={working}
                  className="w-28 shrink-0 rounded-xl border border-input bg-background px-2 py-2 text-xs font-semibold"
                >
                  <option value="">Jump to…</option>
                  {j.steps.map((s, i) => <option key={s} value={s}>{i + 1}. {s}</option>)}
                </select>
              </div>

              <button
                type="button" role="switch" aria-checked={j.liveNow} disabled={working} data-testid="switch-live-now"
                onClick={() => send(j, { liveUrl: f.liveUrl, liveNow: !j.liveNow }, false)}
                className="mt-3 flex items-center gap-2 text-xs font-bold text-foreground"
              >
                <span className={`relative h-5 w-9 rounded-full transition ${j.liveNow ? "bg-red-500" : "bg-muted-foreground/30"}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${j.liveNow ? "left-[18px]" : "left-0.5"}`} />
                </span>
                <Radio className={`h-3.5 w-3.5 ${j.liveNow ? "animate-pulse text-red-600" : "text-muted-foreground"}`} />
                {j.liveNow ? "Live now: client sees Watch live" : "Live now (off)"}
              </button>

              <button onClick={() => setOpen((o) => ({ ...o, [id]: !o[id] }))} className="mt-3 flex w-full items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-[11px] font-bold text-foreground" aria-expanded={isOpen}>
                <span>Note, photo or video, time, team, live link</span>
                <ChevronDown className={`h-4 w-4 transition ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="mt-2 space-y-2 rounded-xl bg-muted/40 p-2.5">
                  <p className="text-[11px] text-muted-foreground">What you type here goes with your next tap on <b>Next</b>, <b>Jump to</b> or <b>Post update</b>.</p>
                  <input value={f.note} onChange={(e) => setForm(id, { note: e.target.value })} maxLength={300} placeholder="Short note to the client (optional)" className={inp} />
                  <input value={f.eta} onChange={(e) => setForm(id, { eta: e.target.value })} maxLength={80} placeholder="Expected time, e.g. Arriving about 2 pm" className={inp} />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={f.teamName} onChange={(e) => setForm(id, { teamName: e.target.value })} maxLength={60} placeholder="Site team name" className={inp} />
                    <PhoneField value={f.teamPhone} onChange={(v) => setForm(id, { teamPhone: v })} className={inp} />
                  </div>

                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => files.current[id]?.click()} disabled={busy === `up:${id}`} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-60">
                      {busy === `up:${id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} {busy === `up:${id}` ? "Uploading…" : "Photo or video"}
                    </button>
                    <input ref={(el) => { files.current[id] = el; }} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { upload(j, e.target.files?.[0]); e.target.value = ""; }} />
                    <p className="text-[11px] text-muted-foreground">Photo up to 10 MB, short video up to 100 MB.</p>
                  </div>
                  {f.mediaUrl && (
                    <div className="relative">
                      <Media e={{ mediaUrl: f.mediaUrl, mediaType: f.mediaType }} />
                      <button onClick={() => setForm(id, { mediaUrl: "", mediaType: "" })} aria-label="Remove" className="absolute right-1.5 top-3 rounded-full bg-black/60 p-1 text-white"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                  <button onClick={() => send(j, {}, true)} disabled={working || !(f.note || f.eta || f.mediaUrl)} className="rounded-lg bg-primary px-3.5 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid="button-post-update">Post update (same step)</button>

                  <div className="border-t border-border pt-2">
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><Radio className="h-3.5 w-3.5" /> Live stream</p>
                    <div className="flex gap-2">
                      <input value={f.liveUrl} onChange={(e) => setForm(id, { liveUrl: e.target.value })} placeholder="Live stream link (https://…)" inputMode="url" className={inp} />
                      <button onClick={() => send(j, { liveUrl: f.liveUrl }, false)} disabled={working} className="shrink-0 rounded-lg bg-muted px-3 py-1.5 text-[11px] font-bold text-foreground">Save link</button>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input value={f.recUrl} onChange={(e) => setForm(id, { recUrl: e.target.value })} placeholder="Recording link after the stream (optional)" inputMode="url" className={inp} />
                      <button onClick={() => send(j, { recordingUrl: f.recUrl }, false)} disabled={working} className="shrink-0 rounded-lg bg-muted px-3 py-1.5 text-[11px] font-bold text-foreground">Save</button>
                    </div>
                  </div>

                  <button onClick={() => showHistory(j)} className="flex items-center gap-1.5 text-[11px] font-bold text-primary"><History className="h-3.5 w-3.5" /> {hist ? "Hide history" : `Update history (${j.updates})`}</button>
                  {hist && (
                    <div className="space-y-2">
                      {hist.length === 0 && <p className="text-xs text-muted-foreground">No updates saved yet.</p>}
                      {hist.map((e) => (
                        <div key={e.id} className="rounded-lg border border-border bg-background p-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-bold text-foreground">{e.step}{e.important && <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-800">Important</span>}</p>
                            <button onClick={() => delEvent(j, e)} aria-label="Delete update" className="text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{clock(e.at)} · {e.by}</p>
                          {e.eta && <p className="text-xs font-semibold text-sky-700">{e.eta}</p>}
                          {e.note && <p className="text-xs text-foreground/80">{e.note}</p>}
                          <Media e={e} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {err?.id === id && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" role="alert">{err.msg}</p>}
              {saved === id && <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><Check className="h-3 w-3" /> Saved and client told</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
