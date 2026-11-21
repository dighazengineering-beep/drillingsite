// Compares what the client typed with the text read from the ID card. Pure functions, no camera or network.
export type IdMatch = "strong" | "weak" | "unverified";
export interface MatchResult { level: IdMatch | "fail"; idFound: boolean; namesFound: string[]; namesMissing: string[]; message: string }

const clean = (s: string) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const alnum = (s: string) => clean(s).replace(/[^A-Z0-9]/g, "");

function lev(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// letters the camera often confuses, so "O" and "0", "I" and "1" are treated the same when we compare ID numbers
const digitsLike = (s: string) => alnum(s).replace(/[OQD]/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2");

/** True when the typed ID number is found in the text read from the card (one wrong character is allowed for long numbers). */
export function idInText(typed: string, text: string): boolean {
  const t = digitsLike(typed);
  if (t.length < 5) return false;
  const body = digitsLike(text);
  if (body.includes(t)) return true;
  const allow = t.length >= 8 ? 1 : 0;
  if (!allow) return false;
  for (let i = 0; i + t.length - 1 <= body.length; i++) {
    for (const w of [t.length - 1, t.length, t.length + 1]) if (i + w <= body.length && lev(body.slice(i, i + w), t, 1) <= 1) return true;
  }
  return false;
}

/** The typed names that appear on the card. Order does not matter; a short typo is allowed in longer names. */
export function namesInText(typed: string, text: string): { found: string[]; missing: string[] } {
  const tokens = clean(typed).split(/[^A-Z]+/).filter((x) => x.length >= 2);
  const words = clean(text).split(/[^A-Z]+/).filter((x) => x.length >= 2);
  // the machine-readable strip on the back of new cards ("ANDATI<<SAMWE LL<<<") gets spaces inside names, so long names are also looked for with the spaces removed
  const squashed = clean(text).replace(/[^A-Z]/g, "");
  const found: string[] = [], missing: string[] = [];
  for (const t of tokens) {
    const max = t.length >= 7 ? 2 : t.length >= 5 ? 1 : 0;
    const inSquashed = t.length >= 5 && squashed.includes(t);
    (inSquashed || words.some((w) => w === t || (max > 0 && lev(w, t, max) <= max)) ? found : missing).push(t);
  }
  return { found, missing };
}

/** strong: ID number and the names are on the card. weak: only one of them. fail: neither. */
export function matchId(typedName: string, typedId: string, text: string): MatchResult {
  const idFound = idInText(typedId, text);
  const { found, missing } = namesInText(typedName, text);
  const tokens = found.length + missing.length;
  const needed = Math.min(2, tokens);
  const namesOk = tokens > 0 && found.length >= needed;
  if (idFound && namesOk) return { level: "strong", idFound, namesFound: found, namesMissing: missing, message: "ID number and names match." };
  if (idFound || namesOk) return { level: "weak", idFound, namesFound: found, namesMissing: missing, message: idFound ? "The ID number matches but the names could not be read clearly." : "The names match but the ID number could not be read clearly." };
  return { level: "fail", idFound, namesFound: found, namesMissing: missing, message: "We could not find your ID number or names on this card." };
}

/** Looks like the same card side as before? (tiny 16x16 greyscale fingerprints, as 0-255 arrays) */
export function sameSide(a: number[], b: number[]): boolean {
  if (a.length !== b.length || !a.length) return false;
  const bit = (v: number[]) => { const m = v.reduce((x, y) => x + y, 0) / v.length; return v.map((x) => (x > m ? 1 : 0)); };
  const x = bit(a), y = bit(b);
  let d = 0; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) d++;
  return d / x.length < 0.18;
}
