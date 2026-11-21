import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

const FIRST: CountryCode[] = ["KE", "UG", "TZ", "RW", "GB", "US"];
let list: { code: CountryCode; name: string; dial: string }[] | null = null;
function countries() {
  if (list) return list;
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames(["en"], { type: "region" }); } catch { /* old browser: show the code */ }
  const all = getCountries().map((code) => ({ code, name: names?.of(code) ?? code, dial: getCountryCallingCode(code) }));
  const top = FIRST.map((c) => all.find((x) => x.code === c)!).filter(Boolean);
  const rest = all.filter((x) => !FIRST.includes(x.code)).sort((a, b) => a.name.localeCompare(b.name));
  list = [...top, ...rest];
  return list;
}

/** Splits a stored number (07.. / 2547.. / +44..) into a country and the number as typed in that country. */
function split(value: string): { country: CountryCode; national: string } {
  const d = (value || "").replace(/\D/g, "");
  if (!d) return { country: "KE", national: "" };
  if (!d.startsWith("0") && d.length >= 10) {
    const p = parsePhoneNumberFromString("+" + d);
    if (p?.country) return { country: p.country, national: p.nationalNumber };
  }
  return { country: "KE", national: d.startsWith("254") ? d.slice(3) : d.replace(/^0/, "") };
}

interface Props {
  value: string;
  onChange: (digits: string) => void;
  /** only Kenya can be chosen (for M-Pesa) */
  kenyaOnly?: boolean;
  id?: string;
  className?: string;
  testId?: string;
  placeholder?: string;
}

/** Country + phone number. Kenya is chosen by default. Gives back the full international digits (for example 254712345678). */
export function PhoneField({ value, onChange, kenyaOnly, id, className = "", testId, placeholder }: Props) {
  const init = useMemo(() => split(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState<CountryCode>(kenyaOnly ? "KE" : init.country);
  const [national, setNational] = useState(init.national);
  const [touched, setTouched] = useState(false);
  const last = useRef(value);

  // the number was changed from outside (a saved draft came back, the form was cleared)
  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    const s = split(value);
    setCountry(kenyaOnly ? "KE" : s.country); setNational(s.national);
  }, [value, kenyaOnly]);
  useEffect(() => { if (kenyaOnly && country !== "KE") { setCountry("KE"); setNational(""); push("KE", ""); } }, [kenyaOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const push = (c: CountryCode, n: string) => {
    const digits = n.replace(/\D/g, "");
    const clean = c === "KE" ? digits.replace(/^0/, "") : digits.replace(/^0+/, "");
    const out = clean ? getCountryCallingCode(c) + clean : "";
    last.current = out;
    onChange(out);
  };
  const parsed = national.replace(/\D/g, "") ? parsePhoneNumberFromString(national, country) : undefined;
  const bad = touched && national.replace(/\D/g, "").length > 0 && !parsed?.isValid();
  return (
    <div>
      <div className="flex gap-1.5">
        <select
          value={country} disabled={kenyaOnly} aria-label="Country"
          onChange={(e) => { const c = e.target.value as CountryCode; setCountry(c); push(c, national); }}
          className={`${className} !w-[5.8rem] shrink-0 !px-2 ${kenyaOnly ? "opacity-70" : ""}`} data-testid={testId ? `${testId}-country` : undefined}
        >
          {(kenyaOnly ? countries().filter((c) => c.code === "KE") : countries()).map((c) => <option key={c.code} value={c.code}>{c.code} +{c.dial}</option>)}
        </select>
        <input
          id={id} inputMode="tel" autoComplete="tel-national" value={national} maxLength={20}
          placeholder={placeholder ?? (country === "KE" ? "712 345 678" : "Phone number")}
          onChange={(e) => { setNational(e.target.value); push(country, e.target.value); }}
          onBlur={() => setTouched(true)}
          className={`${className} min-w-0 flex-1 ${bad ? "!border-red-500" : ""}`} data-testid={testId}
        />
      </div>
      {kenyaOnly && <p className="mt-1 text-[11px] text-muted-foreground">M-Pesa works with Kenyan numbers only (+254).</p>}
      {bad && (
        <div role="alert" className="mt-1.5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="leading-snug">
            <span className="font-semibold">Please enter the correct number.</span>
            {country === "KE" && <span className="block opacity-80">For example: 0712 345 678</span>}
          </p>
        </div>
      )}
    </div>
  );
}

/** true when the digits are a real number (used before sending) */
export function phoneOk(digits: string): boolean {
  const d = (digits || "").replace(/\D/g, "");
  return !!d && !!parsePhoneNumberFromString("+" + d)?.isValid();
}
