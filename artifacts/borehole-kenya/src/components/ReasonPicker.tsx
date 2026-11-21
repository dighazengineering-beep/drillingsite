export const DEPTH_REASONS = [
  "The target water zone lies within this depth",
  "A fractured or weathered zone is reached at this depth",
  "Reaching two or three water-bearing layers gives enough storage",
  "Good expected yield at this depth",
  "Shallow layers may dry up in the dry season",
  "Avoids poorer-quality water in the upper layers",
  "Matches the depth of nearby boreholes",
  "Needed to meet the water demand",
  "Within the client's budget",
  "Recommended from the section picture",
];

export const POINT_YES = [
  "Strong, deep water-bearing zone with good expected yield",
  "Fractured or weathered zone at a good depth",
  "Several water-bearing layers, giving good storage",
  "Best expected yield of all the points surveyed",
  "Good point for access and drilling at the site",
  "Recommended from the section picture",
];
export const POINT_NO = [
  "Low expected yield",
  "Water zone is too shallow and may dry up in the dry season",
  "Water zone is too deep for the client's budget",
  "Weak or unclear water signal on the section",
  "Mostly hard, unfractured rock with little water",
  "A better point was found",
  "Poor access for the drilling rig",
  "Too close to a pit latrine, septic tank or other source of pollution",
];

/** Two choices, one ticked: Recommended (green) or Not recommended (red). */
export function RecommendToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const box = (on: boolean) => <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 text-[11px] leading-none ${on ? "border-white bg-white" : "border-current"}`}>{on ? "✓" : ""}</span>;
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => onChange(true)} className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition ${value ? "border-emerald-600 bg-emerald-600 text-white [&>span]:text-emerald-700" : "border-emerald-600/40 bg-emerald-600/5 text-emerald-700 dark:text-emerald-300"}`}>{box(value)} Recommended</button>
      <button type="button" onClick={() => onChange(false)} className={`flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition ${!value ? "border-red-600 bg-red-600 text-white [&>span]:text-red-700" : "border-red-600/40 bg-red-600/5 text-red-700 dark:text-red-300"}`}>{box(!value)} Not recommended</button>
    </div>
  );
}

/** Tick the reasons that apply; add your own in the box. The value is one line of text joined with "; ". */
export function ReasonPicker({ value, onChange, inp, options = DEPTH_REASONS }: { value: string; onChange: (v: string) => void; inp: string; options?: string[] }) {
  const parts = value.split(";").map((x) => x.trim()).filter(Boolean);
  const chosen = parts.filter((x) => options.includes(x));
  const other = parts.filter((x) => !options.includes(x)).join("; ");
  const join = (c: string[], o: string) => [...options.filter((x) => c.includes(x)), ...(o.trim() ? [o.trim()] : [])].join("; ");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((r) => {
          const on = chosen.includes(r);
          return (
            <button key={r} type="button" onClick={() => onChange(join(on ? chosen.filter((x) => x !== r) : [...chosen, r], other))}
              className={`rounded-full border px-3 py-1.5 text-left text-xs font-semibold transition ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50"}`}>
              {on ? "✓ " : ""}{r}
            </button>
          );
        })}
      </div>
      <input className={inp} defaultValue={other} placeholder="Another reason (optional)" onBlur={(e) => onChange(join(chosen, e.target.value))} />
    </div>
  );
}
