import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Bell, Wallet, Sparkles, PlayCircle, Wrench, X } from "lucide-react";
import { API, memberApi, memberToken } from "@/lib/member";

interface Note { id: string; title: string; body: string; link: string; at?: string; kind: "pay" | "info" }

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
export const rememberPhone = (p: string) => { if (p.replace(/\D/g, "").length >= 9) ls.set("dighaz_phone", p); };

// The server gives the payer a key when they pay. It is needed to read that phone's notifications, balances and receipts.
const tail = (p: string) => p.replace(/\D/g, "").slice(-9);
const keyMap = (): Record<string, string> => { try { return JSON.parse(ls.get("dighaz_keys") || "{}"); } catch { return {}; } };
export const rememberKey = (phone: string, key?: string) => { if (key) ls.set("dighaz_keys", JSON.stringify({ ...keyMap(), [tail(phone)]: key })); };
export const keyFor = (phone: string) => keyMap()[tail(phone)] ?? "";

const WELCOME: Note[] = [
  { id: "w1", kind: "info", title: "Welcome to Dighaz Engineering", body: "Borehole drilling, surveys, pumps, solar and water treatment from one team.", link: "/services" },
  { id: "w2", kind: "info", title: "See our successful boreholes", body: "Watch real boreholes our crews have completed, with videos from site.", link: "/feed" },
  { id: "w3", kind: "info", title: "Check what we offer", body: "Surveys, test pumping, pump installation and inspection. Get a free quote today.", link: "/contact" },
];

/** Bell in the header. Shows payment updates (received, balance left, bank confirmed) and welcome messages. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(() => ls.get("dighaz_phone"));
  const [pay, setPay] = useState<Note[]>([]);
  const [seen, setSeen] = useState(() => new Set(ls.get("dighaz_seen").split(",").filter(Boolean)));

  const load = useCallback(async () => {
    let ph = ls.get("dighaz_phone");
    if (!ph && memberToken()) {
      try { ph = (await memberApi<{ member: { phone: string } }>("/me")).member.phone || ""; if (ph) ls.set("dighaz_phone", ph); } catch { /* not signed in */ }
    }
    setPhone(ph);
    if (!ph) return;
    try {
      const d = await fetch(`${API}/api/payments/notifications?phone=${encodeURIComponent(ph)}&key=${encodeURIComponent(keyFor(ph))}`).then((r) => r.json());
      setPay((Array.isArray(d) ? d : []).map((n: any) => ({ id: `p${n.id}`, kind: "pay" as const, title: n.title, body: n.body, link: n.link, at: n.createdAt })));
    } catch { /* offline */ }
  }, []);

  useEffect(() => { load(); const t = window.setInterval(load, 20000); return () => window.clearInterval(t); }, [load]);
  useEffect(() => {
    const h = () => { setTimeout(load, 800); };
    window.addEventListener("dighaz:phone", h);
    return () => window.removeEventListener("dighaz:phone", h);
  }, [load]);

  const all = [...pay, ...WELCOME];
  const unread = all.filter((n) => !seen.has(n.id)).length;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next) { const s = new Set([...seen, ...all.map((n) => n.id)]); setSeen(s); ls.set("dighaz_seen", [...s].slice(-200).join(",")); }
  };
  const close = () => { if (open) toggle(); };
  const ago = (iso?: string) => {
    if (!iso) return "";
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return m < 1 ? "now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
  };
  void phone;

  return (
    <div className="relative">
      <button type="button" onClick={toggle} aria-label="Notifications" data-testid="button-bell" className="relative rounded-md p-1.5 transition-colors hover:bg-muted sm:p-2">
        <Bell className="h-5 w-5 text-foreground/70" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={close} />
          <div className="fixed left-3 right-3 top-[4.25rem] z-[61] max-h-[70dvh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in-0 slide-in-from-top-2 sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-80" data-testid="notifications-panel">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-extrabold text-foreground">Notifications</p>
              <button onClick={close} aria-label="Close" className="rounded-full p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="divide-y divide-border">
              {all.map((n) => {
                const Icon = n.kind === "pay" ? Wallet : n.id === "w2" ? PlayCircle : n.id === "w3" ? Wrench : Sparkles;
                return (
                  <Link key={n.id} href={n.link || "/"} onClick={close} className="flex gap-3 px-4 py-3 transition hover:bg-muted/60">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${n.kind === "pay" ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"}`}><Icon className="h-[18px] w-[18px]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-[13px] font-bold leading-tight text-foreground">{n.title}</span>
                        {!seen.has(n.id) && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-500" />}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{n.body}</span>
                      {n.at && <span className="mt-1 block text-[10px] text-muted-foreground/70">{ago(n.at)}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
