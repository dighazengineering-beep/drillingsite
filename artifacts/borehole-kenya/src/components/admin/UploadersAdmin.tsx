import { useEffect, useState } from "react";
import { Trash2, UserPlus, CheckCircle2, Clock } from "lucide-react";
import { API } from "@/pages/Feed";

interface Poster { email: string; approved: boolean; name: string | null; signedUp: boolean; google: boolean }

/**
 * People who may post videos, besides you. Add an email here. When that person signs up on the website with the same email
 * they can post (and delete their own) videos. Signing in with Google proves the email is theirs. If they signed up with a
 * password instead, the email is not proven yet, so you press Approve once you know it really is them.
 */
export default function UploadersAdmin({ adminKey, onBadAdmin }: { adminKey: string; onBadAdmin: () => void }) {
  const [list, setList] = useState<Poster[] | null>(null);
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const h = { "Content-Type": "application/json", "x-admin-key": adminKey };

  const load = () =>
    fetch(`${API}/api/feed-videos-admin/uploaders`, { headers: h })
      .then((r) => { if (r.status === 403) { onBadAdmin(); throw new Error("403"); } return r.json(); })
      .then((d) => setList(Array.isArray(d) ? d : []))
      .catch(() => setList((l) => l ?? []));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true); setErr("");
    const r = await fetch(`${API}/api/feed-videos-admin/uploaders`, { method: "POST", headers: h, body: JSON.stringify({ email }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setErr(d.error ?? "Could not add"); else { setEmail(""); load(); }
    setBusy(false);
  };
  const approve = async (p: Poster, approved: boolean) => {
    await fetch(`${API}/api/feed-videos-admin/uploaders/approve`, { method: "POST", headers: h, body: JSON.stringify({ email: p.email, approved }) });
    load();
  };
  const remove = async (p: Poster) => {
    if (!window.confirm(`Stop ${p.email} from posting videos?`)) return;
    await fetch(`${API}/api/feed-videos-admin/uploaders?email=${encodeURIComponent(p.email)}`, { method: "DELETE", headers: h });
    load();
  };

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="flex gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email of the person who may post videos" data-testid="input-poster-email"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        <button disabled={busy || !email.trim()} className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <UserPlus className="h-4 w-4" /> Add
        </button>
      </form>
      {err && <p className="text-xs text-red-600">{err}</p>}

      {list === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {list?.length === 0 && <p className="text-sm text-muted-foreground">Nobody yet. Add an email above.</p>}
      <div className="divide-y divide-border">
        {list?.map((p) => {
          const active = p.signedUp && (p.google || p.approved);
          return (
            <div key={p.email} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{p.name ? `${p.name} · ` : ""}{p.email}</p>
                <p className={`flex items-center gap-1 text-xs ${active ? "text-green-700" : "text-muted-foreground"}`}>
                  {active ? <><CheckCircle2 className="h-3.5 w-3.5" /> Can post videos{p.google ? " (email confirmed by Google)" : " (approved by you)"}</>
                    : !p.signedUp ? <><Clock className="h-3.5 w-3.5" /> Has not signed up yet</>
                    : <><Clock className="h-3.5 w-3.5" /> Signed up with a password, email not confirmed yet</>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {p.signedUp && !p.google && (
                  <button onClick={() => approve(p, !p.approved)} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">
                    {p.approved ? "Withdraw" : "Approve"}
                  </button>
                )}
                <button onClick={() => remove(p)} aria-label="Remove" className="rounded-md p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Posters can add videos and delete their own. They cannot see this page, delete other people’s videos or change prices.
      </p>
    </div>
  );
}
