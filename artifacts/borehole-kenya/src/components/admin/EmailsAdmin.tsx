import { useEffect, useState } from "react";
import { Mail, Send, Trash2, Loader2, CalendarClock, Plus, Pencil } from "lucide-react";
import { API } from "@/lib/member";

interface Sub { id: number; email: string; name: string; source: string; created_at: string; unsubscribed_at: string | null }
interface Data { mailReady: boolean; from: string; active: number; rows: Sub[] }


interface Offer { id: number; subject: string; message: string; button_text: string; button_url: string; sent_count: number; last_sent_at: string | null }
interface Auto { enabled: boolean; weekday: number; hour: number; lastSentAt: string | null; nextSend: string; offers: Offer[] }
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Sends by itself: one offer a week, on the chosen day and hour, rotating through the offers written here.
function WeeklyAuto({ adminKey }: { adminKey: string }) {
  const [a, setA] = useState<Auto | null>(null), [note, setNote] = useState("");
  const [edit, setEdit] = useState<{ id: number | null; subject: string; message: string; buttonText: string; buttonUrl: string } | null>(null);
  const h = { "x-admin-key": adminKey, "Content-Type": "application/json" };
  const load = () => fetch(`${API}/api/admin/email-auto`, { headers: h }).then((r) => (r.ok ? r.json() : null)).then(setA).catch(() => setA(null));
  useEffect(() => { void load(); }, [adminKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (p: Partial<Pick<Auto, "enabled" | "weekday" | "hour">>) => {
    if (!a) return; const n = { ...a, ...p }; setA(n); setNote("");
    const r = await fetch(`${API}/api/admin/email-auto`, { method: "PUT", headers: h, body: JSON.stringify({ enabled: n.enabled, weekday: n.weekday, hour: n.hour }) });
    if (!r.ok) setNote("Could not save."); await load();
  };
  const saveOffer = async () => {
    if (!edit) return; setNote("");
    const r = await fetch(`${API}/api/admin/email-offers${edit.id ? `/${edit.id}` : ""}`, { method: edit.id ? "PUT" : "POST", headers: h, body: JSON.stringify(edit) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setNote(j.error || "Could not save."); return; }
    setEdit(null); await load();
  };
  const del = async (id: number) => { if (!window.confirm("Delete this offer?")) return; await fetch(`${API}/api/admin/email-offers/${id}`, { method: "DELETE", headers: h }); await load(); };
  const inp = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  if (!a) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4" data-testid="weekly-auto">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground"><CalendarClock className="h-4 w-4 text-primary" /> Automatic weekly email</p>
        <button type="button" role="switch" aria-checked={a.enabled} onClick={() => void save({ enabled: !a.enabled })} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${a.enabled ? "bg-emerald-600" : "bg-muted-foreground/30"}`} data-testid="switch-auto"><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${a.enabled ? "left-[22px]" : "left-0.5"}`} /></button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Write your offers once. Every week one goes to everyone on the list by itself. The one sent longest ago goes next, so they rotate.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground">
        Send every
        <select value={a.weekday} onChange={(e) => void save({ weekday: Number(e.target.value) })} className="rounded-lg border border-border bg-background px-2 py-1.5" data-testid="select-weekday">{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
        at
        <select value={a.hour} onChange={(e) => void save({ hour: Number(e.target.value) })} className="rounded-lg border border-border bg-background px-2 py-1.5" data-testid="select-hour">{Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{`${String(i).padStart(2, "0")}:00`}</option>)}</select>
        (Nairobi time)
      </div>
      <p className="mt-2 text-xs font-semibold" role="status">{a.enabled ? (a.offers.length ? `On. Next email: ${new Date(a.nextSend).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.` : "On, but nothing will be sent until you add an offer below.") : "Off. Nothing is sent automatically."}</p>
      <div className="mt-3 grid gap-2">
        {a.offers.map((o) => (
          <div key={o.id} className="rounded-xl border border-border bg-background p-2.5 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="truncate font-bold text-foreground">{o.subject}</p><p className="line-clamp-2 text-muted-foreground">{o.message}</p><p className="mt-0.5 text-[11px] text-muted-foreground">Sent {o.sent_count} time{o.sent_count === 1 ? "" : "s"}{o.last_sent_at ? `, last on ${new Date(o.last_sent_at).toLocaleDateString("en-KE")}` : ""}</p></div>
              <div className="flex shrink-0 gap-3"><button onClick={() => setEdit({ id: o.id, subject: o.subject, message: o.message, buttonText: o.button_text, buttonUrl: o.button_url })} aria-label="Edit" className="text-primary"><Pencil className="h-4 w-4" /></button><button onClick={() => void del(o.id)} aria-label="Delete" className="text-red-500"><Trash2 className="h-4 w-4" /></button></div>
            </div>
          </div>
        ))}
      </div>
      {edit ? (
        <div className="mt-3 grid gap-2 rounded-xl border border-primary/30 bg-muted/30 p-3">
          <input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} placeholder="Subject" maxLength={120} className={inp} data-testid="input-offer-subject" />
          <textarea value={edit.message} onChange={(e) => setEdit({ ...edit, message: e.target.value })} placeholder="Message. Leave a blank line between paragraphs." rows={5} maxLength={5000} className={inp} data-testid="input-offer-message" />
          <div className="grid gap-2 sm:grid-cols-2"><input value={edit.buttonText} onChange={(e) => setEdit({ ...edit, buttonText: e.target.value })} placeholder="Button text (optional)" maxLength={40} className={inp} /><input value={edit.buttonUrl} onChange={(e) => setEdit({ ...edit, buttonUrl: e.target.value })} placeholder="Button link (optional), https://..." className={inp} /></div>
          <div className="flex gap-2"><button onClick={() => void saveOffer()} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition active:scale-95" data-testid="button-offer-save">Save offer</button><button onClick={() => { setEdit(null); setNote(""); }} className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-foreground">Cancel</button></div>
        </div>
      ) : (
        <button onClick={() => setEdit({ id: null, subject: "", message: "", buttonText: "", buttonUrl: "" })} className="mt-3 flex items-center gap-1.5 text-xs font-bold text-primary" data-testid="button-offer-add"><Plus className="h-4 w-4" /> Add an offer</button>
      )}
      {note && <p className="mt-2 text-xs font-semibold text-red-600" role="alert">{note}</p>}
    </div>
  );
}

// The email list and the offer sender. "Send me a test" goes only to the owner; "Send to everyone" goes to every active subscriber.
export default function EmailsAdmin({ adminKey }: { adminKey: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [subject, setSubject] = useState(""), [message, setMessage] = useState(""), [btnText, setBtnText] = useState(""), [btnUrl, setBtnUrl] = useState("");
  const [busy, setBusy] = useState(false), [note, setNote] = useState("");
  const h = { "x-admin-key": adminKey, "Content-Type": "application/json" };
  const load = () => fetch(`${API}/api/admin/subscribers`, { headers: h }).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null));
  useEffect(() => { void load(); }, [adminKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (test: boolean) => {
    if (!test && !window.confirm(`Send this to all ${d?.active ?? 0} subscribers?`)) return;
    setBusy(true); setNote("");
    try {
      const r = await fetch(`${API}/api/admin/broadcast`, { method: "POST", headers: h, body: JSON.stringify({ subject, message, test, buttonText: btnText, buttonUrl: btnUrl }) });
      const j = await r.json().catch(() => ({}));
      setNote(!r.ok ? (j.error || "Could not send.") : test ? (j.ok ? "Test sent to your own email. Check your inbox." : "The test could not be sent. Check RESEND_API_KEY and MAIL_FROM on Render.") : `Sent to ${j.sent} of ${j.total} subscribers.`);
    } catch { setNote("Could not reach the server."); }
    setBusy(false);
  };
  const del = async (id: number) => { if (!window.confirm("Remove this address from the list?")) return; await fetch(`${API}/api/admin/subscribers/${id}`, { method: "DELETE", headers: h }); void load(); };
  const inp = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  return (
    <div className="grid gap-5" data-testid="emails-admin">
      <WeeklyAuto adminKey={adminKey} />
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground"><Mail className="h-4 w-4 text-primary" /> Send an offer now</p>
        {d && !d.mailReady && <p className="mt-2 rounded-lg bg-sky-50 p-2 text-xs font-semibold text-sky-800">Email is not set up: add RESEND_API_KEY on Render.</p>}
        {d && d.mailReady && !d.from && <p className="mt-2 rounded-lg bg-sky-50 p-2 text-xs font-semibold text-sky-800">Emails come from Resend's test address. Add MAIL_FROM on Render (for example: Dighaz Engineering &lt;info@dighazengineering.com&gt;) once your domain is verified in Resend.</p>}
        <div className="mt-3 grid gap-2.5">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject, e.g. This week: free site visit for new boreholes" className={inp} maxLength={120} data-testid="input-email-subject" />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your message. Leave a blank line between paragraphs." rows={7} className={inp} maxLength={5000} data-testid="input-email-message" />
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={btnText} onChange={(e) => setBtnText(e.target.value)} placeholder="Button text (optional), e.g. Get a quote" className={inp} maxLength={40} />
            <input value={btnUrl} onChange={(e) => setBtnUrl(e.target.value)} placeholder="Button link (optional), https://..." className={inp} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => void send(true)} className="flex items-center gap-1.5 rounded-xl border border-primary px-4 py-2 text-xs font-bold text-primary transition active:scale-95 disabled:opacity-50" data-testid="button-email-test">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send me a test</button>
            <button disabled={busy || !d || d.active === 0} onClick={() => void send(false)} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition active:scale-95 disabled:opacity-50" data-testid="button-email-all"><Send className="h-4 w-4" /> Send to everyone ({d?.active ?? 0})</button>
          </div>
          {note && <p className="text-xs font-semibold text-foreground" role="status">{note}</p>}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-bold text-foreground">Email list ({d?.active ?? 0} active)</h3>
        {d && d.rows.length === 0 && <p className="text-xs text-muted-foreground">No one has joined yet. The sign-up box is at the bottom of every page.</p>}
        <div className="grid gap-1.5">
          {d?.rows.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs">
              <div className="min-w-0"><p className="truncate font-semibold text-foreground">{s.email}</p><p className="text-[11px] text-muted-foreground">{new Date(s.created_at).toLocaleDateString("en-KE")}{s.unsubscribed_at ? " · unsubscribed" : ""}</p></div>
              <button onClick={() => void del(s.id)} aria-label="Remove" className="shrink-0 text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
