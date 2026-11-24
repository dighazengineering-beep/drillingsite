import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

/** Shows the finished report on the page the way Word shows it: cover, contents, headings, tables, pictures, header and footer. */
export default function WordView({ url, headers, pdf, onClose }: { url: string; headers?: Record<string, string>; pdf?: boolean; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"load" | "ok" | "err">("load");
  const [src, setSrc] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let dead = false; let obj = "";
    (async () => {
      try {
        const r = await fetch(url, headers ? { headers } : undefined);
        if (!r.ok) { let m = ""; try { m = ((await r.json()) as { error?: string }).error ?? ""; } catch { /* not json */ } throw new Error(m || `Could not open the report (error ${r.status}).`); }
        const b = await r.blob();
        if (dead) return;
        if (pdf) { obj = URL.createObjectURL(new Blob([b], { type: "application/pdf" })); setSrc(obj); setState("ok"); return; }
        const { renderAsync } = await import("docx-preview");
        if (!box.current || dead) return;
        box.current.innerHTML = "";
        await renderAsync(b, box.current, undefined, { className: "docx", inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, renderHeaders: true, renderFooters: true, renderFootnotes: true, useBase64URL: true });
        if (dead) return;
        // fit the pages to the width of the screen
        const pg = box.current.querySelector<HTMLElement>("section.docx"); const w = pg?.offsetWidth ?? 794; const k = Math.min(1, (box.current.clientWidth - 8) / w);
        if (k < 1) box.current.style.zoom = String(k);
        setState("ok");
      } catch (e) { if (!dead) { setMsg((e as Error).message || "Could not show the report."); setState("err"); } }
    })();
    return () => { dead = true; if (obj) URL.revokeObjectURL(obj); };
  }, [url, pdf]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/40 p-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-bold text-foreground">{pdf ? "Preview of the full report" : "Full report, as in Word"}</span>
        <button onClick={onClose} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-bold"><X className="h-3.5 w-3.5" /> Close</button>
      </div>
      {state === "load" && <p className="flex items-center gap-2 p-3 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Opening the report…</p>}
      {state === "err" && <p className="p-3 text-sm text-red-600">{msg}</p>}
      {pdf ? (src ? <iframe title="Report preview" src={src} className="h-[80vh] w-full rounded-lg bg-white" /> : null)
        : <div ref={box} className="max-h-[80vh] overflow-auto rounded-lg [&_.docx-wrapper]:!bg-transparent [&_.docx-wrapper]:!p-1 [&_section.docx]:mb-3 [&_section.docx]:shadow-md" />}
    </div>
  );
}
