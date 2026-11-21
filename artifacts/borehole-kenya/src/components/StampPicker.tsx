import { useState } from "react";
import { Upload, X } from "lucide-react";
import { readFile, removeBackground } from "@/lib/inkImage";

// Upload a photo of a stamp: the paper is removed, only the stamp ink stays (in its own colour).
export default function StampPicker({ value, onChange }: { value: string; onChange: (png: string) => void }) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const pick = async (f?: File) => {
    if (!f) return; setBusy(true); setMsg("");
    try {
      const src = await readFile(f);
      let png = await removeBackground(src, "keep", 460);
      if (png.length > 280_000) png = await removeBackground(src, "keep", 320);
      if (png.length > 290_000) throw new Error("That picture is too detailed. Try a simpler photo.");
      onChange(png);
    } catch (e) { onChange(""); setMsg(String((e as Error).message || e)); }
    setBusy(false);
  };
  return (
    <div className="text-xs">
      <div className="flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1 rounded-full border border-border px-3 py-1.5 font-bold transition active:scale-95"><Upload className="h-3.5 w-3.5" /> {value ? "Change stamp picture" : "Upload a stamp picture"}<input type="file" accept="image/*" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} /></label>
        {value && <button type="button" onClick={() => onChange("")} className="flex items-center gap-1 font-bold text-muted-foreground"><X className="h-3.5 w-3.5" /> Remove</button>}
      </div>
      {busy && <p className="mt-1 font-semibold text-muted-foreground">Removing the background...</p>}
      {msg && <p className="mt-1 font-semibold text-red-600" role="alert">{msg}</p>}
      {value && <div className="mt-2 inline-block rounded-lg border border-border p-2" style={{ backgroundImage: "conic-gradient(#e5e7eb 25%, #fff 0 50%, #e5e7eb 0 75%, #fff 0)", backgroundSize: "14px 14px" }}><img src={value} alt="Stamp" className="max-h-24" /></div>}
    </div>
  );
}
