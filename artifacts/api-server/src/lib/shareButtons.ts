// "Copy link" (and "Share" on phones) buttons for the public document pages: quote, contract and receipt.
// The links are full addresses (https://...), so they still open when pasted into WhatsApp, SMS or an email.
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface ShareLink { label: string; url: string }

/** Buttons to drop inside the page's ".btns" row. The first link is the one the phone's Share button sends. */
export function shareButtons(links: ShareLink[], title: string): string {
  const list = links.filter((l) => /^https?:\/\//.test(l.url));
  if (!list.length) return "";
  return `<style>.shr{border:1.5px solid #0a4fb3;background:#fff;color:#0a4fb3;font:600 13px Inter,Arial,sans-serif;padding:10px 18px;border-radius:10px;cursor:pointer}.shr:active{transform:scale(.98)}</style>`
    + list.map((l) => `<button type="button" class="shr" data-u="${esc(l.url)}">${esc(l.label)}</button>`).join("")
    + `<button type="button" class="shr" id="shr-share" data-u="${esc(list[0]!.url)}" style="display:none">Share</button>`
    + `<script>(function(){
var T=${JSON.stringify(title)};
function copy(u){
  if(navigator.clipboard&&window.isSecureContext){return navigator.clipboard.writeText(u);}
  return new Promise(function(ok,no){try{var a=document.createElement("textarea");a.value=u;a.setAttribute("readonly","");a.style.cssText="position:fixed;top:0;left:0;opacity:0";document.body.appendChild(a);a.select();var r=document.execCommand("copy");document.body.removeChild(a);r?ok():no();}catch(e){no(e);}});
}
[].forEach.call(document.querySelectorAll(".shr[data-u]"),function(b){
  if(b.id==="shr-share"){ if(navigator.share){b.style.display="";b.onclick=function(){navigator.share({title:T,url:b.getAttribute("data-u")}).catch(function(){});};} return; }
  b.onclick=function(){var u=b.getAttribute("data-u"),o=b.textContent;copy(u).then(function(){b.textContent="Link copied";setTimeout(function(){b.textContent=o;},1800);}).catch(function(){window.prompt("Copy this link",u);});};
});
})();</script>`;
}
