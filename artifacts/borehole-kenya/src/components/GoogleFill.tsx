import { useEffect, useRef, useState } from "react";
import { API, memberApi } from "@/lib/member";

export type GoogleInfo = { email: string; name: string; data: Record<string, string> };

/**
 * Optional "Add from Google" button. Google asks the person to confirm; we get their name and email, plus what they typed in earlier reports
 * (phone, county, sub-county, ward, village, landmark). Nothing is required: it is only a shortcut. Hidden when Google sign-in is not switched on.
 */
export function GoogleFill({ onFill }: { onFill: (r: GoogleInfo) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false); const [msg, setMsg] = useState("");
  useEffect(() => {
    let off = false;
    memberApi("/config").then((cfg: { googleClientId: string }) => {
      if (off || !cfg?.googleClientId) return;
      setOn(true);
      const init = () => {
        const g = (window as any).google; if (!g || !box.current) return;
        g.accounts.id.initialize({ client_id: cfg.googleClientId, callback: async (resp: { credential: string }) => {
          setMsg("");
          try {
            const r = await fetch(`${API}/api/my-reports/prefill`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: resp.credential }) });
            const j = await r.json(); if (!r.ok) throw new Error(j.error || "Google could not be checked.");
            onFill(j as GoogleInfo); setMsg("Added from Google. You can change anything.");
          } catch (e) { setMsg((e as Error).message); }
        } });
        box.current.innerHTML = ""; g.accounts.id.renderButton(box.current, { theme: "outline", size: "medium", width: 180, text: "signin_with", shape: "pill" });
      };
      if ((window as any).google) { init(); return; }
      const sc = document.createElement("script"); sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = init; document.head.appendChild(sc);
    }).catch(() => {});
    return () => { off = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!on) return null;
  return (
    <div className="sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border border-dashed border-border px-3 py-2">
        <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground"><span className="font-semibold text-foreground">Save typing.</span> Fill the name, email and earlier details from Google. Optional.</p>
        <div ref={box} className="h-[34px] w-[180px] shrink-0 overflow-hidden" style={{ colorScheme: "light" }} />
      </div>
      {msg && <p className="mt-1 text-[11px] text-muted-foreground">{msg}</p>}
    </div>
  );
}
