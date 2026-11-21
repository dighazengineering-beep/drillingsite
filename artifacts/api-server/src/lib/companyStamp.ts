// The company's round-oval rubber stamp, drawn as a sharp vector image. Only the date in the middle changes (it is the day the contract was made).
// To change the wording on the stamp, edit the text below.
const BLUE = "#0b63d6";
const RED = "#e5122b";

/** "01 NOV 2026", in Nairobi time. */
export function stampDate(iso: string | Date): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "short", year: "numeric" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}`.toUpperCase();
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function stampSvg(dateText: string): string {
  const F = "'Times New Roman',Times,'Liberation Serif',serif";
  return `<svg class="stampimg" viewBox="0 0 360 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Company stamp, ${esc(dateText)}">
<g transform="rotate(-4 180 85)" font-family="${F}" text-anchor="middle">
<rect x="14" y="14" width="332" height="142" rx="12" fill="none" stroke="#1f2fd6" stroke-width="3.4"/>
<text x="180" y="43" font-size="19" fill="#1f2fd6" textLength="300" lengthAdjust="spacingAndGlyphs">DIGHAZ ENGINEERING LIMITED</text>
<text x="180" y="65" font-size="17" font-style="italic" fill="#1f2fd6">Rhapta Road, Nairobi</text>
<text x="180" y="100" font-size="30" fill="${RED}">${esc(dateText)}</text>
<text x="180" y="127" font-size="17" fill="#1f2fd6">Tel: 0719117660</text>
<text x="180" y="147" font-size="15.5" fill="#1f2fd6" textLength="280" lengthAdjust="spacingAndGlyphs">P.O. Box 147461, Westlands, 00800</text>
</g></svg>`;
}
