import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ShieldCheck, LogOut, Plus, Trash2, Video, MessageCircle, ExternalLink, Package, Wrench, Users, UserCheck, Wallet, LayoutDashboard, FolderOpen, Inbox, Coins, UserCog, type LucideIcon } from "lucide-react";
import CatalogEditor from "@/components/admin/CatalogEditor";
import ReferralsAdmin from "@/components/admin/ReferralsAdmin";
import Overview from "@/components/admin/Overview";
import AccountsAdmin from "@/components/admin/AccountsAdmin";
import EnquiriesAdmin from "@/components/admin/EnquiriesAdmin";
import PaymentsAdmin from "@/components/admin/PaymentsAdmin";
import UploadersAdmin from "@/components/admin/UploadersAdmin";
import { API, api, store, UploadSheet, type FeedVideo } from "@/pages/Feed";
import { VIDEO_CATS, catOf } from "@/lib/videoCats";
import { claimAdmin } from "@/lib/member";

interface UpVideo { id: number; title: string; location?: string; source?: string; url: string; category?: string; createdAt?: string }
interface AdminComment { id: number; videoId: string; name: string; body: string; createdAt: string }

const card = "rounded-2xl bg-card/95 p-4 shadow-xl backdrop-blur sm:p-5";

type Tab = "overview" | "payments" | "products" | "services" | "projects" | "videos" | "comments" | "accounts" | "enquiries" | "referrals" | "posters";
const GROUPS: { title: string; items: { k: Tab; name: string; Icon: LucideIcon; note: string }[] }[] = [
  { title: "Home", items: [{ k: "overview", name: "Overview", Icon: LayoutDashboard, note: "Your business at a glance" }] },
  { title: "Money", items: [{ k: "payments", name: "Payments", Icon: Wallet, note: "M-Pesa and bank payments, balances" }] },
  { title: "Catalogue", items: [
    { k: "products", name: "Products", Icon: Package, note: "Add, edit, price, photo or delete" },
    { k: "services", name: "Services", Icon: Wrench, note: "Edit services, prices and descriptions" },
    { k: "projects", name: "Projects", Icon: FolderOpen, note: "Completed work shown on the site" },
  ] },
  { title: "People", items: [
    { k: "accounts", name: "Accounts", Icon: Users, note: "See, suspend or delete accounts" },
    { k: "enquiries", name: "Enquiries", Icon: Inbox, note: "Messages from the contact form" },
    { k: "referrals", name: "Referrals", Icon: Coins, note: "Member referrals and commission" },
    { k: "posters", name: "Posters", Icon: UserCog, note: "Who can post videos" },
  ] },
  { title: "Videos", items: [
    { k: "videos", name: "Videos", Icon: Video, note: "Videos you uploaded" },
    { k: "comments", name: "Comments", Icon: MessageCircle, note: "Latest comments, delete any" },
  ] },
];

export default function Admin() {
  const [key, setKey] = useState(() => store.get("kws_admin"));
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videos, setVideos] = useState<UpVideo[] | null>(null);
  const [comments, setComments] = useState<AdminComment[] | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [vcat, setVcat] = useState<string>("all");
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
  const setVideoCat = async (v: UpVideo, category: string) => {
    const r = await fetch(`${API}/api/feed-videos/${v.id}`, { method: "PATCH", headers: { "x-admin-key": key, "content-type": "application/json" }, body: JSON.stringify({ category }) });
    if (r.ok) setVideos((l) => (l ?? []).map((x) => (x.id === v.id ? { ...x, category } : x)));
  };
  const delComment = async (c: AdminComment) => {
    if (!window.confirm("Delete this comment?")) return;
    const r = await fetch(api(`/${c.id}`), { method: "DELETE", headers: { "x-admin-key": key } });
    if (r.ok) setComments((l) => (l ?? []).filter((x) => x.id !== c.id));
  };

  const bg = { background: "linear-gradient(135deg, hsl(160 52% 8%) 0%, hsl(158 54% 14%) 45%, hsl(165 56% 20%) 100%)" };
  const current = GROUPS.flatMap((g) => g.items).find((i) => i.k === tab)!;

  if (!key) {
    return (
      <div className="relative grid min-h-[calc(100dvh-4rem)] place-items-center overflow-hidden px-4 pt-20 pb-10" style={bg}>
        <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl" />
        <form onSubmit={login} className={`${card} relative w-full max-w-sm space-y-4`}>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-600 to-sky-500 text-white shadow-lg"><ShieldCheck className="h-6 w-6" /></span>
            <div>
              <h1 className="text-lg font-extrabold leading-tight text-foreground">Admin sign in</h1>
              <p className="text-xs text-muted-foreground">Dighaz Engineering control panel</p>
            </div>
          </div>
          <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Admin password"
            className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button disabled={!pw || checking} className="w-full rounded-xl bg-gradient-to-r from-emerald-700 to-sky-600 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50">
            {checking ? "Checking…" : "Sign in"}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">Or sign in with the admin Google account and this opens by itself.</p>
        </form>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] overflow-hidden px-3 pt-20 pb-12 sm:px-4" style={bg}>
      <div className="pointer-events-none absolute -left-24 top-24 h-80 w-80 rounded-full bg-sky-400/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-[40%] h-96 w-96 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="relative mx-auto max-w-6xl space-y-4">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl p-4 text-white shadow-2xl ring-1 ring-white/15 sm:p-6" style={{ background: "linear-gradient(120deg, hsl(155 56% 22% / .95), hsl(176 60% 28% / .9) 55%, hsl(199 80% 38% / .9))" }}>
          <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/30"><ShieldCheck className="h-6 w-6" /></span>
              <div>
                <h1 className="text-xl font-extrabold leading-tight sm:text-2xl">Control panel</h1>
                <p className="text-xs text-white/75 sm:text-sm">{new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setUploading(true)} className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-sm font-bold text-emerald-900 shadow transition active:scale-95"><Plus className="h-4 w-4" /> Upload video</button>
              <Link href="/" className="flex items-center gap-1.5 rounded-xl bg-white/15 px-3.5 py-2 text-sm font-semibold ring-1 ring-white/25 transition hover:bg-white/25"><ExternalLink className="h-4 w-4" /> View site</Link>
              <button onClick={logout} className="flex items-center gap-1.5 rounded-xl bg-white/15 px-3.5 py-2 text-sm font-semibold ring-1 ring-white/25 transition hover:bg-white/25"><LogOut className="h-4 w-4" /> Log out</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Navigation: scrolling chips on phones, sidebar on laptops */}
          <nav className="min-w-0 lg:sticky lg:top-20 lg:self-start">
            <div className="flex gap-1.5 overflow-x-auto rounded-2xl bg-card/95 p-1.5 shadow-xl backdrop-blur [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
              {GROUPS.flatMap((g) => g.items).map(({ k, name, Icon }) => (
                <button key={k} onClick={() => setTab(k)} className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${tab === k ? "bg-gradient-to-r from-emerald-700 to-sky-600 text-white shadow" : "text-foreground/80 hover:bg-muted"}`}>
                  <Icon className="h-4 w-4" /> {name}
                </button>
              ))}
            </div>
            <div className="hidden space-y-4 rounded-2xl bg-card/95 p-3 shadow-xl backdrop-blur lg:block">
              {GROUPS.map((g) => (
                <div key={g.title}>
                  <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{g.title}</p>
                  {g.items.map(({ k, name, Icon }) => (
                    <button key={k} onClick={() => setTab(k)} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-semibold transition ${tab === k ? "bg-gradient-to-r from-emerald-700 to-sky-600 text-white shadow" : "text-foreground/80 hover:bg-muted"}`}>
                      <Icon className="h-4 w-4" /> {name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </nav>

          {/* Content */}
          <main key={tab} className="min-w-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            <section className={card}>
              <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-600 to-sky-500 text-white shadow"><current.Icon className="h-5 w-5" /></span>
                <div>
                  <h2 className="text-base font-extrabold leading-tight text-foreground sm:text-lg">{current.name}</h2>
                  <p className="text-xs text-muted-foreground">{current.note}</p>
                </div>
              </div>

              {tab === "overview" && <Overview adminKey={key} go={(t) => setTab(t as Tab)} />}
              {tab === "payments" && <PaymentsAdmin adminKey={key} onBadAdmin={logout} />}
              {(tab === "products" || tab === "services" || tab === "projects") && <CatalogEditor key={tab} kind={tab} adminKey={key} onBadAdmin={logout} />}
              {tab === "accounts" && <AccountsAdmin adminKey={key} onBadAdmin={logout} />}
              {tab === "enquiries" && <EnquiriesAdmin adminKey={key} onBadAdmin={logout} />}
              {tab === "posters" && <UploadersAdmin adminKey={key} onBadAdmin={logout} />}
              {tab === "referrals" && <ReferralsAdmin adminKey={key} onBadAdmin={logout} />}

              {tab === "videos" && (
                <div>
                  {videos === null && <p className="text-sm text-muted-foreground">Loading…</p>}
                  {videos?.length === 0 && <p className="text-sm text-muted-foreground">None yet. Tap “Upload video” to post one.</p>}
                  {!!videos?.length && (
                    <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
                      {[{ id: "all", label: "All" }, ...VIDEO_CATS].map((c) => {
                        const n = c.id === "all" ? videos.length : videos.filter((x) => catOf(x.category) === c.id).length;
                        return (
                          <button key={c.id} onClick={() => setVcat(c.id)} aria-pressed={vcat === c.id}
                            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${vcat === c.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70"}`}>{c.label} · {n}</button>
                        );
                      })}
                    </div>
                  )}
                  <div className="divide-y divide-border">
                    {videos?.filter((v) => vcat === "all" || catOf(v.category) === vcat).map((v) => (
                      <div key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{titles[`db-${v.id}`] ?? v.title}</p>
                          <p className="text-xs text-muted-foreground">{v.source === "github" ? "GitHub" : "Cloudinary"}{v.createdAt ? ` · ${new Date(v.createdAt).toLocaleDateString()}` : ""}</p>
                        </div>
                        <select value={catOf(v.category)} onChange={(e) => setVideoCat(v, e.target.value)} aria-label="Category"
                          className="max-w-[9.5rem] shrink-0 rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-semibold">
                          {VIDEO_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                        <button onClick={() => delVideo(v)} aria-label="Delete video" className="shrink-0 rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">The first videos that came with the site are part of the code, so they are not listed here.</p>
                </div>
              )}

              {tab === "comments" && (
                <div>
                  {comments === null && <p className="text-sm text-muted-foreground">Loading…</p>}
                  {comments?.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
                  <div className="divide-y divide-border">
                    {comments?.map((c) => (
                      <div key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{c.name}</span> on {titles[c.videoId] ?? c.videoId.replace(/\.(mp4|webm)$/i, "").replace(/-/g, " ")}</p>
                          <p className="break-words text-sm text-foreground/90">{c.body}</p>
                        </div>
                        <button onClick={() => delComment(c)} aria-label="Delete comment" className="shrink-0 rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </main>
        </div>
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
