const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const todayLong = () => { const t = new Date(); return `${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}`; };
/** Weekday, day, month and year as four drop-downs; the value is stored like "18 November 2026". */
export function DateSelect({ value, onChange, cls }: { value: string; onChange: (v: string) => void; cls: string }) {
  const m = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(value || "");
  const now = new Date();
  const day = m ? Number(m[1]) : 0, mon = m ? MONTHS.indexOf(m[2]!) : -1, yr = m ? Number(m[3]) : 0;
  const years = Array.from({ length: 12 }, (_, i) => now.getFullYear() - 9 + i);
  const dim = mon >= 0 && yr ? new Date(yr, mon + 1, 0).getDate() : 31;
  const emit = (d: number, mo: number, y: number) => { if (d > 0 && mo >= 0 && y > 0) onChange(`${Math.min(d, new Date(y, mo + 1, 0).getDate())} ${MONTHS[mo]} ${y}`); };
  const wd = m && mon >= 0 ? new Date(yr, mon, day).getDay() : -1;
  const sel = `${cls} !px-2`;
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      <select className={sel} aria-label="Day of the week" value={wd} onChange={(e) => { if (wd < 0) return; const w = Number(e.target.value); const t = new Date(yr, mon, day + (w - wd)); emit(t.getDate(), t.getMonth(), t.getFullYear()); }}>
        {wd < 0 && <option value={-1}>Day</option>}{DAYS.map((n, i) => <option key={n} value={i}>{n}</option>)}
      </select>
      <select className={sel} aria-label="Date" value={day || ""} onChange={(e) => emit(Number(e.target.value), mon >= 0 ? mon : now.getMonth(), yr || now.getFullYear())}>
        <option value="" disabled>Date</option>{Array.from({ length: dim }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select className={sel} aria-label="Month" value={mon >= 0 ? mon : ""} onChange={(e) => emit(day || 1, Number(e.target.value), yr || now.getFullYear())}>
        <option value="" disabled>Month</option>{MONTHS.map((n, i) => <option key={n} value={i}>{n}</option>)}
      </select>
      <select className={sel} aria-label="Year" value={yr || ""} onChange={(e) => emit(day || 1, mon >= 0 ? mon : now.getMonth(), Number(e.target.value))}>
        <option value="" disabled>Year</option>{years.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}
