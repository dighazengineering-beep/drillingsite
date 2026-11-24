import { GoogleFill } from "@/components/GoogleFill";
import { MapBoundary } from "@/components/MapBoundary";
import { ReasonPicker, RecommendToggle, POINT_YES, POINT_NO } from "@/components/ReasonPicker";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { MapPin, LocateFixed, ScanLine, FileText, Loader2, CheckCircle2, Upload, Download, Trash2, Lock, LockOpen, Smartphone, Sparkles, ImageIcon } from "lucide-react";
import WordView from "@/components/WordView";
import { API, memberApi, memberToken, setMemberToken } from "@/lib/member";
import { PhoneField } from "@/components/PhoneField";
import { DateSelect, todayLong } from "@/components/DateSelect";
import PlaceInput from "@/components/PlaceInput";
import { countySuggestions, subCountySuggestions, wardSuggestions, villageSuggestions, loadAreas, reverseGeocode, whereAmI } from "@/lib/places";
import { parseCoords } from "@/lib/coords";
const MapPicker = lazy(() => import("@/components/MapPicker"));

interface Plan { key: "one" | "sub" | "year" | "boost"; item: string; price: number; label: string; blurb: string }
interface Rep { id: number; title: string; status: string; progress: string; ready: boolean; unlocked?: boolean; preview?: boolean; released: boolean; error: string; createdAt: string }
interface W { can: boolean; subUntil: string | null; canBoost: boolean; reports: Rep[] }
interface Pick { fileId: number; station: string; recommended: boolean; yieldText: string; reason: string; zoneFrom: number; zoneTo: number }

const PURPOSES = ["Borehole siting for a homestead", "Domestic water supply", "Irrigation / farming", "Livestock watering", "School, church or hospital", "Hotel, lodge or camp", "Commercial or industrial use", "Estate or community water project", "Water for construction"];
const inp = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25";
const lab = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const card = "rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5";
const kes = (n: number) => `KSh ${n.toLocaleString("en-KE")}`;
const INSTR = ["ADMT-600SX-32D", "ADMT-600S-X", "PQWT-500S"];
const STORE = "dighaz-report-wallet";
const load = (): { phone: string; key: string } | null => { try { const v = JSON.parse(localStorage.getItem(STORE) ?? "null"); return v?.phone && v?.key ? v : null; } catch { return null; } };
const save = (v: { phone: string; key: string } | null) => { try { v ? localStorage.setItem(STORE, JSON.stringify(v)) : localStorage.removeItem(STORE); } catch { /* ignore */ } };
const DOCS: [string, string][] = [["id_front", "National ID (front)"], ["id_back", "National ID (back)"], ["kra", "KRA PIN certificate"], ["land", "Land ownership document"]];
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Could not read that picture.")); i.src = url; });
    const k = Math.min(1, 1400 / Math.max(im.width, im.height)); const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
    c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
    let qy = 0.8, out = c.toDataURL("image/jpeg", qy);
    while (out.length > 1_500_000 && qy > 0.4) { qy -= 0.1; out = c.toDataURL("image/jpeg", qy); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}
const q = (a: { phone: string; key: string }) => `phone=${encodeURIComponent(a.phone)}&key=${encodeURIComponent(a.key)}`;

type LFlow = { p: string } | { table: { caption: string; head: string[]; rows: string[][] } } | { bullets: string[] };
interface LiveDoc { title: string; company: string; lines: [string, string][]; date: string; sections: { id: string; num: string; title: string; level: number; flow: LFlow[] }[]; done: boolean; none?: boolean }

/** Reveals text as if it were being typed. */
function Typed({ text, instant, onDone }: { text: string; instant: boolean; onDone?: () => void }) {
  const [n, setN] = useState(instant ? text.length : 0);
  useEffect(() => {
    if (instant) { onDone?.(); return; }
    const t = setInterval(() => setN((x) => { const y = Math.min(text.length, x + 4); if (y >= text.length) { clearInterval(t); setTimeout(() => onDone?.(), 0); } return y; }), 16);
    return () => clearInterval(t);
  }, [text, instant]);
  return <>{text.slice(0, n)}{n < text.length && <span className="animate-pulse">▍</span>}</>;
}

function LiveSection({ s, instant }: { s: LiveDoc["sections"][number]; instant: boolean }) {
  const [shown, setShown] = useState(instant ? s.flow.length : 0);
  const head = s.level === 1 ? "mt-6 text-sm font-extrabold tracking-wide text-[#0B2A4A] dark:text-sky-300" : s.level === 2 ? "mt-4 text-sm font-bold text-foreground" : "mt-3 text-xs font-bold text-foreground";
  return (
    <div>
      <h3 className={head}>{s.num} {s.title}</h3>
      {s.flow.slice(0, shown + 1).map((f, i) => {
        const last = i === shown; const go = () => setShown((x) => (x === i ? x + 1 : x));
        if ("p" in f) return <p key={i} className="mt-1.5 text-justify text-[13px] leading-relaxed text-foreground">{last && !instant ? <Typed text={f.p} instant={false} onDone={go} /> : f.p}</p>;
        if ("bullets" in f) return <ul key={i} ref={(el) => { if (el && last && !instant) setTimeout(go, 700); }} className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-foreground">{f.bullets.map((b, k) => <li key={k}>{b}</li>)}</ul>;
        return (
          <div key={i} className="mt-2 overflow-x-auto" ref={(el) => { if (el && last && !instant) setTimeout(go, 600); }}>
            <p className="mb-1 text-[11px] font-bold text-foreground">Table: {f.table.caption}</p>
            <table className="w-full border-collapse text-[11.5px]"><thead><tr>{f.table.head.map((h, k) => <th key={k} className="border border-border bg-[#0B2A4A] px-2 py-1 text-left font-bold text-white">{h}</th>)}</tr></thead><tbody>{f.table.rows.map((r, k) => <tr key={k}>{r.map((c, m) => <td key={m} className="border border-border px-2 py-1 align-top text-foreground">{c}</td>)}</tr>)}</tbody></table>
          </div>
        );
      })}
    </div>
  );
}

/** The report appearing as it is written: the title page first, then each section once it has been confirmed. */

const DETAIL_LABELS: Record<string, string> = { clientName: "Client", clientPhone: "Phone", siteRef: "Site reference", village: "Village", locationName: "Location", subcounty: "Sub-county", county: "County", landmark: "Landmark", elevation: "Elevation (m)", lat: "Latitude", lng: "Longitude", purpose: "Purpose", instrument: "Instrument", surveyDate: "Survey date", collectedBy: "Surveyed by", stationCount: "Stations", minDepth: "Minimum depth (m)", maxDepth: "Maximum depth (m)", prefDepth: "Preferred depth (m)", minYield: "Minimum yield", maxYield: "Maximum yield" };
/** The saved details of a report, always the latest (so anything our team corrected shows here too). */
function ReportDetails({ id, auth }: { id: number; auth: { phone: string; key: string } }) {
  const [open, setOpen] = useState(false); const [j, setJ] = useState<{ data: Record<string, string>; picks: any[] } | null>(null);
  useEffect(() => { if (!open) return; let on = true; const go = () => fetch(`${API}/api/my-reports/${id}/details?${q(auth)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((x) => { if (on && x) setJ(x); }).catch(() => {}); void go(); const t = setInterval(go, 8000); return () => { on = false; clearInterval(t); }; }, [open, id, auth]);
  return (
    <div className="mt-2 text-xs">
      <button type="button" onClick={() => setOpen(!open)} className="font-semibold text-primary underline">{open ? "Hide details" : "See the report details"}</button>
      {open && (j ? <div className="mt-2 grid gap-x-4 gap-y-1 rounded-lg bg-muted/40 p-2 sm:grid-cols-2">
        {Object.entries(j.data).filter(([k]) => DETAIL_LABELS[k]).map(([k, v]) => <div key={k}><span className="text-muted-foreground">{DETAIL_LABELS[k]}: </span><span className="font-medium text-foreground">{String(v)}</span></div>)}
        {j.picks.map((p, i) => <div key={i} className="sm:col-span-2"><span className="text-muted-foreground">Station {p.station || i + 1}{p.recommended ? " (recommended)" : ""}: </span><span className="font-medium text-foreground">{[p.zoneFrom && p.zoneTo ? `water zone ${p.zoneFrom}-${p.zoneTo} m` : "", p.prefDepth ? `preferred ${p.prefDepth} m` : "", p.yieldText ? `yield ${p.yieldText}` : "", p.reason].filter(Boolean).join(" · ")}</span></div>)}
      </div> : <div className="mt-2 text-muted-foreground">Loading…</div>)}
    </div>
  );
}

export function LiveReport({ id, auth, url, headers }: { id: number; auth?: { phone: string; key: string }; url?: string; headers?: Record<string, string> }) {
  const [doc, setDoc] = useState<LiveDoc | null>(null);
  const first = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => { try { const r = await fetch(url ?? `${API}/api/my-reports/${id}/live?${q(auth!)}`, headers ? { headers } : undefined); if (r.ok) { const j = (await r.json()) as LiveDoc; if (!stop) { if (first.current === null) first.current = j.sections.length; setDoc(j); } } } catch { /* try again */ } };
    void tick(); const t = setInterval(tick, 2500);
    return () => { stop = true; clearInterval(t); };
  }, [id]);
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [doc?.sections.length]);
  if (!doc || doc.none) return null;
  return (
    <div className={`${card} space-y-3`}>
      <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-foreground">{doc.done ? "Your report is ready" : "Your report is being written"}</h2>{!doc.done && <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> writing…</span>}</div>
      <div ref={box} className="max-h-[70vh] space-y-1 overflow-y-auto rounded-xl border border-border bg-white p-5 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <div className="mb-5 border-b border-border pb-5 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">{doc.company}</p>
          <h3 className="mt-3 text-lg font-extrabold text-[#0B2A4A] dark:text-sky-300">{doc.title}</h3>
          <table className="mx-auto mt-3 text-left text-[12px]"><tbody>{doc.lines.map(([k, v]) => <tr key={k}><td className="pr-3 font-bold">{k}</td><td>{v}</td></tr>)}</tbody></table>
          <p className="mt-3 text-[11px] text-neutral-500">{doc.date}</p>
        </div>
        {doc.sections.map((s, i) => <LiveSection key={s.id} s={s} instant={i < (first.current ?? 0)} />)}
      </div>
    </div>
  );
}

export default function Report() {
  const [plans, setPlans] = useState<Plan[]>([]); const [free, setFree] = useState(false);
  const [auth, setAuth] = useState<{ phone: string; key: string } | null>(null);
  const [w, setW] = useState<W | null>(null);

  useEffect(() => {
    document.title = "Get a Hydrogeological Survey Report | Dighaz Engineering Limited";
    const u = new URL(location.href); const p = u.searchParams.get("p"), k = u.searchParams.get("k");
    if (p && k) { save({ phone: p, key: k }); history.replaceState(null, "", "/report"); }
    setAuth(load());
    fetch(`${API}/api/report-plans`).then((r) => r.json()).then((d) => { setPlans(d.plans ?? []); setFree(!!d.free); }).catch(() => {});
  }, []);

  const [unlockId, setUnlockId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const getFile = async (id: number, what: "preview" | "download", name: string) => {
    let x: Response; try { x = await fetch(`${API}/api/my-reports/${id}/${what}?${q(auth!)}`); } catch { alert("The download could not start. Check your internet and try again."); return; }
    if (!x.ok) { let m = ""; try { m = ((await x.json()) as { error?: string }).error ?? ""; } catch { /* not json */ } alert(m || `The download failed (error ${x.status}). Please try again in a minute.`); return; }
    const b = await x.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click();
  };
  const refresh = useCallback(async () => {
    if (!auth) { setW(null); return; }
    const r = await fetch(`${API}/api/my-reports?${q(auth)}`);
    if (r.status === 401) { save(null); setAuth(null); return; }
    if (r.ok) setW(await r.json());
  }, [auth]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!w?.reports.some((x) => x.status === "working" || x.status === "review")) return; const t = setInterval(() => void refresh(), 6000); return () => clearInterval(t); }, [w, refresh]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-16 pt-24 sm:pt-28">
      <div className={card}>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-foreground"><FileText className="h-6 w-6 text-primary" /> Hydrogeological Survey Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">Fill in your survey details and upload the screenshots from the machine. You get a PDF preview with a watermark as soon as it is ready. Pay to unlock the clean PDF and the editable Word file.</p>
      </div>

      {w && w.reports.some((r) => r.status !== "draft") && (
        <div className={card}>
          <h2 className="mb-3 text-sm font-bold text-foreground">Your reports</h2>
          <div className="space-y-2">
            {w.reports.filter((r) => r.status !== "draft").map((r) => (
              <div key={r.id} className="rounded-xl border border-border p-3"><div className="flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="truncate text-sm font-semibold text-foreground">{r.title || "Survey report"}</div>
                  <div className="text-xs text-muted-foreground">{r.ready ? "Ready" : r.status === "failed" ? r.error : r.status === "review" ? "Being checked by our hydrogeologist. We will SMS you." : r.progress || "Being written…"}</div></div>
                {r.status === "working" && <button onClick={() => { if (confirm("Stop writing this report?")) void rApi(`/${r.id}/stop`, "POST").then(() => refresh()).catch(() => {}); }} className="shrink-0 rounded-lg border border-red-500/60 px-3 py-2 text-xs font-bold text-red-600">Stop</button>}
                {r.ready && <button onClick={() => setViewId(viewId === r.id ? null : r.id)} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground">{viewId === r.id ? "Hide" : "View report"}</button>}
                {r.ready ? <div className="flex shrink-0 flex-col gap-1.5">
                  {r.preview && <button onClick={() => void getFile(r.id, "preview", `${r.unlocked === false ? "Preview" : "Report"} - ${r.title}.pdf`)} className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground"><Download className="h-4 w-4" /> {r.unlocked === false ? "PDF (watermarked)" : "Download PDF"}</button>}
                  {r.unlocked === false
                    ? <button onClick={() => setUnlockId(unlockId === r.id ? null : r.id)} className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><Lock className="h-4 w-4" /> Word: pay to unlock</button>
                    : <button onClick={() => void getFile(r.id, "download", `Hydrogeological Survey Report - ${r.title}.docx`)} className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><LockOpen className="h-4 w-4" /> Download Word</button>}
                </div> : r.status === "failed" ? null : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
              </div>{viewId === r.id && auth && <WordView url={`${API}/api/my-reports/${r.id}/${r.unlocked === false ? "preview" : "download"}?${q(auth)}`} pdf={r.unlocked === false} onClose={() => setViewId(null)} />}{auth && <ReportDetails id={r.id} auth={auth} />}</div>
            ))}
          </div>
        </div>
      )}

      {auth && unlockId && <UnlockBox id={unlockId} auth={auth} plans={plans} onDone={() => { setUnlockId(null); void refresh(); }} />}
      {auth && w && w.reports.filter((r) => r.status === "working").map((r) => <LiveReport key={r.id} id={r.id} auth={auth} />)}

      <Form free={free} plans={plans} auth={auth} w={w} onAuth={(a) => { save(a); setAuth(a); }} onDone={() => void refresh()} />
    </div>
  );
}

async function rApi(path: string, method = "GET") {
  const r = await fetch(`${API}/api/my-reports${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${memberToken()}` }, body: method === "POST" ? "{}" : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || "Something went wrong."), { status: r.status });
  return j;
}
/** Sign-in step before paying, so every purchase is saved to the client's account (email or Google). */
function MemberGate({ initial, done }: { initial: { name: string; email: string; phone: string }; done: () => void }) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [f, setF] = useState({ name: initial.name, email: initial.email, phone: initial.phone, password: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const gbtn = useRef<HTMLDivElement>(null);
  const finish = (r: { token: string }) => { setMemberToken(r.token); done(); };
  useEffect(() => {
    let off = false;
    memberApi("/config").then((cfg: { googleClientId: string }) => {
      if (off || !cfg?.googleClientId) return;
      const init = () => {
        const g = (window as any).google; if (!g || !gbtn.current) return;
        g.accounts.id.initialize({ client_id: cfg.googleClientId, callback: async (resp: { credential: string }) => {
          setBusy(true); setErr("");
          try { finish(await memberApi("/google", { body: { credential: resp.credential } })); } catch (e) { setErr((e as Error).message); }
          setBusy(false);
        } });
        gbtn.current.innerHTML = ""; g.accounts.id.renderButton(gbtn.current, { theme: "outline", size: "large", width: 300, text: "continue_with", shape: "rectangular" });
      };
      if ((window as any).google) { init(); return; }
      const sc = document.createElement("script"); sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = init; document.head.appendChild(sc);
    }).catch(() => {});
    return () => { off = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { finish(await memberApi(mode === "signup" ? "/signup" : "/login", { body: f })); } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  };
  const set = (k: keyof typeof f, v: string) => setF((o) => ({ ...o, [k]: v }));
  return (
    <form onSubmit={submit} className={`${card} space-y-3 border-primary/40`}>
      <h2 className="text-sm font-bold text-foreground">{mode === "signup" ? "Create your account to continue" : "Sign in to continue"}</h2>
      <p className="text-xs text-muted-foreground">Your reports and payments are saved to your account, so you can open them on any phone. Buy 4 reports and the 5th is free.</p>
      <div ref={gbtn} />
      {mode === "signup" && <div><label className={lab}>Full name</label><input className={inp} value={f.name} onChange={(e) => set("name", e.target.value)} required /></div>}
      <div><label className={lab}>Email</label><input type="email" className={inp} value={f.email} onChange={(e) => set("email", e.target.value)} required /></div>
      {mode === "signup" && <div><label className={lab}>Phone</label><input className={inp} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0712 345 678" /></div>}
      <div><label className={lab}>Password</label><input type="password" className={inp} value={f.password} onChange={(e) => set("password", e.target.value)} required minLength={6} /></div>
      {err && <p className="text-sm font-semibold text-red-600">{err}</p>}
      <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{mode === "signup" ? "Sign up & continue" : "Sign in & continue"}</button>
      <button type="button" onClick={() => setMode(mode === "signup" ? "login" : "signup")} className="w-full text-center text-xs font-semibold text-primary">{mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}</button>
    </form>
  );
}

type Draft = { id: number; token: string };

/** The money step: plans (or only the booster for a plan holder who has used up their reports). Calls ready(auth) once paid. */
function PayBox({ plans, boostOnly, ready, disabled, note, initial }: { initial?: { name: string; phone: string; email: string }; plans: Plan[]; boostOnly: boolean; ready: (a: { phone: string; key: string }) => Promise<string | null>; disabled: boolean; note: string }) {
  const list = plans.filter((p) => (boostOnly ? p.key === "boost" : p.key !== "boost"));
  const [sel, setSel] = useState<Plan["key"]>("one");
  const [name, setName] = useState(initial?.name ?? ""); const [phone, setPhone] = useState(initial?.phone ?? ""); const [email, setEmail] = useState(initial?.email ?? "");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [wait, setWait] = useState("");
  const [code, setCode] = useState("");
  const testOn = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("test") === "1";
  const useCode = async () => {
    setErr(""); setBusy(true);
    try {
      const r = await fetch(`${API}/api/my-reports/test-access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "That did not work.");
      const bad = await ready({ phone: j.phone, key: j.key }); if (bad) throw new Error(bad);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { if (list.length && !list.some((p) => p.key === sel)) setSel(list[0]!.key); }, [list, sel]);
  const plan = list.find((p) => p.key === sel);
  const pay = async () => {
    if (!plan) return; setErr(""); setBusy(true);
    try {
      const r = await fetch(`${API}/api/payments/mpesa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone, email, kind: "service", item: plan.item, payType: "full", amount: plan.price, agreedTotal: plan.price }) });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Something went wrong.");
      setWait("Check your phone and enter your M-Pesa PIN…");
      for (let i = 0; i < 80; i++) {
        await new Promise((ok) => setTimeout(ok, 1500));
        const s = await fetch(`${API}/api/payments/${d.id}/status?key=${encodeURIComponent(d.key)}`).then((x) => x.json()).catch(() => ({}));
        if (s.status === "paid") {
          const c = await fetch(`${API}/api/my-reports/claim`, { method: "POST", headers: { "Content-Type": "application/json", ...(memberToken() ? { Authorization: `Bearer ${memberToken()}` } : {}) }, body: JSON.stringify({ paymentId: d.id, phone, key: d.key }) });
          const cj = await c.json().catch(() => ({})); if (!c.ok) throw new Error(cj.error || "Payment received but the report could not be started. Call us and we will fix it.");
          const n = phone.replace(/\D/g, ""); setWait("Payment received. Sending your report…");
          const bad = await ready({ phone: /^0/.test(n) ? `254${n.slice(1)}` : n.replace(/^\+/, ""), key: d.key }); if (bad) throw new Error(bad); setWait(""); return;
        }
        if (s.status === "failed" || s.status === "cancelled") throw new Error(s.status === "cancelled" ? "The payment was cancelled on your phone." : "The payment did not go through. Please try again.");
      }
      throw new Error("We did not get a reply from M-Pesa. If money was taken, call us and we will confirm it.");
    } catch (e) { setErr((e as Error).message); setWait(""); } finally { setBusy(false); }
  };
  return (
    <div className={`${card} space-y-4 border-primary/40`}>
      <h2 className="text-sm font-bold text-foreground">{boostOnly ? "Add a booster pack to continue" : "Pay to submit your report"}</h2>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <div className={`grid gap-2 ${list.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {list.map((p) => (
          <button key={p.key} onClick={() => setSel(p.key)} className={`rounded-xl border p-3 text-left transition ${sel === p.key ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
            <div className="text-lg font-extrabold text-foreground">{kes(p.price)}</div>
            <div className="text-xs font-semibold text-foreground">{p.label}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{p.blurb}</div>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={lab}>Your name</label><input className={inp} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className={lab}>M-Pesa phone</label><PhoneField value={phone} onChange={setPhone} kenyaOnly className={inp} /></div>
        <div className="sm:col-span-2"><label className={lab}>Email (optional)</label><input className={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      </div>
      {err && <p className="rounded-xl border border-red-300 bg-red-50 p-2.5 text-sm font-semibold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{err}</p>}
      {wait ? <p className="flex items-center gap-2 text-sm text-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {wait}</p> : (
        <button disabled={busy || disabled || !plan || name.trim().length < 2 || !phone} onClick={pay} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />} Pay {plan ? kes(plan.price) : ""} with M-Pesa and submit</button>
      )}
      {testOn && (
        <div className="flex items-end gap-2 rounded-lg border border-dashed border-border p-2.5">
          <div className="flex-1"><label className={lab}>Free test (enter your phone above). Code, only if one is set:</label><input className={inp} value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <button disabled={busy || !phone} onClick={useCode} className="rounded-xl border border-primary/40 px-3 py-2.5 text-xs font-bold text-primary disabled:opacity-50">Free test</button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Already paid on this phone? Open the link we SMS'd you, then submit.</p>
    </div>
  );
}

const DRAFT_KEY = "kws-report-form";
type Saved = { draft: { id: number; token: string } | null; d: Record<string, string>; picks: any[]; extras: { id: number; name: string }[]; coordText: string; skip: Record<string, boolean>; thumbs: Record<number, string> };
const readSaved = (): Partial<Saved> => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") ?? {}; } catch { return {}; } };
/** Small preview that survives a page refresh (a normal picture link does not). */
async function tinyThumb(file: File): Promise<string> {
  try { const bmp = await createImageBitmap(file); const k = Math.min(1, 220 / Math.max(bmp.width, bmp.height)); const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k)); c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.7); } catch { return URL.createObjectURL(file); }
}

/** Pay to unlock one report's Word file. Members sign in first (purchases are saved; every 5th single report is free). */
function UnlockBox({ id, auth, plans, onDone }: { id: number; auth: { phone: string; key: string }; plans: Plan[]; onDone: () => void }) {
  const [signed, setSigned] = useState(!!memberToken()); const [busy, setBusy] = useState(true); const [err, setErr] = useState("");
  const [toGo, setToGo] = useState<number | null>(null); const [sub, setSub] = useState(false);
  const unlock = async (a: { phone: string; key: string }): Promise<string | null> => {
    const r = await fetch(`${API}/api/my-reports/${id}/unlock?${q(a)}`, { method: "POST" }); const j = await r.json().catch(() => ({}));
    if (!r.ok) return j.error === "pay" ? "Please pay to unlock." : j.error === "boost" ? "Your plan reports are used up. Add a booster pack." : j.error || "Could not unlock.";
    onDone(); return null;
  };
  const check = async () => {
    if (!memberToken()) { setSigned(false); setBusy(false); return; }
    setSigned(true); setBusy(true); setErr("");
    try {
      const l = await rApi("/loyalty");
      if (l.free) { const b = await rApi("/bonus", "POST"); const bad = await unlock({ phone: b.phone, key: b.key }); if (bad) setErr(bad); setBusy(false); return; }
      setToGo(l.sub ? null : l.toGo); setSub(!!l.sub);
    } catch (e) { if ((e as { status?: number }).status === 401) { setMemberToken(""); setSigned(false); } }
    setBusy(false);
  };
  useEffect(() => { void check(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (busy) return <div className={`${card} flex items-center gap-2 text-sm text-muted-foreground`}><Loader2 className="h-4 w-4 animate-spin" /> One moment…</div>;
  if (!signed) return <MemberGate initial={{ name: "", email: "", phone: auth.phone }} done={() => void check()} />;
  return (<div className="space-y-2">{err && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">{err}</p>}
    <PayBox plans={plans} boostOnly={false} disabled={false} ready={(a) => unlock(a)} initial={{ name: "", phone: auth.phone, email: "" }} note={`Pay with the phone number you used for the report (${auth.phone}). ${!sub && toGo ? `Single reports: pay for ${toGo} more and the next one is free.` : ""}`} /></div>);
}
function Form({ free, plans, auth, w, onAuth, onDone }: { free: boolean; plans: Plan[]; auth: { phone: string; key: string } | null; w: W | null; onAuth: (a: { phone: string; key: string }) => void; onDone: () => void }) {
  const sv = useRef(readSaved()).current;
  const [d, setD] = useState<Record<string, string>>({ instrument: INSTR[2]!, collectedBy: "Dighaz Engineering Limited", surveyDate: todayLong(), ...(sv.d ?? {}) });
  const [draft, setDraft] = useState<Draft | null>((sv.draft as Draft | null) ?? null);
  const [picks, setPicks] = useState<Pick[]>((sv.picks as Pick[]) ?? []);
  const [thumbs, setThumbs] = useState<Record<number, string>>(sv.thumbs ?? {});
  const [extras, setExtras] = useState<{ id: number; name: string }[]>(sv.extras ?? []);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [needBoost, setNeedBoost] = useState(false); const [sent, setSent] = useState(false); const [liveId, setLiveId] = useState<number | null>(null);
  const making = useRef<Promise<Draft | null> | null>(null);
  const [coordText, setCoordText] = useState(sv.coordText ?? ""); const [coordMsg, setCoordMsg] = useState(""); const [reading, setReading] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [docs, setDocs] = useState<Record<string, string>>({}); const [saved, setSaved] = useState<Record<string, string>>({}); const [skip, setSkip] = useState<Record<string, boolean>>(sv.skip ?? {});
  useEffect(() => { if (!auth) { setSaved({}); return; } fetch(`${API}/api/my-docs?${q(auth)}`).then((r) => (r.ok ? r.json() : {})).then((j) => setSaved(j && typeof j === "object" ? (j as Record<string, string>) : {})).catch(() => {}); }, [auth]);
  const elevManual = useRef(false);
  const autoPlace = useRef<Record<string, string>>({}); const coordTimer = useRef<number>(0); const [mapOpen, setMapOpen] = useState(false);
  const payRef = useRef<HTMLDivElement>(null);
  useEffect(() => { void loadAreas(); }, []);
  // keep the filled form, so a refresh does not lose it
  useEffect(() => { try { if (sent) localStorage.removeItem(DRAFT_KEY); else localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, d, picks, extras, coordText, skip, thumbs })); } catch { /* storage full or blocked */ } }, [draft, d, picks, extras, coordText, skip, thumbs, sent]);
  // save what the client has typed to the server (a few seconds after they stop), so unfinished reports are not lost and the admin can see them
  useEffect(() => {
    if (sent) return;
    const typed = !!((d.clientName ?? "").trim() || (d.clientPhone ?? "").replace(/\D/g, "").length > 4 || (d.county ?? "").trim());
    if (!typed && !draft) return;
    const t = setTimeout(async () => { const dr = await ensureDraft(); if (dr) { try { await fetch(`${API}/api/my-reports/${dr.id}/data`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: dr.token, data: { ...d, picks } }) }); } catch { /* try again on the next change */ } } }, 3000);
    return () => clearTimeout(t);
  }, [d, picks, sent]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Coordinates found: store them, then fill county, sub-county, ward and village from the spot (only boxes still empty). */
  const applyCoords = async (lat: number, lng: number) => {
    setD((x) => ({ ...x, lat: String(lat), lng: String(lng) }));
    setCoordMsg(`Coordinates: ${lat}, ${lng}`);
    if (!elevManual.current) fetch(`${API}/api/my-reports/elevation?lat=${lat}&lng=${lng}`).then((r) => r.json()).then((e) => { if (e.elevation != null && !elevManual.current) setD((x) => (x.elevation && x.elevationAuto !== "1" ? x : { ...x, elevation: String(e.elevation), elevationAuto: "1" })); }).catch(() => {});
    setCoordMsg(`Coordinates: ${lat}, ${lng}. Looking up the place…`);
    try {
      const g = await reverseGeocode(lat, lng);
      // fill empty boxes, and replace values an earlier lookup put there (never what the client typed)
      const pick = (f: string, cur: string | undefined, val: string) => { if (!val) return cur ?? ""; if (!cur || autoPlace.current[f] === cur) { autoPlace.current[f] = val; return val; } return cur; };
      setD((x) => ({ ...x, county: pick("county", x.county, g.county), subcounty: pick("subcounty", x.subcounty, g.sub), locationName: pick("locationName", x.locationName, g.ward), village: pick("village", x.village, g.village) }));
      const got = [g.county, g.sub, g.ward, g.village].filter(Boolean);
      setCoordMsg(got.length ? `Coordinates: ${lat}, ${lng}. Place found: ${got.join(" › ")}. Please check it.` : `Coordinates: ${lat}, ${lng}. ${g.ok ? "We could not match the place names." : "Could not look up the place names (check your internet)."} Please type them.`);
    } catch { setCoordMsg(`Coordinates: ${lat}, ${lng}. Could not look up the place names. Please type them.`); }
  };
  const onCoordText = (v: string) => { setCoordText(v); const c = parseCoords(v); window.clearTimeout(coordTimer.current); if (c) { setD((x) => ({ ...x, lat: String(c.lat), lng: String(c.lng) })); coordTimer.current = window.setTimeout(() => void applyCoords(c.lat, c.lng), 700); } else { setCoordMsg(v.trim() ? "Type or paste two numbers, e.g. -3.53073, 38.32219" : ""); setD((x) => ({ ...x, lat: "", lng: "" })); } };
  const readShot = async (file: File) => {
    setReading(true); setErr("");
    try {
      const dr = await ensureDraft(); if (!dr) return;
      const sb = await shrinkImg(file);
      const r = await fetch(`${API}/api/my-reports/${dr.id}/coords?token=${dr.token}`, { method: "POST", headers: { "Content-Type": sb.type || "image/png" }, body: sb });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Could not read that picture.");
      setCoordText(`${j.lat}, ${j.lng}`); if (j.elevation != null) { elevManual.current = !j.auto; setD((x) => ({ ...x, elevation: String(j.elevation), elevationAuto: j.auto ? "1" : "" })); } await applyCoords(j.lat, j.lng);
    } catch (e) { setErr((e as Error).message); } finally { setReading(false); }
  };
  const useMyLocation = async () => {
    setReading(true); setErr("");
    try { const g = await whereAmI(); setCoordText(`${g.lat}, ${g.lng}`); setD((x) => ({ ...x, lat: String(g.lat), lng: String(g.lng), county: x.county || g.county, subcounty: x.subcounty || g.sub, locationName: x.locationName || g.ward, village: x.village || g.village })); setCoordMsg(`Coordinates: ${g.lat}, ${g.lng}`); }
    catch (e) { setErr((e as Error).message); } finally { setReading(false); }
  };
  /** Elevation from the phone's own position: its GPS height when it gives one, otherwise looked up online from the coordinates. */
  const elevFromMyLocation = async () => {
    setReading(true); setErr("");
    try {
      const g = await whereAmI();
      if (!d.lat) { setCoordText(`${g.lat}, ${g.lng}`); setD((x) => ({ ...x, lat: String(g.lat), lng: String(g.lng), county: x.county || g.county, subcounty: x.subcounty || g.sub, locationName: x.locationName || g.ward, village: x.village || g.village })); setCoordMsg(`Coordinates: ${g.lat}, ${g.lng}`); }
      let e: number | null = g.alt;
      if (e == null) { const j = await fetch(`${API}/api/my-reports/elevation?lat=${g.lat}&lng=${g.lng}`).then((r) => r.json()).catch(() => ({})); e = j.elevation ?? null; }
      if (e == null) throw new Error("Could not get the elevation here. Please type it.");
      elevManual.current = false; setD((x) => ({ ...x, elevation: String(e), elevationAuto: "1" }));
    } catch (er) { setErr((er as Error).message); } finally { setReading(false); }
  };
  // no elevation yet but there is a pin: look it up from the coordinates
  useEffect(() => {
    const lat = Number(d.lat), lng = Number(d.lng);
    if (!d.lat || !d.lng || !Number.isFinite(lat) || !Number.isFinite(lng) || (d.elevation ?? "").trim() || elevManual.current) return;
    const t = window.setTimeout(() => { fetch(`${API}/api/my-reports/elevation?lat=${lat}&lng=${lng}`).then((r) => r.json()).then((e) => { if (e.elevation != null && !elevManual.current) setD((x) => (x.elevation ? x : { ...x, elevation: String(e.elevation), elevationAuto: "1" })); }).catch(() => {}); }, 800);
    return () => window.clearTimeout(t);
  }, [d.lat, d.lng, d.elevation]);
  const set = (k: string, v: string) => setD((x) => ({ ...x, [k]: v }));
  const ORD = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"];

  const ensureDraft = (): Promise<Draft | null> => {
    if (draft) return Promise.resolve(draft);
    making.current ??= (async () => {
      for (let t = 0; t < 4; t++) {
        try {
          const r = await fetch(`${API}/api/my-reports/draft`, { method: "POST" });
          const j = await r.json().catch(() => ({}));
          if (r.ok) { const v = { id: j.id, token: j.token }; setDraft(v); return v; }
          if (r.status === 429 || r.status === 503) { setErr(j.error || "Busy right now. Please try again."); break; }
        } catch { /* the server may be waking up: try again */ }
        await new Promise((res) => setTimeout(res, 2500 * (t + 1)));
      }
      making.current = null; setErr((e) => e || "Could not reach the server. Check your internet and try again."); return null;
    })();
    return making.current;
  };
  // big phone photos (and HEIC, jpg-as-"image/jpg" etc.) are shrunk to a normal JPEG before sending
  const shrinkImg = async (file: File): Promise<Blob> => {
    const okType = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
    if (okType && file.size < 3_000_000) return file;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.9));
      if (b) return b;
    } catch { /* send the original */ }
    return file;
  };
  // live upload progress (0-100%) for each picture; uploads run in the background so the form stays usable
  const [ups, setUps] = useState<{ k: number; name: string; pct: number }[]>([]);
  const [big, setBig] = useState<Record<number, string>>({});
  const [look, setLook] = useState<string | null>(null);
  const sendFile = (url: string, body: Blob, onPct: (n: number) => void) => new Promise<{ ok: boolean; status: number; j: any }>((res, rej) => {
    const x = new XMLHttpRequest(); x.open("POST", url); x.setRequestHeader("Content-Type", body.type || "image/png");
    x.upload.onprogress = (e) => { if (e.lengthComputable) onPct(Math.min(99, Math.round((e.loaded / e.total) * 100))); };
    x.onload = () => { let j: any = {}; try { j = JSON.parse(x.responseText); } catch { /* not json */ } res({ ok: x.status >= 200 && x.status < 300, status: x.status, j }); };
    x.onerror = () => rej(new Error("network")); x.send(body);
  });
  const up = async (file: File, kind: string, name = "") => {
    setErr("");
    const k = Date.now() + Math.random();
    const bump = (pct: number) => setUps((u) => u.map((x) => (x.k === k ? { ...x, pct } : x)));
    setUps((u) => [...u, { k, name: name || file.name || "Picture", pct: 0 }]);
    try {
      const dr = await ensureDraft(); if (!dr) return null;
      const body = await shrinkImg(file);
      const url = `${API}/api/my-reports/${dr.id}/files?token=${dr.token}&kind=${kind}&name=${encodeURIComponent(name)}`;
      const r = await sendFile(url, body, bump).catch(async () => { await new Promise((res) => setTimeout(res, 2500)); return sendFile(url, body, bump); });
      if (!r.ok) { setErr(r.j.error || (r.status === 413 ? "That picture is too large." : "Upload failed. Please try again.")); return null; }
      bump(100);
      const tn = await tinyThumb(file); setThumbs((t) => ({ ...t, [r.j.id]: tn }));
      try { const u = URL.createObjectURL(body); setBig((b) => ({ ...b, [r.j.id]: u })); } catch { /* preview falls back to the small picture */ }
      return r.j.id as number;
    } catch { setErr("Upload failed. Check your internet and try again."); return null; }
    finally { window.setTimeout(() => setUps((u) => u.filter((x) => x.k !== k)), 900); }
  };

  const dropFile = (id: number) => { if (draft) fetch(`${API}/api/my-reports/${draft.id}/files/${id}?token=${draft.token}`, { method: "DELETE" }).catch(() => {}); };
  const dropDoc = (k: string) => {
    setDocs((x) => { const n = { ...x }; delete n[k]; return n; });
    if (saved[k] && auth) { fetch(`${API}/api/my-docs/${k}?${q(auth)}`, { method: "DELETE" }).catch(() => {}); setSaved((x) => { const n = { ...x }; delete n[k]; return n; }); }
  };
  const missing = (): string => {
    for (const [k, l] of [["clientName", "client name"], ["county", "county"], ["subcounty", "sub-county"], ["lat", "coordinates"], ["surveyDate", "survey date"]] as const) if (!(d[k] ?? "").trim()) return `Please fill in the ${l}.`;
    if (!picks.length) return "Add at least one section picture.";
    if (picks.some((p) => !p.station.trim())) return "Type the point number for each picture.";
    if (!picks.some((p) => p.recommended)) return "Tick the recommended point.";
    return "";
  };
  const [noAccess, setNoAccess] = useState<{ whatsapp: string; url: string } | null>(null);
  const send = async (a: { phone: string; key: string }): Promise<string | null> => {
    const dr = await ensureDraft(); if (!dr) return "Could not start.";
    for (const [k, data] of Object.entries(docs)) { try { await fetch(`${API}/api/my-docs/${k}?${q(a)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) }); } catch { /* optional */ } }
    const attachDocs = DOCS.map(([k]) => k).filter((k) => (docs[k] || saved[k]) && !skip[k]).join(",");
    const r = await fetch(`${API}/api/my-reports/${dr.id}/submit?${q(a)}`, { method: "POST", headers: { "Content-Type": "application/json", ...(memberToken() ? { Authorization: `Bearer ${memberToken()}` } : {}) }, body: JSON.stringify({ token: dr.token, data: { ...d, picks, attachDocs } }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && j.error === "signin") return "signin";
    if (r.status === 403 && j.error === "access") { setNoAccess({ whatsapp: String(j.whatsapp ?? ""), url: String(j.url ?? "") }); return "noaccess"; }
    if (r.status === 402) { setNeedBoost(j.error === "boost"); return j.error === "boost" ? null : "Please pay to submit."; }
    if (!r.ok) return j.error || "Could not submit.";
    if (!free && hasCredit) { try { await fetch(`${API}/api/my-reports/${dr.id}/unlock?${q(a)}`, { method: "POST" }); } catch { /* the client can unlock from the list */ } }
    onAuth(a); setLiveId(dr.id); setSent(true); onDone(); return null;
  };
  /** Pay AFTER the report: sign in, then the report is written as a watermarked preview. The client pays later to unlock the Word file. */
  const startPreview = async () => {
    if (!memberToken()) { setShowGate(true); setTimeout(() => payRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80); return; }
    setShowGate(false); setBusy(true);
    try {
      const r = await fetch(`${API}/api/my-reports/start`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${memberToken()}` }, body: JSON.stringify({ phone: auth?.phone ?? d.clientPhone ?? "", key: auth?.key ?? "" }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { setMemberToken(""); setShowGate(true); setBusy(false); return; }
      if (!r.ok) { setErr(j.error || "Could not start."); setBusy(false); return; }
      const a = { phone: j.phone as string, key: j.key as string }; onAuth(a);
      const bad = await send(a); if (bad === "signin") { setMemberToken(""); setShowGate(true); } else if (bad && bad !== "noaccess") setErr(bad);
    } catch { setErr("Could not start. Check your connection."); }
    setBusy(false);
  };
  /** "Make my report": check the form, then (free mode) start straight away, or sign in and write the watermarked preview. */
  const makeReport = async () => {
    const m = missing(); if (m) { setErr(m); return; }
    setErr("");
    if (free) {
      setBusy(true);
      try {
        const phone = auth?.phone ?? d.clientPhone ?? "";
        const r = await fetch(`${API}/api/my-reports/test-access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, key: auth?.key ?? "" }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setErr(j.error || "Could not start."); setBusy(false); return; }
        const a = { phone: j.phone as string, key: j.key as string }; onAuth(a);
        const bad = await send(a); if (bad && bad !== "noaccess") setErr(bad);
      } catch { setErr("Could not start. Check your connection."); }
      setBusy(false); return;
    }
    await startPreview();
  };
  const T = (k: string, l: string, ph = "") => (<div><label className={lab}>{l}</label><input className={inp} value={d[k] ?? ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} /></div>);
  const hasCredit = !!auth && (!!w?.can || !!w?.canBoost);

  if (sent) return (
    <div className="space-y-4">
    {liveId && auth && !w?.reports.some((r) => r.id === liveId && r.status === "working") && <LiveReport id={liveId} auth={auth} />}
    <div className={`${card} space-y-2 text-center`}>
      <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
      <h2 className="text-lg font-bold text-foreground">Your report is being written</h2>
      <p className="text-sm text-muted-foreground">It usually takes a few minutes. Keep this page open. Your watermarked PDF preview will appear here, and you pay only when you are happy with it.</p>
    </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {look && (
        <div className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/85 p-4" onClick={() => setLook(null)} role="dialog" aria-label="Picture preview">
          <button className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold text-white" onClick={() => setLook(null)}>Close ✕</button>
          <img src={look} alt="Preview" className="max-h-[92vh] max-w-[96vw] rounded-lg bg-white object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
      {ups.length > 0 && (
        <div className="fixed bottom-4 left-4 z-[90] w-64 space-y-2 rounded-xl border border-border bg-card p-3 shadow-xl">
          {ups.map((u) => (
            <div key={u.k}>
              <div className="flex justify-between text-xs font-semibold text-foreground"><span className="truncate pr-2">{u.name}</span><span>{u.pct >= 100 ? "Done" : `${u.pct}%`}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${u.pct}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      <div className={`${card} space-y-3`}>
        <h2 className="text-sm font-bold text-foreground">1. Client and site</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <GoogleFill onFill={(g) => setD((x) => { const n = { ...x }; const put = (k: string, v: string) => { if (v && !String(n[k] ?? "").trim()) n[k] = v; }; put("clientName", g.name); put("clientEmail", g.email); for (const [k, v] of Object.entries(g.data)) put(k, v); return n; })} />
          {T("clientName", "Client name")}<div><label className={lab}>Client phone</label><PhoneField value={d.clientPhone ?? ""} onChange={(v) => set("clientPhone", v)} className={inp} /></div><div><label className={lab}>Site reference</label><input className={inp} list="site-refs" value={d.siteRef ?? ""} placeholder="Choose from the list or type" onChange={(e) => set("siteRef", e.target.value)} /><datalist id="site-refs">{[d.village, d.locationName, d.subcounty, d.county].filter(Boolean).map((n) => <option key={n} value={n} />)}</datalist></div>
          <div><label className={lab}>Purpose</label><select className={inp} value={PURPOSES.includes(d.purpose ?? "") || !d.purpose ? (d.purpose ?? "") : "__other"} onChange={(e) => set("purpose", e.target.value === "__other" ? " " : e.target.value)}><option value="" disabled>Choose the purpose</option>{PURPOSES.map((x) => <option key={x}>{x}</option>)}<option value="__other">Other (type it)</option></select>{d.purpose && !PURPOSES.includes(d.purpose) && <input className={`${inp} mt-1.5`} value={d.purpose.trim() === "" ? "" : d.purpose} placeholder="Type the purpose" onChange={(e) => set("purpose", e.target.value || " ")} />}</div>
          <div><label className={lab}>Elevation in metres</label><input className={inp} value={d.elevation ?? ""} placeholder="Filled in from the coordinates" onChange={(e) => { elevManual.current = true; setD((x) => ({ ...x, elevation: e.target.value, elevationAuto: "" })); }} />{d.elevationAuto === "1" && <p className="mt-1 text-[11px] text-muted-foreground">Found online from the coordinates (approximate). You can change it.</p>}<div className="mt-1.5 flex flex-wrap gap-2"><button type="button" onClick={elevFromMyLocation} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-foreground"><LocateFixed className="h-3.5 w-3.5" /> Use my location</button><label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-[11px] font-bold text-primary"><ScanLine className="h-3.5 w-3.5" /> Upload a screenshot<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void readShot(f); }} /></label></div></div>{T("surveyDate", "Date of survey", "e.g. 30 October 2026")}
          {T("collectedBy", "Surveyor / company")}
          <div className="sm:col-span-2"><label className={lab}>Date of survey</label><DateSelect value={d.surveyDate ?? ""} onChange={(v) => set("surveyDate", v)} cls={inp} /></div>
          <div><label className={lab}>Instrument</label><select className={inp} value={d.instrument} onChange={(e) => set("instrument", e.target.value)}>{INSTR.map((x) => <option key={x}>{x}</option>)}</select></div>
        </div>
        <div className="space-y-2 rounded-xl border border-border p-3">
          <label className={lab}>Coordinates of the site</label>
          <input className={inp} value={coordText} onChange={(e) => onCoordText(e.target.value)} onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t) { e.preventDefault(); onCoordText(t); } }} placeholder="Type or paste, e.g. -3.53073, 38.32219" inputMode="text" autoComplete="off" />
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-bold text-primary"><ScanLine className="h-4 w-4" /> Upload a screenshot of the coordinates<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void readShot(f); }} /></label>
            <button type="button" onClick={useMyLocation} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground"><LocateFixed className="h-4 w-4" /> Use my location</button>
            <button type="button" onClick={() => setMapOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground"><MapPin className="h-4 w-4" /> Pick on the map</button>
          </div>
          {mapOpen && <MapBoundary onClose={() => setMapOpen(false)}><Suspense fallback={null}><MapPicker satellite initial={d.lat && d.lng && Number.isFinite(Number(d.lat)) ? { lat: Number(d.lat), lng: Number(d.lng) } : null} query={[d.village, d.locationName, d.subcounty, d.county].filter(Boolean).join(", ")} onClose={() => setMapOpen(false)} onConfirm={(la, ln) => { setMapOpen(false); elevManual.current = false; setCoordText(`${la}, ${ln}`); void applyCoords(la, ln); }} /></Suspense></MapBoundary>}
          {reading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…</p>}
          {coordMsg && !reading && <p className={`text-xs ${d.lat ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>{coordMsg}</p>}
          <p className="text-[11px] text-muted-foreground">County, sub-county, ward and village fill in from the coordinates. You can change them.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={lab}>County</label><PlaceInput className={inp} placeholder="e.g. Taita-Taveta" value={d.county ?? ""} onChange={(v) => set("county", v)} suggest={countySuggestions} /></div>
          <div><label className={lab}>Sub-county</label><PlaceInput className={inp} placeholder="e.g. Mwatate" value={d.subcounty ?? ""} onChange={(v) => set("subcounty", v)} suggest={(x) => subCountySuggestions(x, d.county ?? "")} maxLength={50} onPick={(sg) => { if (sg.county) set("county", sg.county); }} /></div>
          <div><label className={lab}>Ward / location</label><PlaceInput className={inp} placeholder="e.g. Bura" value={d.locationName ?? ""} onChange={(v) => set("locationName", v)} suggest={(x) => wardSuggestions(x, d.county ?? "", d.subcounty ?? "")} maxLength={50} onPick={(sg) => { if (sg.county) set("county", sg.county); if (sg.sub) set("subcounty", sg.sub); }} /></div>
          <div><label className={lab}>Village / area</label><PlaceInput className={inp} placeholder="Optional" value={d.village ?? ""} onChange={(v) => set("village", v)} suggest={(x) => villageSuggestions(x, d.county ?? "")} maxLength={60} /></div>
        </div>
      </div>

      <div className={`${card} space-y-3`}>
        <h2 className="text-sm font-bold text-foreground">2. Section pictures from the machine</h2>
        <p className="text-xs text-muted-foreground">Upload the screenshot for each point. Type the point number shown on the horizontal axis, give the expected yield, and tick the recommended point. Our system reads the water zone from the picture.</p>
        {picks.map((p, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-border p-3">
            {thumbs[p.fileId] ? <img src={thumbs[p.fileId]} alt="Click to enlarge" title="Click to enlarge" onClick={() => setLook(big[p.fileId] || thumbs[p.fileId]!)} className="h-28 w-20 cursor-zoom-in rounded-lg border border-border object-contain" /> : <div className="flex h-28 w-20 items-center justify-center rounded-lg bg-muted"><ImageIcon className="h-5 w-5" /></div>}
            <div className="grid flex-1 grid-cols-2 gap-2">
              <div><label className={lab}>Point no.</label><input className={inp} value={p.station} onChange={(e) => setPicks(picks.map((x, j) => (j === i ? { ...x, station: e.target.value } : x)))} /></div>
              <div><label className={lab}>Yield (m³/hour)</label><input className={inp} value={p.yieldText} placeholder="3 – 6" onChange={(e) => setPicks(picks.map((x, j) => (j === i ? { ...x, yieldText: e.target.value } : x)))} /></div>
              <div className="col-span-2"><RecommendToggle value={p.recommended} onChange={(v) => setPicks(picks.map((x, j) => ({ ...x, recommended: j === i ? v : v ? false : x.recommended })))} /></div>
              <div className="col-span-2"><label className={lab}>{p.recommended ? "Why this point" : "Why not recommended"}: tick all that apply</label><ReasonPicker key={p.recommended ? "y" : "n"} value={p.reason} onChange={(v) => setPicks(picks.map((x, j) => (j === i ? { ...x, reason: v } : x)))} inp={inp} options={p.recommended ? POINT_YES : POINT_NO} /></div>
              <button onClick={() => { dropFile(p.fileId); setPicks(picks.filter((_, j) => j !== i)); }} className="col-span-2 flex items-center gap-1 text-xs font-semibold text-red-600"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
            </div>
          </div>
        ))}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5 text-xs font-bold text-primary"><Upload className="h-4 w-4" /> Add a section picture<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const id = await up(f, "section"); if (id) setPicks((x) => [...x, { fileId: id, station: "", recommended: x.length === 0, yieldText: "", reason: "", zoneFrom: 0, zoneTo: 0 }]); }} /></label>
      </div>

      <div className={`${card} space-y-3`}>
        <h2 className="text-sm font-bold text-foreground">3. Borehole depths</h2>
        <div className="grid gap-3 sm:grid-cols-3">{T("minDepth", "Minimum depth (m)", "180")}{T("maxDepth", "Maximum depth (m)", "220")}{T("preferredDepth", "Preferred depth (m)", "220")}</div>
        <div><label className={lab}>Why that depth is preferred (optional): tick all that apply</label><ReasonPicker value={d.preferredReason ?? ""} onChange={(v) => set("preferredReason", v)} inp={inp} /></div>
      </div>

      <div className={`${card} space-y-3`}>
        <h2 className="text-sm font-bold text-foreground">4. Your documents (optional)</h2>
        <p className="text-xs text-muted-foreground">ID (front and back), KRA PIN and land ownership. You can skip this, or add them later. They are saved for you, so you don't upload them again for your next report or permit. Ticked ones are added to the report appendix.</p>
        <div className="grid gap-3 sm:grid-cols-2">{DOCS.map(([k, label]) => {
          const img = docs[k] || saved[k];
          return (
            <div key={k} className="rounded-xl border border-border p-3">
              <div className="mb-2 text-xs font-semibold text-foreground">{label}{img && <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">{docs[k] ? "Will be saved" : "Saved"}</span>}</div>
              {img && <img src={img} alt="Click to enlarge" title="Click to enlarge" onClick={() => setLook(img)} className="mb-2 h-24 w-full cursor-zoom-in rounded-lg border border-border object-contain" />}
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-bold text-foreground"><Upload className="h-3.5 w-3.5" /> {img ? "Replace" : "Add photo or scan"}<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { setDocs((x) => ({ ...x, [k]: "" })); const u = await shrink(f); setDocs((x) => ({ ...x, [k]: u })); } catch (er) { setDocs((x) => { const n = { ...x }; delete n[k]; return n; }); setErr((er as Error).message); } }} /></label>
                {img && <button onClick={() => dropDoc(k)} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><Trash2 className="h-3.5 w-3.5" /> Remove</button>}
                {img && <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={!skip[k]} onChange={(e) => setSkip((x) => ({ ...x, [k]: !e.target.checked }))} /> Put in the report appendix</label>}
              </div>
            </div>
          );
        })}</div>
      </div>

      <div className={`${card} space-y-3`}>
        <h2 className="text-sm font-bold text-foreground">5. Area pictures (optional)</h2>
        <p className="text-xs text-muted-foreground">Pictures of the site or other places where data were taken. They are named First Location, Second Location, and so on.</p>
        <div className="flex flex-wrap gap-3">{extras.map((x) => <div key={x.id} className="text-center"><img src={thumbs[x.id]} alt="Click to enlarge" title="Click to enlarge" onClick={() => setLook(big[x.id] || thumbs[x.id]!)} className="h-20 cursor-zoom-in rounded-lg border border-border object-contain" /><div className="text-xs font-semibold text-foreground">{x.name}</div><button onClick={() => { dropFile(x.id); setExtras(extras.filter((e) => e.id !== x.id)); }} className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-red-600"><Trash2 className="h-3 w-3" /> Remove</button></div>)}</div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-xs font-bold text-foreground"><Upload className="h-4 w-4" /> Add a picture<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={extras.length >= 6} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const nm = `${ORD[extras.length]} Location`; const id = await up(f, "location", nm); if (id) setExtras((x) => [...x, { id, name: nm }]); }} /></label>
      </div>

      {err && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{err}</p>}
      {noAccess ? (
        <div className="space-y-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-foreground">
          <p className="font-bold">Report writing is by approval</p>
          <p>Your form is filled in and saved. To have your report generated, please contact us on WhatsApp{noAccess.whatsapp ? <> (<b>{noAccess.whatsapp}</b>)</> : ""}. We will activate your account, then you come back and press “Make my report”.</p>
          {noAccess.url && <a href={noAccess.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">Chat on WhatsApp</a>}
          <button type="button" onClick={() => setNoAccess(null)} className="ml-2 rounded-xl border border-border px-3 py-2 text-xs font-bold">Try again</button>
        </div>
      ) : showGate ? (
        <div ref={payRef}><MemberGate initial={{ name: d.clientName ?? "", email: d.clientEmail ?? "", phone: d.clientPhone ?? "" }} done={() => void startPreview()} /></div>
      ) : needBoost && free ? (
        <div ref={payRef}><PayBox plans={plans} boostOnly={needBoost} disabled={false} ready={send} initial={{ name: d.clientName ?? "", phone: d.clientPhone ?? "", email: d.clientEmail ?? "" }} note={needBoost ? "You have used the reports in your plan. A booster pack lets you continue until your month ends." : ""} /></div>
      ) : (
        <button disabled={busy} onClick={makeReport} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Make my report</button>
      )}
      <p className="flex items-start gap-1.5 rounded-xl border border-border bg-card p-3 text-xs text-foreground"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> After you submit, the report is written in a few minutes and you download it here. We will also SMS you when it is ready.</p>
    </div>
  );
}
