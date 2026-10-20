import { useEffect, useRef, useState } from "react";
import { LiveTitle } from "@/components/LiveTitle";
import { useLocation } from "wouter";
import { Users, Wallet, Link2, BadgeCheck, UserRound, Coins } from "lucide-react";
import { IMAGES, pageBackdrop } from "@/lib/images";
import { memberApi, memberToken, setMemberToken, savedRef, type Member } from "@/lib/member";

declare global { interface Window { google?: any } }

const input = "w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

export default function Join() {
  const [, go] = useLocation();
  const [mode, setMode] = useState<"signup" | "login">(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "login" ? "login" : "signup");
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  // Earning is optional: everyone is a client, and can also choose to earn by referring.
  const [affiliate, setAffiliate] = useState(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("earn") === "1");
  const affRef = useRef(affiliate);
  affRef.current = affiliate;
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<{ googleClientId: string; rates: { service: number; product: number } } | null>(null);
  const gbtn = useRef<HTMLDivElement>(null);

  useEffect(() => { if (memberToken()) { const n = new URLSearchParams(window.location.search).get("next"); go(n && /^\/[A-Za-z0-9\-_/]*$/.test(n) ? n : "/account"); } }, [go]);
  useEffect(() => {
    memberApi("/config").then(setCfg).catch(() => setCfg({ googleClientId: "", rates: { service: 15, product: 3 } }));
  }, []);

  // After signing in, go back to where the person came from (for example the video feed) when a safe ?next= is given.
  const done = (d: { token: string; member: Member }) => {
    setMemberToken(d.token);
    const next = new URLSearchParams(window.location.search).get("next");
    go(next && /^\/[A-Za-z0-9\-_/]*$/.test(next) ? next : "/account");
  };

  // Google button
  useEffect(() => {
    if (!cfg?.googleClientId) return;
    const init = () => {
      if (!window.google || !gbtn.current) return;
      window.google.accounts.id.initialize({
        client_id: cfg.googleClientId,
        callback: async (resp: { credential: string }) => {
          setBusy(true); setErr("");
          try { done(await memberApi("/google", { body: { credential: resp.credential, affiliate: affRef.current } })); }
          catch (e: any) { setErr(e.message); }
          setBusy(false);
        },
      });
      gbtn.current.innerHTML = "";
      window.google.accounts.id.renderButton(gbtn.current, { theme: "outline", size: "large", width: 320, text: "continue_with", shape: "rectangular" });
    };
    if (window.google) { init(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [cfg?.googleClientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      done(await memberApi(mode === "signup" ? "/signup" : "/login", { body: mode === "signup" ? { ...f, affiliate } : f }));
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const rates = cfg?.rates ?? { service: 15, product: 3 };
  const ref = savedRef();

  return (
    <div className="min-h-[calc(100dvh-4rem)] px-4 pt-24 pb-12" style={pageBackdrop(IMAGES.backdropTruck, "center 50%")}>
      <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
        <section className="rounded-2xl bg-card/95 p-5 shadow-xl">
          <h1 className="text-xl font-bold text-foreground"><LiveTitle text="Your Dighaz account" hi="#0ea5e9" /></h1>
          <p className="mt-1 text-sm text-muted-foreground">Log in to follow your enquiries and get quotes faster. Want to make money too? Switch on earning when you sign up, or any time later. It is optional.</p>
          <h2 className="mt-4 flex items-center gap-2 text-sm font-bold text-foreground"><Coins className="h-4 w-4 text-sky-500" /> <LiveTitle level="sub" text="Earn by referring clients (optional)" hi="#0ea5e9" /></h2>
          <ul className="mt-3 space-y-3 text-sm">
            <li className="flex gap-3"><Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><b>Sign up</b> with Google or email. You get your own referral code and link.</span></li>
            <li className="flex gap-3"><Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><b>Bring clients</b> for surveys, drilling, solar or products. Add them in your account, or share your link.</span></li>
            <li className="flex gap-3"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><b>{rates.service}%</b> commission on services and <b>{rates.product}%</b> on products, worked out on the price the client pays.</span></li>
            <li className="flex gap-3"><Wallet className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Paid once the work is complete and the client has paid in full.</span></li>
          </ul>
          {ref && <p className="mt-4 rounded-md bg-primary/10 px-3 py-2 text-xs text-foreground">You were invited with code <b>{ref}</b>.</p>}
        </section>

        <form onSubmit={submit} className="space-y-3 rounded-2xl bg-card/95 p-5 shadow-xl">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(["signup", "login"] as const).map((m) => (
              <button type="button" key={m} onClick={() => { setMode(m); setErr(""); }}
                className={`rounded-md py-2 text-sm font-semibold ${mode === m ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                {m === "signup" ? "Sign up" : "Sign in"}
              </button>
            ))}
          </div>

          {mode === "signup" && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground">I am joining as</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  [false, "A client", "Get quotes and track my enquiries", UserRound],
                  [true, "Client + earner", "Also earn commission by referring", Coins],
                ] as const).map(([val, title, sub, Icon]) => (
                  <button type="button" key={title} onClick={() => setAffiliate(val)} data-testid={val ? "role-affiliate" : "role-client"}
                    className={`rounded-lg border p-2.5 text-left transition ${affiliate === val ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-background hover:border-primary/40"}`}>
                    <Icon className={`h-4 w-4 ${affiliate === val ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="mt-1 block text-xs font-bold text-foreground">{title}</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">{sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {cfg?.googleClientId && (
            <>
              <div className="flex justify-center"><div ref={gbtn} /></div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /> or use email <span className="h-px flex-1 bg-border" /></div>
            </>
          )}

          {mode === "signup" && <input className={input} placeholder="Full name" value={f.name} onChange={set("name")} autoComplete="name" required />}
          <input className={input} type="email" placeholder="Email" value={f.email} onChange={set("email")} autoComplete="email" required />
          {mode === "signup" && <input className={input} type="tel" placeholder={affiliate ? "Phone (for your payouts)" : "Phone"} value={f.phone} onChange={set("phone")} autoComplete="tel" />}
          <input className={input} type="password" placeholder="Password (6+ characters)" value={f.password} onChange={set("password")} autoComplete={mode === "signup" ? "new-password" : "current-password"} required />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button disabled={busy} className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? "Please wait…" : mode === "signup" ? "Create my account" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
