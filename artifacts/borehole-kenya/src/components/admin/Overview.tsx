import { useEffect, useState } from "react";
import { Wallet, Clock, Users, Inbox, Package, Wrench, FolderOpen, Video, MessageCircle, Plus, ArrowRight } from "lucide-react";
import { API } from "@/pages/Feed";

interface Ov { products: number; services: number; projects: number; members: number; suspended: number; enquiries: number; videos: number; comments: number; pendingBank: number; received: number; payments: number }
type Go = (tab: string) => void;

const tiles = (o: Ov) => [
  { key: "payments", label: "Received", value: `KSh ${Math.round(o.received).toLocaleString("en-KE")}`, sub: `${o.payments} payments`, Icon: Wallet, grad: "from-emerald-500 to-teal-600", wide: true },
  { key: "payments", label: "Bank to confirm", value: String(o.pendingBank), sub: o.pendingBank ? "Waiting for you" : "All clear", Icon: Clock, grad: "from-amber-500 to-orange-500" },
  { key: "accounts", label: "Accounts", value: String(o.members), sub: o.suspended ? `${o.suspended} suspended` : "All active", Icon: Users, grad: "from-sky-500 to-blue-600" },
  { key: "enquiries", label: "Enquiries", value: String(o.enquiries), sub: "From the contact form", Icon: Inbox, grad: "from-violet-500 to-fuchsia-600" },
  { key: "products", label: "Products", value: String(o.products), sub: "In the store", Icon: Package, grad: "from-cyan-500 to-sky-600" },
  { key: "services", label: "Services", value: String(o.services), sub: "Offered", Icon: Wrench, grad: "from-lime-500 to-emerald-600" },
  { key: "projects", label: "Projects", value: String(o.projects), sub: "Completed work", Icon: FolderOpen, grad: "from-rose-500 to-pink-600" },
  { key: "videos", label: "Videos", value: String(o.videos), sub: "Uploaded by you", Icon: Video, grad: "from-indigo-500 to-blue-600" },
  { key: "comments", label: "Comments", value: String(o.comments), sub: "On videos", Icon: MessageCircle, grad: "from-fuchsia-500 to-rose-500" },
];

export default function Overview({ adminKey, go }: { adminKey: string; go: Go }) {
  const [o, setO] = useState<Ov | null>(null);
  useEffect(() => {
    fetch(`${API}/api/admin/overview`, { headers: { "x-admin-key": adminKey } }).then((r) => r.json()).then(setO).catch(() => setO(null));
  }, [adminKey]);

  const quick = [
    { tab: "products", label: "Add product", Icon: Package },
    { tab: "projects", label: "Add project", Icon: FolderOpen },
    { tab: "videos", label: "Upload video", Icon: Video },
    { tab: "payments", label: "Check payments", Icon: Wallet },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {(o ? tiles(o) : Array.from({ length: 9 }, () => null)).map((t, i) =>
          t ? (
            <button key={i} onClick={() => go(t.key)} style={{ animationDelay: `${i * 45}ms`, animationFillMode: "both" }}
              className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${t.grad} p-4 text-left text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl active:scale-[.98] animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ${t.wide ? "col-span-2 lg:col-span-1" : ""}`}>
              <t.Icon className="absolute -bottom-3 -right-2 h-20 w-20 text-white/15 transition group-hover:scale-110" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80">{t.label}</p>
              <p className="mt-1 text-2xl font-extrabold leading-none sm:text-3xl">{t.value}</p>
              <p className="mt-1.5 text-[11px] text-white/80">{t.sub}</p>
            </button>
          ) : (
            <div key={i} className={`h-24 animate-pulse rounded-2xl bg-muted ${i === 0 ? "col-span-2 lg:col-span-1" : ""}`} />
          ),
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Quick actions</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {quick.map(({ tab, label, Icon }) => (
            <button key={label} onClick={() => go(tab)} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background/70 px-3.5 py-3 text-left text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/5 active:scale-[.98]">
              <span className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>{label}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>

      {o && (o.pendingBank > 0 || o.enquiries > 0) && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-3.5 text-sm text-amber-900">
          <p className="mb-1 flex items-center gap-1.5 font-bold"><MessageCircle className="h-4 w-4" /> Needs your attention</p>
          {o.pendingBank > 0 && <button onClick={() => go("payments")} className="block text-left underline underline-offset-2">{o.pendingBank} bank payment{o.pendingBank > 1 ? "s" : ""} waiting to be confirmed</button>}
          {o.enquiries > 0 && <button onClick={() => go("enquiries")} className="block text-left underline underline-offset-2">{o.enquiries} enquiries from the contact form</button>}
        </div>
      )}
    </div>
  );
}
