export interface QLine { kind: "line" | "section" | "mob" | "sum"; sn: number | null; description: string; unit: string; qty: number | null; rate: number | null; amount: number | null; rateOnly: boolean; label?: string }
const money = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.00`;

/** The itemised quote table (S/N, Description, Unit, Qty, Rate, Amount, then TOTAL). Scrolls sideways on a phone instead of squashing. */
export default function QuoteTable({ lines, total, agreed }: { lines: QLine[]; total: number; agreed?: number }) {
  const saving = agreed && agreed > 0 && agreed < total ? Math.round(total - agreed) : 0;
  const mob = lines.find((l) => l.kind === "mob");
  const sums = lines.filter((l) => l.kind === "sum");
  const body = lines.filter((l) => l.kind === "line" || l.kind === "section");
  return (
    <div className="grid gap-2">
      {mob && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-[11px] sm:text-xs">
            <thead><tr className="bg-[#0b1d3a] text-white"><th className="px-2 py-2 text-left text-[10px] font-bold uppercase">Description</th><th className="px-2 py-2 text-right text-[10px] font-bold uppercase">Amount (Ksh)</th></tr></thead>
            <tbody><tr className="border-t border-border align-top"><td className="px-2 py-1.5">{mob.description}</td><td className="whitespace-nowrap px-2 py-1.5 text-right font-bold">{money(mob.amount ?? 0)}{mob.label && <span className="block text-[10.5px] font-medium text-blue-700">{mob.label}</span>}</td></tr></tbody>
          </table>
        </div>
      )}
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[520px] border-collapse text-[11px] sm:text-xs">
        <thead>
          <tr className="bg-[#0b1d3a] text-white">
            {["S/N", "Description", "Unit", "Qty", "Rate (Ksh)", "Amount (Ksh)"].map((h, i) => (
              <th key={h} className={`px-2 py-2 text-[10px] font-bold uppercase ${i >= 3 ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((l, i) => l.kind === "section" ? (
            <tr key={i} className="bg-muted"><td colSpan={6} className="px-2 py-1.5 font-extrabold">{l.description}</td></tr>
          ) : (
            <tr key={i} className="border-t border-border align-top">
              <td className="px-2 py-1.5">{l.sn}</td>
              <td className="whitespace-pre-line px-2 py-1.5">{l.description}</td>
              <td className="px-2 py-1.5">{l.unit}</td>
              <td className="px-2 py-1.5 text-right">{l.qty ?? ""}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right">{l.rate === null ? "" : money(l.rate)}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right font-bold">{l.amount === null ? <span className="font-normal text-muted-foreground">{l.label || "Rate only"}</span> : money(l.amount)}</td>
            </tr>
          ))}
          {sums.length ? sums.map((l, i) => (
            <tr key={`s${i}`} className={i === 1 ? "border-t border-border font-semibold" : "border-t-2 border-sky-400 bg-sky-50 font-extrabold"}>
              <td colSpan={5} className="px-2 py-2">{l.description}</td>
              <td className={`whitespace-nowrap px-2 py-2 text-right ${i === 1 ? "" : "text-primary"}`}>{money(l.amount ?? 0)}</td>
            </tr>
          )) : (
            <tr className="border-t-2 border-sky-400 bg-sky-50 font-extrabold">
              <td colSpan={5} className="px-2 py-2">TOTAL</td>
              <td className="whitespace-nowrap px-2 py-2 text-right text-primary">{money(total)}</td>
            </tr>
          )}
          {saving > 0 && (
            <>
              <tr className="border-t border-border bg-emerald-50 font-semibold text-emerald-800">
                <td colSpan={5} className="px-2 py-2">You save</td>
                <td className="whitespace-nowrap px-2 py-2 text-right">- {money(saving)}</td>
              </tr>
              <tr className="border-t-2 border-emerald-400 bg-emerald-100 font-extrabold text-emerald-900">
                <td colSpan={5} className="px-2 py-2">YOU PAY</td>
                <td className="whitespace-nowrap px-2 py-2 text-right">{money(agreed!)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
    </div>
  );
}
