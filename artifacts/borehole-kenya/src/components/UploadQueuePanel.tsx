import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, RotateCw, UploadCloud, X, AlertCircle } from "lucide-react";
import { cancelUpload, clearFinishedUploads, onUploadFinished, removeUpload, retryUpload, useUploadQueue } from "@/lib/uploadQueue";
import { toast } from "@/hooks/use-toast";

// The small "uploading" box in the corner: every file, its progress, and a notice when each one is done.
export default function UploadQueuePanel() {
  const items = useUploadQueue();
  const [open, setOpen] = useState(true);

  useEffect(() => onUploadFinished((i) => {
    if (i.status === "done") toast({ title: "Video posted ✓", description: i.title || i.name });
    else if (i.status === "error") toast({ title: "Upload failed", description: `${i.name}: ${i.error ?? "please try again"}`, variant: "destructive" });
  }), []);

  if (!items.length) return null;
  const active = items.filter((i) => i.status === "uploading" || i.status === "queued");
  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "error").length;
  const current = items.find((i) => i.status === "uploading");
  const head = active.length ? `Uploading ${Math.min(items.length, done + failed + (current ? 1 : 0))} of ${items.length}` : failed ? `${done} posted, ${failed} failed` : `All ${done} posted ✓`;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-[80] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:left-auto sm:w-80" data-testid="upload-queue">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 bg-primary px-3.5 py-2.5 text-left text-sm font-bold text-primary-foreground">
        <UploadCloud className="h-4 w-4 shrink-0" /> <span className="flex-1">{head}</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
      {open && (
        <div className="max-h-[50dvh] overflow-y-auto">
          {items.map((i) => (
            <div key={i.id} className="border-t border-border px-3.5 py-2.5 first:border-t-0">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{i.name}</p>
                {i.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                {i.status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />}
                {i.status === "error" && <button type="button" onClick={() => retryUpload(i.id)} aria-label="Try again" className="rounded p-1 text-primary"><RotateCw className="h-3.5 w-3.5" /></button>}
                {i.status === "cancelled" && <button type="button" onClick={() => retryUpload(i.id)} aria-label="Upload again" className="rounded p-1 text-primary"><RotateCw className="h-3.5 w-3.5" /></button>}
                {(i.status === "queued" || i.status === "uploading") && <button type="button" onClick={() => cancelUpload(i.id)} aria-label="Cancel this upload" className="rounded p-1 text-muted-foreground hover:text-red-600"><X className="h-3.5 w-3.5" /></button>}
                {(i.status === "done" || i.status === "error" || i.status === "cancelled") && <button type="button" onClick={() => removeUpload(i.id)} aria-label="Remove from list" className="rounded p-1 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}
              </div>
              {i.status === "uploading" && (
                <div className="mt-1.5"><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${i.pct}%` }} /></div><p className="mt-0.5 text-[11px] text-muted-foreground">{i.pct}% · keep this page open</p></div>
              )}
              {i.status === "queued" && <p className="mt-0.5 text-[11px] text-muted-foreground">Waiting its turn… · {(i.size / 1048576).toFixed(1)} MB</p>}
              {i.status === "done" && <p className="mt-0.5 text-[11px] font-semibold text-emerald-700">Posted</p>}
              {i.status === "error" && <p className="mt-0.5 text-[11px] text-red-600">{i.error}</p>}
              {i.status === "cancelled" && <p className="mt-0.5 text-[11px] text-muted-foreground">Cancelled</p>}
            </div>
          ))}
          {!active.length && <button type="button" onClick={clearFinishedUploads} className="w-full border-t border-border py-2 text-xs font-bold text-primary">Clear list</button>}
        </div>
      )}
    </div>
  );
}
