import { useEffect, useState } from "react";
import { preloadOcr, releaseOcr } from "@/lib/ocr";
import { preloadCv } from "@/lib/cardDetect";
import { ScanLine, CheckCircle2, AlertTriangle } from "lucide-react";
import IdScanner, { type ScanResult } from "@/components/IdScanner";

const LABEL = { strong: "Details read from your ID", weak: "Partly read: please check the details", unverified: "We could not read the details: please type them" } as const;

/** The "Scan your ID" button for a form. After the scan it hands the name and ID number read from the card to the form (onFill). */
export default function IdScanField({ purpose, value, onChange, onFill }: { purpose: string; value: ScanResult | null; onChange: (v: ScanResult | null) => void; onFill: (f: { name: string; idNo: string }) => void }) {
  const [open, setOpen] = useState(false);
  // keep the scanned ID for this browser tab, so a refresh or coming back to the page never loses it
  const key = `kws_idscan:${typeof location !== "undefined" ? location.pathname : ""}`;
  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(key) || "null");
      if (d && d.t > Date.now() - 3 * 3600_000 && d.v?.front && d.v?.back && !value) { onChange(d.v); onFill({ name: d.v.name, idNo: d.v.idNo }); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try { if (value) sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); } catch { /* ignore */ }
  }, [value, key]);
  // start loading the reader now, so the scan is quick when the client taps the button
  useEffect(() => { preloadOcr(); preloadCv(); return () => releaseOcr(); }, []);
  return (
    <div data-testid="id-scan-field">
      {value ? (
        <div className={`rounded-xl border p-3 text-sm ${value.match === "strong" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-sky-300 bg-sky-50 text-sky-900"}`}>
          <p className="flex items-center gap-2 font-extrabold">{value.match === "strong" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} ID scanned: front and back</p>
          <p className="mt-0.5 text-xs">{LABEL[value.match]}{value.source === "photo" ? " (photo)" : ""}.</p>
          {(value.name || value.idNo) && <p className="mt-1 text-xs">{value.name && <>Name: <b>{value.name}</b></>}{value.name && value.idNo ? " · " : ""}{value.idNo && <>ID: <b>{value.idNo}</b></>}</p>}
          <div className="mt-2 flex gap-2"><img src={value.front} alt="ID front" className="h-14 rounded border" /><img src={value.back} alt="ID back" className="h-14 rounded border" /></div>
          <button type="button" onClick={() => { try { sessionStorage.removeItem(key); } catch { /* ignore */ } onChange(null); setOpen(true); }} className="mt-2 text-xs font-bold underline">Scan again</button>
        </div>
      ) : (
        <>
          <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 px-4 py-3.5 text-sm font-extrabold text-primary transition active:scale-[0.99]" data-testid="button-scan-id">
            <ScanLine className="h-5 w-5" /> Scan your ID (front and back)
          </button>
          <p className="mt-1 text-[11px] text-muted-foreground">Your name and ID number fill in by themselves. ID, driving licence, military ID or passport. We use it only for this {purpose}. If your phone cannot read it, a secure online reader may help.</p>
        </>
      )}
      {open && <IdScanner purpose={purpose} onClose={() => setOpen(false)} onDone={(r) => { onChange(r); onFill({ name: r.name, idNo: r.idNo }); setOpen(false); }} />}
    </div>
  );
}
