import { useRef, useState } from "react";
import { ImagePlus, Trash2, Loader2 } from "lucide-react";
import { API } from "@/pages/Feed";

const isUrl = (v: string) => /^https?:\/\//i.test(v);

/** Photo picker for the admin: shows the current photo, uploads a new one (Cloudinary) or removes it. "none" means no photo. */
export default function PhotoField({ value, onChange, adminKey, hint }: { value: string; onChange: (v: string) => void; adminKey: string; hint?: string }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const upload = async (f?: File) => {
    if (!f) return;
    setErr("");
    if (!f.type.startsWith("image/")) { setErr("Choose a photo (JPG or PNG)."); return; }
    setBusy(true);
    try {
      const s = await fetch(`${API}/api/admin/upload-sign`, { method: "POST", headers: { "x-admin-key": adminKey } }).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error ?? "Could not start the upload"); return d; });
      const form = new FormData();
      form.append("file", f); form.append("api_key", s.apiKey); form.append("timestamp", String(s.timestamp)); form.append("signature", s.signature); form.append("folder", s.folder);
      const r = await fetch(`https://api.cloudinary.com/v1_1/${s.cloudName}/image/upload`, { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok || !d.secure_url) throw new Error(d.error?.message ?? "Upload failed");
      onChange(String(d.secure_url).replace("/upload/", "/upload/f_auto,q_auto,w_1400/"));
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); }
    setBusy(false);
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted/50">
          {isUrl(value) ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
        </div>
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs text-muted-foreground">{value === "none" ? "Photo removed" : isUrl(value) ? "Custom photo" : "Using the site's default photo"}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => file.current?.click()} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} {busy ? "Uploading…" : "Upload photo"}
            </button>
            {(isUrl(value) || value === "") && <button type="button" onClick={() => onChange("none")} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-red-600"><Trash2 className="h-3.5 w-3.5" /> Remove photo</button>}
            {(isUrl(value) || value === "none") && <button type="button" onClick={() => onChange("")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">Use default</button>}
          </div>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
