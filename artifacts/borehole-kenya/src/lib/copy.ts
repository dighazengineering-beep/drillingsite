/** Copy text to the clipboard. Works where navigator.clipboard is missing or refused (older phones, installed app, pop-up dialogs that trap focus). Returns true when it copied. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the older way */ }
  try {
    const host = (document.activeElement?.closest("[role=dialog]") as HTMLElement | null) ?? document.body;   // inside a dialog the box must be inside it, or the dialog steals the focus
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px";
    host.appendChild(ta);
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    host.removeChild(ta);
    return ok;
  } catch { return false; }
}
