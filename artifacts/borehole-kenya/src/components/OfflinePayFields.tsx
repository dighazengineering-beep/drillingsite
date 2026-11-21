import { useState } from "react";
import { Camera } from "lucide-react";
import ChequeScanner from "@/components/ChequeScanner";

const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
export const newPaidAt = nowLocal;

export interface OfflineState { details: string; paidAt: string; chequeDate: string; img: string }
export const emptyOffline = (): OfflineState => ({ details: "", paidAt: nowLocal(), chequeDate: "", img: "" });
/** the extra fields sent to the server for a cash or cheque payment */
export const offlineBody = (o: OfflineState) => ({ details: o.details, paidAt: o.paidAt ? new Date(o.paidAt).toISOString() : undefined, chequeDate: o.chequeDate || undefined, receiptImg: o.img || undefined });

/** Cash or cheque: amount, date and time paid, cheque details, and a scan of the cheque. */
export function OfflinePayFields({ method, state, onChange, amount, payee, inp, lab }: { method: "cash" | "cheque"; state: OfflineState; onChange: (s: OfflineState) => void; amount: string; payee: string; inp: string; lab: string }) {
  const [scan, setScan] = useState(false);
  const set = (p: Partial<OfflineState>) => onChange({ ...state, ...p });
  const cheque = method === "cheque";
  return (
    <div className="space-y-2 rounded-xl border bg-muted/40 p-3 text-xs">
      <p className="text-foreground/90">{cheque ? <>Make the cheque payable to <b>{payee}</b>. When the cheque clears, we confirm it and send your receipt.</> : "Pay cash to our team or at our office. When we receive it, we confirm it and send your receipt."}</p>
      <div className="rounded-lg bg-card px-3 py-2"><span className="text-muted-foreground">Amount paid: </span><b className="text-sm text-primary">{amount}</b></div>
      <div><label className={lab}>Date and time paid</label><input type="datetime-local" value={state.paidAt} max={nowLocal()} onChange={(e) => set({ paidAt: e.target.value })} className={inp} data-testid="pay-paid-at" /></div>
      {cheque && <div><label className={lab}>Cheque number and bank</label><input value={state.details} onChange={(e) => set({ details: e.target.value })} maxLength={200} placeholder="For example: 000123, Equity Bank" className={inp} data-testid="pay-cheque-details" /></div>}
      {cheque && <div><label className={lab}>Date written on the cheque (optional)</label><input type="date" value={state.chequeDate} onChange={(e) => set({ chequeDate: e.target.value })} className={inp} /></div>}
      {!cheque && <div><label className={lab}>Who did you pay, or where? (optional)</label><input value={state.details} onChange={(e) => set({ details: e.target.value })} maxLength={200} placeholder="For example: paid to our officer at the site" className={inp} data-testid="pay-cash-details" /></div>}
      <div>
        <label className={lab}>{cheque ? "Scan the cheque" : "Photo of the signed receipt (optional)"}</label>
        {state.img ? (
          <div className="flex items-center gap-3"><img src={state.img} alt="" className="h-16 rounded-lg border object-cover" /><button type="button" onClick={() => setScan(true)} className="font-bold text-primary underline">Scan again</button><button type="button" onClick={() => set({ img: "" })} className="font-bold text-red-600">Remove</button></div>
        ) : (
          <button type="button" onClick={() => setScan(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-card py-3 font-bold text-primary" data-testid="pay-scan"><Camera className="h-4 w-4" /> {cheque ? "Open camera and scan the cheque" : "Take a photo"}</button>
        )}
      </div>
      {scan && <ChequeScanner title={cheque ? "Scan the cheque" : "Photo of the receipt"} onClose={() => setScan(false)} onDone={(d) => { set({ img: d }); setScan(false); }} />}
    </div>
  );
}
