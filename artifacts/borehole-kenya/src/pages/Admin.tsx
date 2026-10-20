import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ShieldCheck, LogOut, Plus, Trash2, Video, MessageCircle, ExternalLink, Package, Wrench, Users, UserCheck } from "lucide-react";
import CatalogEditor from "@/components/admin/CatalogEditor";
import ReferralsAdmin from "@/components/admin/ReferralsAdmin";
import UploadersAdmin from "@/components/admin/UploadersAdmin";
import { API, api, store, UploadSheet, type FeedVideo } from "@/pages/Feed";
import { claimAdmin } from "@/lib/member";

interface UpVideo { id: number; title: string; location?: string; source?: string; url: string; createdAt?: string }
interface AdminComment { id: number; videoId: string; name: string; body: string; createdAt: string }

const card = "rounded-2xl bg-card/95 p-4 shadow-xl sm:p-5";

export default function Admin() {
  const [key, setKey] = useState(() => store.get("kws_admin"));
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videos, setVideos] = useState<UpVideo[] | null>(null);
  const [comments, setComments] = useState<AdminComment[] | null>(null);
  const [tab, setTab] = useState<"products" | "services" | "videos" | "comments" | "referrals" | "posters">("products");
  const [titles, setTitles] = useState<Record<string, string>>({});

  const logout = () => { store.set("kws_admin", ""); setKey(""); };

  const load = (k: string) => {
    fetch(`${API}/api/feed-videos`).then((r) => r.json()).then((d) => {
      const list: UpVideo[] = Array.isArray(d) ? d : [];
      setVideos(list);
      setTitles((t) => ({ ...t, ...Object.fromEntries(list.map((v) => [`db-${v.id}`, v.title])) }));
    }).catch(() => setVideos([]));
    fetch(`${API}/api/video-comments-admin/recent`, { headers: { "x-admin-key": k } })
      .then((r) => { if (r.status === 403) { logout(); return []; } return r.json(); })
      .then((d) => setComments(Array.isArray(d) ? d : []))
      .catch(() => setComments([]));
  };

  useEffect(() => { if (!key) claimAdmin().then((k) => { if (k) setKey(k); }); }, []);
  useEffect(() => { if (key) load(key); }, [key]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true); setErr("");
    try {
      const r = await fetch(api("/admin-check"), { method: "POST", headers: { "x-admin-key": pw } });
      const d = await r.json();
      if (d.admin) { store.set("kws_admin", pw); setKey(pw); setPw(""); }
      else setErr("Wrong password, or ADMIN_KEY is not set on the server yet.");
    } catch { setErr("Could not reach the server. Try again in a moment."); }
    setChecking(false);
  };

  const delVideo = async (v: UpVideo) => {
    if (!window.confirm(`Delete "${v.title}"?`)) return;
    const r = await fetch(`${API}/api/feed-videos/${v.id}`, { method: "DELETE", headers: { "x-admin-key": key } });
    if (r.ok) setVideos((l) => (l ?? []).filter((x) => x.id !== v.id));
  };
  const delComment = async (c: AdminComment) => {
    if (!window.confirm("Delete this comment?")) return;
    const r = await fetch(api(`/${c.id}`), { method: "DELETE", headers: { "x-admin-key": key } });
    if (r.ok) setComments((l) => (l ?? []).filter((x) => x.id !== c.id));
  };

  const bg = { background: "linear-gradient(135deg, hsl(160 52% 10%) 0%, hsl(158 54% 16%) 50%, hsl(155 56% 24%) 100%)" };

  if (!key) {
    return (
      <div className="grid min-h-[calc(100dvh-4rem)] place-items-center px-4 pt-20 pb-10" style={bg}>
        <form onSubmit={login} className={`${card} w-full max-w-sm space-y-3`}>
          <h1 className="flex items-center gap-2 text-lg font-bold text-foreground"><ShieldCheck className="h-5 w-5 text-primary" /> Admin sign in</h1>
          <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Admin password"
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button disabled={!pw || checking} className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {checking ? "Checking…" : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] px-4 pt-20 pb-10" style={bg}>
      <div className="mx-auto max-w-4xl space-y-4">
        <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
          <h1 className="flex items-center gap-2 text-lg font-bold text-foreground"><ShieldCheck className="h-5 w-5 text-primary" /> Admin</h1>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setUploading(true)} className="flex items-center gap-1.5 rounded-md bg-sky-400 px-3.5 py-2 text-sm font-bold text-slate-900"><Plus className="h-4 w-4" /> Upload video</button>
            <Link href="/feed" className="flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-sm font-semibold"><ExternalLink className="h-4 w-4" /> Project Videos</Link>
            <button onClick={logout} className="flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-sm font-semibold"><LogOut className="h-4 w-4" /> Log out</button>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-1 rounded-2xl bg-card/95 p-1.5 shadow-xl">
          {([["products", Package, "Products"], ["services", Wrench, "Services"], ["videos", Video, "Videos"], ["comments", MessageCircle, "Comments"], ["referrals", Users, "Referrals"], ["posters", UserCheck, "Posters"]] as const).map(([k, Icon, name]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-semibold sm:flex-row sm:justify-center sm:gap-1.5 sm:text-sm ${tab === k ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}>
              <Icon className="h-4 w-4" /> {name}
            </button>
          ))}
        </div>

        {(tab === "products" || tab === "services") && (
          <section className={card}>
            <h2 className="mb-3 font-bold text-foreground">{tab === "products" ? "Products and prices" : "Services and prices"}</h2>
            <CatalogEditor key={tab} kind={tab} adminKey={key} onBadAdmin={logout} />
          </section>
        )}
        {tab === "posters" && (
          <section className={card}>
            <h2 className="mb-3 flex items-center gap-2 font-bold text-foreground"><UserCheck className="h-4 w-4 text-primary" /> People who can post videos</h2>
            <UploadersAdmin adminKey={key} onBadAdmin={logout} />
          </section>
        )}
        {tab === "referrals" && (
          <section className={card}>
            <h2 className="mb-3 font-bold text-foreground">Member referrals and commission</h2>
            <ReferralsAdmin adminKey={key} onBadAdmin={logout} />
          </section>
        )}
        {tab === "videos" && (
        <section className={card}>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-foreground"><Video className="h-4 w-4 text-primary" /> Videos you uploaded {videos ? `(${videos.length})` : ""}</h2>
          {videos === null && <p className="text-sm text-muted-foreground">Loading…</p>}
          {videos?.length === 0 && <p className="text-sm text-muted-foreground">None yet. Tap “Upload video” to post one.</p>}
          <div className="divide-y divide-border">
            {videos?.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{titles[`db-${v.id}`] ?? v.title}</p>
                  <p className="text-xs text-muted-foreground">{v.source === "github" ? "Stored on GitHub" : "Stored on Cloudinary"}{v.createdAt ? ` · ${new Date(v.createdAt + "Z").toLocaleDateString()}` : ""}</p>
                </div>
                <button onClick={() => delVideo(v)} aria-label="Delete video" className="shrink-0 rounded-md p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">The first videos that came with the site are part of the code, so they are not listed here.</p>
        </section>

        )}
        {tab === "comments" && (
        <section className={card}>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-foreground"><MessageCircle className="h-4 w-4 text-primary" /> Latest comments {comments ? `(${comments.length})` : ""}</h2>
          {comments === null && <p className="text-sm text-muted-foreground">Loading…</p>}
          {comments?.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
          <div className="divide-y divide-border">
            {comments?.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{c.name}</span> on {titles[c.videoId] ?? c.videoId.replace(/\.(mp4|webm)$/i, "").replace(/-/g, " ")}</p>
                  <p className="break-words text-sm text-foreground/90">{c.body}</p>
                </div>
                <button onClick={() => delComment(c)} aria-label="Delete comment" className="shrink-0 rounded-md p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </section>
        )}
      </div>

      {uploading && (
        <UploadSheet
          adminKey={key}
          onClose={() => setUploading(false)}
          onBadAdmin={() => { logout(); setUploading(false); }}
          onDone={(_: FeedVideo) => { setUploading(false); load(key); }}
        />
      )}
    </div>
  );
}
