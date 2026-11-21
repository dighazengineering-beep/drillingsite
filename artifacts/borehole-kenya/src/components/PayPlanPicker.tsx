import { useEffect, useRef } from "react";
import { CheckCircle2, CreditCard, Layers, Plus, X } from "lucide-react";

// "How will you pay?" on the contract form: all at once, or in steps where the client types the exact amount of every payment.
// The last payment is always the rest, so the payments add up to the contract price exactly. (The server checks everything again.)
const kes = (n: number) => `KSh ${Math.round(n).toLocaleString("en-KE")}`;
const BAR = ["bg-primary", "bg-sky-500", "bg-teal-500", "bg-sky-400", "bg-emerald-500"];
const MOB_MIN = 80000, LAST_MIN_PCT = 10;

export type Plan = "steps" | "full";

export function PayPlanPicker({ plan, setPlan, drill, survey, total, steps, setSteps, defMob = 90000, maxMob }: {
  plan: Plan; setPlan: (p: Plan) => void; drill: boolean; survey?: boolean; defMob?: number; maxMob?: number; total: number; steps: string[]; setSteps: (s: string[]) => void;
}) {
  const touched = useRef(steps.some((s) => s !== ""));   // amounts that were already typed (for example after "Change my details") are kept
  const names = drill ? ["Mobilization", "On reaching the site", "Next payment", "Next payment"] : ["Deposit", "Second payment", "Third payment", "Fourth payment"];
  const nums = steps.map((s) => Number(s) || 0);
  const before = nums.reduce((a, b) => a + b, 0);
  const last = total - before;
  const known = total > 0;

  // until the client types an amount, suggest our usual steps; they are only a starting point
  useEffect(() => {
    if (touched.current || !known) return;
    const m0 = Math.round(total * 0.75) - defMob >= 1 ? defMob : MOB_MIN;   // a small contract starts from the lowest mobilization
    setSteps(drill ? [String(m0), String(Math.max(0, Math.round(total * 0.75) - m0))] : survey ? ["5000"] : [String(Math.round(total * 0.7))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, drill, survey, known]);

  useEffect(() => { if (steps.length === 0) setSteps([""]); }, [steps.length, setSteps]);

  const edit = (i: number, v: string) => { touched.current = true; setSteps(steps.map((x, k) => (k === i ? v.replace(/\D/g, "").slice(0, 9) : x))); };
  const add = () => { touched.current = true; if (steps.length < 4) setSteps([...steps, ""]); };
  const drop = (i: number) => { touched.current = true; if (steps.length > 1) setSteps(steps.filter((_, k) => k !== i)); };

  let problem = "";
  if (plan === "steps" && known && steps.some((s) => s !== "")) {
    if (nums.some((n) => n < 1)) problem = "Enter the amount of every payment.";
    else if (drill && (nums[0] < MOB_MIN || (maxMob !== undefined && nums[0] > maxMob))) problem = maxMob !== undefined ? `The first payment (mobilization) must be between ${kes(MOB_MIN)} and ${kes(maxMob)}.` : `The first payment (mobilization) must be at least ${kes(MOB_MIN)}.`;
    else if (last < Math.round((total * LAST_MIN_PCT) / 100)) problem = `Keep at least ${LAST_MIN_PCT}% of the price (${kes(Math.round((total * LAST_MIN_PCT) / 100))}) for the final payment.`;
  }

  const card = (k: Plan, title: string, text: string, Icon: typeof Layers) => {
    const on = plan === k;
    return (
      <button type="button" role="radio" aria-checked={on} onClick={() => setPlan(k)} data-testid={`plan-${k}`}
        className={`group relative flex items-start gap-3 rounded-2xl border-2 p-3.5 text-left transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-[.98] ${on ? "border-primary bg-gradient-to-br from-primary/10 via-card to-sky-50 shadow-lg shadow-primary/10" : "border-border bg-card hover:border-primary/40"}`}>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-all duration-300 ${on ? "scale-110 bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-primary"}`}><Icon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-extrabold transition-colors duration-300 ${on ? "text-primary" : "text-foreground"}`}>{title}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{text}</span>
        </span>
        <CheckCircle2 className={`absolute right-2.5 top-2.5 h-5 w-5 text-primary transition-all duration-300 ${on ? "scale-100 opacity-100" : "scale-50 opacity-0"}`} />
      </button>
    );
  };

  return (
    <div className="grid gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3.5" data-testid="contract-plan">
      <p className="text-xs font-bold uppercase tracking-wide text-foreground">How will you pay?</p>
      <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="How will you pay">
        {card("steps", "In steps", drill ? "Mobilization, then more payments as the work moves, then the final payment." : "A deposit, then more payments, then the final payment on completion.", Layers)}
        {card("full", "All at once", "One payment of the full contract price. The price is the same.", CreditCard)}
      </div>

      <div className={`grid transition-[grid-template-rows,opacity] duration-500 ease-in-out ${plan === "steps" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="grid gap-2.5 pt-1" aria-hidden={plan !== "steps"}>
            {known && (
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                {nums.map((n, i) => <div key={i} className={`${BAR[i]} transition-all duration-500 ease-out`} style={{ width: `${Math.max(0, Math.min(100, (n / total) * 100))}%` }} />)}
                <div className={`${BAR[4]} transition-all duration-500 ease-out`} style={{ width: `${Math.max(0, Math.min(100, (last / total) * 100))}%` }} />
              </div>
            )}
            {steps.map((v, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white ${BAR[i]}`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <label htmlFor={`ct-step-${i}`} className="block text-[11px] font-bold text-muted-foreground">{names[i]}</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground">KSh</span>
                    <input id={`ct-step-${i}`} inputMode="numeric" value={v} onChange={(e) => edit(i, e.target.value)} placeholder="Amount" data-testid={`step-amount-${i}`}
                      className="w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm font-bold outline-none transition-shadow focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>
                {known && nums[i] > 0 && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{Math.round((nums[i] / total) * 100)}%</span>}
                {steps.length > 1 && <button type="button" onClick={() => drop(i)} aria-label="Remove this payment" className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"><X className="h-4 w-4" /></button>}
              </div>
            ))}
            {known ? (
              <div className="flex items-center gap-2.5 rounded-xl border-2 border-sky-300 bg-gradient-to-r from-sky-50 to-sky-100/60 p-2.5 shadow-sm transition-all duration-300" data-testid="step-final">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white ${BAR[4]}`}>{steps.length + 1}</span>
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-sky-800">{survey ? "Balance, when the best point is identified" : "Final payment, on completion"}</span>
                  <span className={`block text-sm font-extrabold transition-colors duration-300 ${last < 1 ? "text-red-600" : "text-foreground"}`}>{kes(Math.max(0, last))}</span>
                </div>
                <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold text-sky-800">the rest</span>
              </div>
            ) : (
              <p className="rounded-xl bg-card px-3 py-2 text-[11px] text-muted-foreground">Type the amount of each payment. The final payment is the rest of the contract price. Leave them empty to use our usual steps.</p>
            )}
            {problem && <p className="animate-in fade-in slide-in-from-top-1 text-xs font-semibold text-red-600 duration-300" role="alert">{problem}</p>}
            {steps.length < 4 && (
              <button type="button" onClick={add} data-testid="add-step" className="inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary/40 py-2 text-xs font-bold text-primary transition-all duration-200 hover:border-primary hover:bg-primary/5 active:scale-[.98]">
                <Plus className="h-4 w-4" /> Add another payment
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
