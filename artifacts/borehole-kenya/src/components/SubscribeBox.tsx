import { useState } from "react";
import { Mail, Check, Loader2 } from "lucide-react";
import { API } from "@/lib/member";

// "Get our offers by email": saves the address (server sends a welcome email; every email carries an unsubscribe link).
export default function SubscribeBox() {
  const [email, setEmail] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [err, setErr] = useState("");
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setErr("Enter a valid email address.");
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/subscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || "Could not sign you up.");
      setDone(true);
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  };
  return (
    <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-3" data-testid="subscribe-box">
      <p className="flex items-center gap-1.5 text-sm font-bold text-white"><Mail className="h-4 w-4 text-sky-300" /> Get our offers by email</p>
      {done ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-300"><Check className="h-4 w-4" /> Thank you! Check your inbox for a welcome email.</p>
      ) : (
        <form onSubmit={go} className="mt-2 flex gap-2">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" aria-label="Your email" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-sky-300" data-testid="input-subscribe" />
          <button disabled={busy} className="flex shrink-0 items-center gap-1 rounded-xl bg-sky-400 px-3.5 py-2 text-sm font-bold text-slate-900 transition active:scale-95 disabled:opacity-60" data-testid="button-subscribe">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join"}</button>
        </form>
      )}
      {err && <p className="mt-1.5 text-xs text-red-300">{err}</p>}
      <p className="mt-1.5 text-[10px] text-white/45">One email a week at most. Unsubscribe any time.</p>
    </div>
  );
}
