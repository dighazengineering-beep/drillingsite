import { shareButtons } from "./shareButtons";
import { companyInfo } from "./company";
import { stampSvg, stampDate } from "./companyStamp";
import { RECEIPT_LOGO_B64 } from "./receiptLogo";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const kes = (n: number) => `KSh ${Math.round(n).toLocaleString("en-KE")}`;

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100, parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push(`${h ? "and " : ""}${r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : "")}`);
  return parts.join(" ");
}
/** 16500 -> "Sixteen thousand five hundred shillings only" */
export function amountInWords(n: number): string {
  n = Math.round(n);
  if (n <= 0) return "Zero shillings only";
  const groups: [number, string][] = [[1_000_000_000, "billion"], [1_000_000, "million"], [1000, "thousand"]];
  const out: string[] = [];
  for (const [v, name] of groups) { const k = Math.floor(n / v); if (k) { out.push(`${below1000(k)} ${name}`); n -= k * v; } }
  if (n) out.push(out.length && n < 100 ? `and ${below1000(n)}` : below1000(n));
  const s = out.join(" ");
  return `${s[0].toUpperCase()}${s.slice(1)} shillings only`;
}

/** Receipt book numbers: the first book runs 120 to 520, the next 120A to 520A, then 120B to 520B ... (n is the receipt's count, 1 = the first ever). */
export const BOOK_FIRST = 120, BOOK_LAST = 520;
export function receiptLabel(n: number): string {
  const size = BOOK_LAST - BOOK_FIRST + 1, i = Math.max(1, Math.round(n)) - 1, book = Math.floor(i / size), pos = BOOK_FIRST + (i % size);
  let suffix = "";
  for (let b = book; b > 0; b = Math.floor((b - 1) / 26)) suffix = String.fromCharCode(65 + ((b - 1) % 26)) + suffix;
  return `${pos}${suffix}`;
}

export interface ReceiptData {
  no: string; date: Date; name: string; phone: string; item: string; stepLabel?: string; contractNo?: string;
  method: string; reference: string; note?: string; amount: number; services: string[]; receivedBy?: string;
}
const METHODS: Record<string, string> = { cash: "Cash", cheque: "Cheque", mpesa: "M-Pesa", bank: "Bank" };
export const methodName = (m: string) => METHODS[m] ?? m;
export const RECEIPT_COMPANY = () => (process.env.RECEIPT_COMPANY_NAME || "DIGHAZ ENGINEERING LIMITED").trim();
export const OFFICE = () => (process.env.COMPANY_OFFICE || "Muguku Business Center, 4th Floor, Wing A, Room R4, Kikuyu Town").trim();
const HOURS = () => (process.env.COMPANY_HOURS || "Mon-Sat 8am-5pm, closed Sunday").trim();

/** The services the company offers, with the one this receipt is for first. */
export function orderServices(all: string[], item: string): string[] {
  const names = [...new Set(all.map((x) => x.trim()).filter(Boolean))];
  const it = item.toLowerCase();
  let first = names.find((n) => it.includes(n.toLowerCase()));
  if (!first) {
    const key = /survey|hydro/.test(it) ? /survey|hydro/i : /flush/.test(it) ? /flush/i : /test\s*pump/.test(it) ? /test\s*pump/i : /pump/.test(it) ? /pump.*install|install.*pump/i : /purif|osmosis|treat/.test(it) ? /purif|osmosis|treat/i : /solar/.test(it) ? /solar/i : /drill/.test(it) ? /drill/i : null;
    if (key) first = names.find((n) => key.test(n));
  }
  return first ? [first, ...names.filter((n) => n !== first)] : names;
}

/** A receipt-book style receipt: small landscape page, thin small print, only the company name in bold blue. */
export function receiptHtml(d: ReceiptData, embed = false, shareUrl = "", report?: { url: string; name: string; title: string }): string {
  const co = companyInfo();
  const name = RECEIPT_COMPANY();
  const phone2 = (process.env.COMPANY_PHONE2 || "+254 110 699 444").trim();
  const wa = co.whatsapp ? `+${co.whatsapp}` : co.phone;
  const site = co.website.replace(/^https?:\/\//, "");
  const ico = (bg: string, path: string) => `<svg viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="12" fill="${bg}"/><g transform="translate(4.5 4.5) scale(.62)" fill="#fff"><path d="${path}"/></g></svg>`;
  const PH = "M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z";
  const mail = `<svg viewBox="0 0 24 24" width="26" height="26"><rect x="1" y="5" width="22" height="14" rx="2" fill="#fff" stroke="#0b3a8c" stroke-width="1.6"/><path d="M2 6.5l10 7 10-7" fill="none" stroke="#0b3a8c" stroke-width="1.6"/></svg>`;
  const globe = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#0b3a8c" stroke-width="1.6"><circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4.2" ry="10"/><path d="M2 12h20M4 7h16M4 17h16"/></svg>`;
  const methods: [string, string][] = [["cash", "Cash"], ["card", "Credit Card"], ["bank", "Bank Transfer"], ["cheque", "Cheque"], ["mpesa", ""]];
  const boxes = methods.map(([m, l]) => `<span class="bx${d.method === m ? " on" : ""}"><i>${d.method === m ? "&#10003;" : ""}</i>${l || '<b class="mp">M-PESA</b>'}</span>`).join("");
  const forWhat = [d.item, d.stepLabel ? `- ${d.stepLabel}` : "", d.contractNo ? `, Contract ${d.contractNo}` : ""].join(" ").replace(/\s+,/g, ",").trim();
  const by = d.receivedBy || co.signatoryName;
  const wmSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="64" viewBox="0 0 300 64"><text x="150" y="38" text-anchor="middle" transform="rotate(-8 150 34)" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="15" letter-spacing="1" fill="#0b3a8c" fill-opacity="0.12">${esc(name)}</text></svg>`;
  const wmTile = `data:image/svg+xml,${encodeURIComponent(wmSvg)}`;
  const fill = (label: string, v: string) => `<div class="f"><span>${label}</span><u>${esc(v)}</u></div>`;
  const ref = [d.reference ? `Ref: ${d.reference}` : "", d.note ?? ""].filter(Boolean).join(" · ");
  const amt = `${Math.round(d.amount).toLocaleString("en-KE")}/=`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt ${esc(d.no)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap" rel="stylesheet"><style>
:root{--navy:#0b3a8c;--ink:#0f172a;--mut:#475569;--hole:#cfd6e2}
*{box-sizing:border-box}body{margin:0;background:#e8edf4;font:500 12.5px/1.25 "Barlow Semi Condensed","Arial Narrow",Arial,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased;padding:16px 8px 24px}
.wrap{display:flex;justify-content:center}
.sheet{width:760px;flex:none;background:linear-gradient(90deg,#f3f1ea 0,#fffefb 46px,#fff 90px);border:1px solid #cbd5e1;box-shadow:0 8px 26px rgba(15,23,42,.14);position:relative;padding:7px 22px 5px 46px;overflow:hidden}
/* the left edge of a receipt book: the torn perforation with its punched holes */
.wm{position:absolute;inset:0;pointer-events:none;background-image:url("${wmTile}");background-size:300px 64px}
.sheet>*:not(.wm):not(.perf){position:relative}
.perf{position:absolute;left:0;top:0;bottom:0;width:16px;background:radial-gradient(circle at 0 50%,var(--page) 0,var(--page) 7px,transparent 7.7px) 0 0/16px 21px repeat-y}
.perf:before{content:"";position:absolute;left:16px;top:0;bottom:0;border-left:1.5px dashed #c3ccdb}
.perf:after{content:"";position:absolute;left:0;top:0;bottom:0;width:26px;background:linear-gradient(90deg,rgba(15,23,42,.07),transparent)}
.sheet{--page:#e8edf4}.sheet.cap{--page:#fff}
.top{display:flex;align-items:center;justify-content:space-between;gap:8px}.lg{height:66px;width:auto;flex:none;display:block}.nm{flex:1;min-width:0;white-space:nowrap;display:flex;align-items:center;gap:.28em;height:66px;margin-left:4px;font:800 29px/1 "Barlow Semi Condensed","Arial Narrow",Arial,sans-serif;color:#0b3a8c;letter-spacing:.01em}.nm b{font-weight:800;display:inline}.nm b.g{color:#1a9a3c}.loc{font-weight:700}.vr{width:3px;align-self:stretch;background:var(--navy);margin:0}
.ct{list-style:none;margin:2px 0 3px;padding:0;display:flex;justify-content:center;align-items:center;gap:14px}.ct li{display:flex;align-items:center;gap:5px;font-weight:500;font-size:9px;color:var(--navy);margin:0;white-space:nowrap}
.rt{flex:none;width:150px;text-align:left}.pill{background:var(--navy);color:#fff;font:700 22px/1 "Barlow Semi Condensed","Arial Narrow",Arial,sans-serif;letter-spacing:.06em;text-align:center;padding:4px 0;border-radius:7px}
.nr{display:flex;align-items:center;gap:6px;margin-top:3px}.nr b,.dr b{font-weight:600;color:var(--navy);font-size:13px}.nb{flex:1;border:1.5px solid var(--navy);border-radius:8px;text-align:center;font:700 17px/1.2 "Barlow Semi Condensed","Arial Narrow",Arial,sans-serif;color:#d0202a}
.dr{display:flex;align-items:baseline;gap:8px;margin-top:1px}.dr u{flex:1;text-decoration:none;border-bottom:1px solid var(--navy);font-size:11px;color:var(--ink);padding:0 4px;white-space:nowrap}
.svc{text-align:center;font-weight:500;font-size:10.5px;color:var(--navy);margin:4px 0 4px;line-height:1.35}.svc i{font-style:normal;margin:0 6px}
hr{border:0;border-top:1.5px solid var(--navy);margin:0}
.f{display:flex;align-items:flex-end;gap:8px;margin:4px 0}.f span{flex:none;width:112px;white-space:nowrap;font-weight:600;color:var(--navy);font-size:14px}.f u{flex:1;text-decoration:none;border-bottom:1px solid var(--navy);padding:0 5px 0;font-size:12.5px;color:var(--ink);min-height:16px;font-weight:500}
.mid{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:0}.pmw{flex:1}
.pmr{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:3px}.pmr>b{white-space:nowrap;font-weight:600;color:var(--navy);font-size:14px;flex:none}.bxs{display:flex;flex-wrap:wrap;gap:4px 12px}
.bx{display:inline-flex;align-items:center;gap:5px;color:var(--navy);font-size:12.5px;font-weight:500}.bx i{width:14px;height:14px;border:1.3px solid var(--navy);border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font:700 11px/1 Arial,sans-serif;font-style:normal;color:#fff}.bx.on i{background:var(--navy)}.mp{color:#1a9a3c;font-weight:700;font-size:13px}
.paid{display:flex;align-items:stretch;margin-top:12px;width:330px;max-width:100%;background:var(--navy);border-radius:9px;overflow:hidden;border:1.5px solid var(--navy)}.paid b{color:#fff;font:600 14px/1 "Barlow Semi Condensed","Arial Narrow",Arial,sans-serif;padding:8px 10px;display:flex;align-items:center;flex:none}.paid u{flex:1;text-decoration:none;background:#fff;border-radius:7px 0 0 7px;padding:4px 10px;font:700 15px/1.3 "Barlow Semi Condensed","Arial Narrow",Arial,sans-serif;color:var(--ink)}
.sg{flex:none;width:168px;text-align:center;margin-top:-6px}.sg svg{width:165px;height:auto;display:block;margin:0 auto}.sg small{display:block;font-size:9.5px;color:var(--mut);margin-top:0}
.rf{font-size:10px;color:var(--mut);margin-top:0}
.thx{text-align:center;font:600 13px/1.2 "Barlow Semi Condensed","Arial Narrow",Arial,sans-serif;color:var(--navy);letter-spacing:.02em;margin-top:2px}.thx small{display:block;font-weight:500;font-size:10px;color:var(--mut);letter-spacing:0;margin-top:1px}
.foot{text-align:center;font-size:9px;color:var(--mut);margin-top:3px;border-top:1px solid #e2e8f0;padding-top:2px}
.btns{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:14px}.btns button{border:0;background:var(--navy);color:#fff;font:500 13px Inter,Arial,sans-serif;padding:11px 26px;border-radius:10px;cursor:pointer}.btns button.alt{background:#fff;color:var(--navy);border:1.5px solid var(--navy)}.btns button:disabled{opacity:.6}.sheet.cap{box-shadow:none;border:0}
@page{size:200mm 100mm;margin:4mm}@media print{.sheet{--page:#fff}body{background:#fff;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{box-shadow:none;width:100%;border:0}.btns{display:none}}
${embed ? "body{background:#fff;overflow:hidden}.sheet{box-shadow:none;--page:#fff}" : ""}</style></head><body>${report ? `<div style="max-width:760px;margin:0 auto 14px;background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:16px 20px;text-align:center;font:400 13px Inter,Arial,sans-serif"><div style="font-weight:600;font-size:15px;margin-bottom:4px">${esc(report.title)}</div><div style="color:#475569;margin-bottom:12px">Thank you for your payment. Tap the button to download your report. Your receipt downloads with it as a separate PDF.</div><button id="rp" style="border:0;background:#0a5cb8;color:#fff;font:600 14px Inter,Arial,sans-serif;padding:12px 30px;border-radius:10px;cursor:pointer">Download report and receipt</button><div style="color:#64748b;font-size:11px;margin-top:8px">If your phone asks to allow multiple downloads, tap Allow.</div></div>` : ""}<div class="wrap"><div class="sheet" id="sh">
<div class="wm"></div><div class="perf"></div>
<div class="top"><img class="lg" src="data:image/png;base64,${RECEIPT_LOGO_B64}" alt="${esc(name)}"><div class="nm"><b>DIGHAZ</b><b class="g">ENGINEERING</b><b>LIMITED</b></div>
<div class="rt"><div class="pill">RECEIPT</div><div class="nr"><b>No.</b><span class="nb">${esc(d.no)}</span></div></div></div>
<div class="svc">Dealers in ${d.services.map((x) => esc(x)).join("<i>|</i>")}${d.services.length ? "<i>|</i>etc..." : ""}${d.services.length ? "<i>|</i>" : ""}<b class="loc">Located in ${esc((co.address || "Rhapta Road, Nairobi").replace(/\s*\(.*$/, ""))}</b></div>
<ul class="ct"><li>${ico("#25a244", PH)}${esc(wa)}</li><li>${ico("#d62828", PH)}${esc(phone2)}</li><li>${mail}${esc(co.email)}</li><li>${globe}${esc(site)}</li></ul>
<hr>
${fill("Received From:", d.name + (d.phone ? `  ·  ${String(d.phone).replace(/^\+/, "").replace(/^(254)(\d{3})(\d{3})(\d{3})$/, "+$1 $2 $3 $4")}` : ""))}
${fill("Amount:", `KSh ${amt}`)}
${fill("In Word:", amountInWords(d.amount))}
${fill("For:", forWhat)}
<div class="pmr"><b>Payment Method:</b><div class="bxs">${boxes}</div></div>
<div class="mid"><div class="pmw"><div class="paid"><b>Amount Paid:</b><u>KSh ${amt}</u></div></div>
<div class="sg">${stampSvg(stampDate(d.date))}<small>Received by: ${esc(by)}</small></div></div>
${ref ? `<div class="rf">${esc(ref)}</div>` : ""}
<div class="thx">Thank you for choosing ${esc(name)}<small>Water for life. We drill, you drink.</small></div>
<div class="foot">This receipt is computer generated and valid with the company stamp.</div>
</div></div>${embed ? "" : `<div class="btns"><button id="dl">Download PDF</button>${shareButtons([{ label: "Copy link", url: shareUrl }], `Receipt ${d.no}`)}</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" defer></script><script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" defer></script>
<script>(function(){var b=document.getElementById("dl");if(!b)return;var NO=${JSON.stringify(String(d.no).replace(/[^A-Za-z0-9-]/g, ""))};
// A real PDF exactly the size of the receipt (200 mm wide, as tall as the receipt), so it never turns into an A4 page, whatever the phone or browser
b.onclick=async function(){var s=document.getElementById("sh"),t=b.textContent;if(!window.html2canvas||!window.jspdf){alert("The PDF tool is still loading. Wait a moment and try again.");return;}
b.disabled=true;b.textContent="Making PDF…";var z=s.style.zoom;s.style.zoom="";s.classList.add("cap");
try{var c=await window.html2canvas(s,{scale:4,backgroundColor:"#ffffff",useCORS:true,logging:false});var W=210,H=297,rw=190,rh=Math.round(rw*c.height/c.width*10)/10,rx=(W-rw)/2,ry=(H-rh)/2;
/* a soft blurred copy of the receipt fills the page behind it, so the receipt looks like a picture lying on the sheet */
var bg=document.createElement("canvas");bg.width=1240;bg.height=1754;var g=bg.getContext("2d");
var k=Math.max(bg.width/c.width,bg.height/c.height);g.filter="blur(28px)";g.drawImage(c,(bg.width-c.width*k)/2,(bg.height-c.height*k)/2,c.width*k,c.height*k);g.filter="none";
g.fillStyle="rgba(71,85,105,.5)";g.fillRect(0,0,bg.width,bg.height);
var px=bg.width/W;g.shadowColor="rgba(15,23,42,.35)";g.shadowBlur=38;g.shadowOffsetY=10;g.fillStyle="#fff";g.fillRect(rx*px,ry*px,rw*px,rh*px);
var pdf=new window.jspdf.jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true});
pdf.addImage(bg.toDataURL("image/jpeg",0.85),"JPEG",0,0,W,H);pdf.addImage(c.toDataURL("image/jpeg",0.98),"JPEG",rx,ry,rw,rh);pdf.save("Receipt-"+NO+".pdf");}
catch(e){alert("Could not make the PDF. Please try again.");}
s.classList.remove("cap");s.style.zoom=z;b.disabled=false;b.textContent=t;};})();</script>
<script>(function(){var s=document.getElementById("sh");function f(){var k=Math.min(1,(window.innerWidth-16)/760);s.style.zoom=k<1?k:"";}f();addEventListener("resize",f);addEventListener("beforeprint",function(){s.style.zoom=""});addEventListener("afterprint",f)})()</script>
`}${report ? `<script>(function(){var r=document.getElementById("rp");if(!r)return;r.onclick=function(){var a=document.createElement("a");a.href=${JSON.stringify(report.url)};a.download=${JSON.stringify(report.name)};document.body.appendChild(a);a.click();a.remove();setTimeout(function(){var d=document.getElementById("dl");if(d)d.click();},1300);};})();</script>` : ""}</body></html>`;
}
