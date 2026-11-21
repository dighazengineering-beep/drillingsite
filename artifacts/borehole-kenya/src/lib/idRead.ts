// Pulls the holder's name and ID number out of the text read from an ID card (front and back together).
export interface IdFields { idNo: string; name: string; confidence: "strong" | "weak" | "none" }

const up = (s: string) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\s+/g, " ").trim();
const fixDigits = (s: string) => s.replace(/[OQD]/g, "0").replace(/[IL|]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2");

/** ICAO 7-3-1 check digit, as printed on the machine-readable strip of new cards. */
export function mrzCheck(field: string): number {
  const w = [7, 3, 1]; let sum = 0;
  for (let i = 0; i < field.length; i++) { const c = field[i]; const v = c === "<" ? 0 : /\d/.test(c) ? +c : c.charCodeAt(0) - 55; sum += v * w[i % 3]; }
  return sum % 10;
}

function lev(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length];
}

/** From the strip on the back of the new Maisha card: "IDKEN34840810<4<..." and "ANDATI<<SAMWEL<<<<". */
function fromStrip(raw: string): { idNo: string; checked: boolean; surname: string; given: string } {
  const t = up(raw); let idNo = "", checked = false, surname = "", given = "";
  const m = /[I1L]D\s?K\s?E\s?N\s?([0-9OQDIL|SBZ<]{9})\s?(\d)?/.exec(t);
  if (m) {
    const f = fixDigits(m[1].replace(/</g, "<")).replace(/[^0-9<]/g, ""); const digits = f.replace(/</g, "");
    if (digits.length >= 7) { idNo = digits; checked = f.length === 9 && m[2] !== undefined && mrzCheck(f) === +m[2]; }
  }
  const n = /([A-Z]{2,})<<([A-Z< ]{3,})/.exec(t.replace(/[^A-Z<\n ]/g, " ").split("\n").find((l) => /[A-Z]{2,}\s?<\s?<\s?[A-Z]/.test(l)) ?? "");
  if (n) {
    surname = n[1];
    let g = n[2].split("<")[0].replace(/\s+/g, "");
    g = g.replace(/[LKC]{3,}$/, "");
    given = g;
  }
  return { idNo, checked, surname, given };
}

/** Looks for words after a label on the front of a card (SURNAME, GIVEN NAME, FULL NAMES). */
function afterLabel(lines: string[], label: RegExp, take = 1): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!label.test(lines[i])) continue;
    const rest = lines[i].replace(label, "").replace(/[^A-Z' -]/g, " ").trim();
    const STOP = /DATE|BIRTH|\bSEX\b|DISTRICT|PLACE|ISSUE|EXPIR|NATIONALITY|NUMBER|SIGN|HOLDER/;
    const next: string[] = []; for (const l of lines.slice(i + 1, i + 3)) { if (STOP.test(l)) break; next.push(l); }
    const parts = [STOP.test(rest) ? "" : rest, ...next].map((l) => l.replace(/[^A-Z' -]/g, " ").replace(/\s+/g, " ").trim()).filter((l) => l.replace(/[^A-Z]/g, "").length >= 3);
    out.push(...parts.slice(0, take)); break;
  }
  return out;
}

export function readIdFields(text: string): IdFields {
  const lines = up(text).split("\n").map((l) => l.trim()).filter(Boolean);
  const strip = fromStrip(text);
  // ID number: the strip (with a good check digit) first, then a 7-9 digit number printed on the card
  const printed = [...up(text).matchAll(/(?<![\d.\/])(\d{7,9})(?![\d.\/])/g)].map((x) => x[1]);
  let idNo = "", level: "strong" | "weak" | "none" = "none";
  if (strip.idNo && strip.checked) { idNo = strip.idNo; level = "strong"; }
  else if (strip.idNo && printed.includes(strip.idNo)) { idNo = strip.idNo; level = "strong"; }
  else if (printed.length) { idNo = printed[0]; level = "weak"; }
  else if (strip.idNo) { idNo = strip.idNo; level = "weak"; }

  // names: the front says SURNAME / GIVEN NAME (new card) or FULL NAMES (old card); the strip has both too
  const sFront = afterLabel(lines, /SUR\s?NAME/)[0] ?? "";
  const gFront = afterLabel(lines, /GIVEN\s?NAME/)[0] ?? "";
  const fullFront = afterLabel(lines, /FULL\s?NAMES?/, 2).join(" ");
  const squashedAll = lines.filter((l) => !l.includes("<")).join("").replace(/[^A-Z]/g, ""); // letters printed on the card itself, not the strip
  const pick = (stripWord: string, frontWord: string) => {
    let w = stripWord.replace(/\s+/g, "");
    if (w && /([A-Z])\1$/.test(w) && !squashedAll.includes(w)) w = w.slice(0, -1); // a "<" misread as a letter at the end of the strip
    const f = frontWord.replace(/\s+/g, " ").trim();
    if (w && f) { const near = f.split(" ").find((x) => x.length >= 3 && lev(x, w) <= 2); if (near) return w; }
    return w.length >= 3 ? w : f.length >= 3 ? f : "";
  };
  const surname = pick(strip.surname, sFront), given = pick(strip.given, gFront);
  let name = "";
  if (surname && given) name = title(`${given} ${surname}`);
  else if (fullFront.split(" ").filter((x) => x.length >= 2).length >= 2) name = title(fullFront);
  else if (surname || given) name = title(surname || given);
  // never fill a guess: every word must be a real-looking name (3+ letters, no stray bits), and there must be at least two words
  const words = name.split(" ").filter(Boolean);
  if (words.length < 2 || words.some((w) => w.length < 3 || !/[AEIOUYaeiouy]/.test(w))) name = "";
  if (name && level !== "none") level = level === "strong" && surname && given ? "strong" : "weak";
  else if (name && level === "none") level = "weak";
  return { idNo, name, confidence: idNo || name ? level : "none" };
}

/** Does this look like an ID or passport at all? (so a clear scan is never refused only because the print is hard to read) */
export function looksLikeId(text: string): boolean {
  const t = up(text);
  return /KENYA|JAMHURI|KITAMBULISHO|IDENTITY|REPUBLIC|DRIVING|LICEN[CS]E|PASSPORT|PASI|MAISHA|NAMBA|HUDUMA|DEFENCE|MILITARY|SURNAME|GIVEN NAME|DATE OF BIRTH|ID NUMBER|FULL NAMES/.test(t) || /(?<![\d.\/])\d{7,9}(?![\d.\/])/.test(t);
}
