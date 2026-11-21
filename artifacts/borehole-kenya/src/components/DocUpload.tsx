import { useState } from "react";
import { Paperclip, X } from "lucide-react";
import { API } from "@/lib/member";

export interface Doc { url: string; name: string }
const lab = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground";

/** One optional document upload (photo or PDF). The file goes straight from the browser to our storage with a one-use signature from the server. */
export default function DocUpload({ label, hint, value, onChange, onError, testId }: { label: string; hint: string; value: Doc | null; onChange: (d: Doc | null) => void; onError: (m: string) => void; testId: string }) {
  const [busy, setBusy] = useState(false);
  const pick = async (file?: File) => {
    if (!file) return;
    onError("");
    if (file.size > 10 * 1024 * 1024) return onError("That file is too big. Please use a file under 10 MB.");
    if (!/^(image\/|application\/pdf)/.test(file.type)) return onError("Please choose a photo or a PDF.");
    setBusy(true);
    try {
      const sr = await fetch(`${API}/api/quotes/report-sign`, { method: "POST" });
      const s = await sr.json().catch(() => ({}));
      if (!sr.ok) throw new Error(s.error || "Could not start the upload.");
      const form = new FormData();
      form.append("file", file); form.append("api_key", s.apiKey); form.append("timestamp", String(s.timestamp)); form.append("signature", s.signature); form.append("folder", s.folder);
      const ur = await fetch(`https://api.cloudinary.com/v1_1/${s.cloudName}/auto/upload`, { method: "POST", body: form });
      const u = await ur.json().catch(() => ({}));
      if (!ur.ok || !u.secure_url) throw new Error("The upload failed. Please try again.");
      onChange({ url: String(u.secure_url), name: file.name });
    } catch (e) { onError((e as Error).message); }
    setBusy(false);
  };
  return (
    <div>
      <label className={lab}>{label} (optional)</label>
      {value ? (
        <p className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><span className="truncate">✓ {value.name}</span><button type="button" onClick={() => onChange(null)} aria-label={`Remove ${label}`}><X className="h-4 w-4" /></button></p>
      ) : (
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs font-bold text-primary">
          <Paperclip className="h-4 w-4" /> {busy ? "Uploading…" : "Attach (photo or PDF)"}
          <input type="file" accept="image/*,application/pdf" className="hidden" disabled={busy} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} data-testid={testId} />
        </label>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
