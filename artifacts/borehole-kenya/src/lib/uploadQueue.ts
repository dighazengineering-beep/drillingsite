import { useSyncExternalStore } from "react";

// A background upload queue, like Facebook's: add as many files as you like, they upload one at a time while you keep working.
// It lives outside any page, so closing the upload sheet or moving around the site does not stop the uploads.
export type QStatus = "queued" | "uploading" | "done" | "error" | "cancelled";
export interface QItem { id: number; name: string; size: number; status: QStatus; pct: number; error?: string; title?: string }
type Run = (onPct: (n: number) => void, onAbort: (abort: () => void) => void) => Promise<{ title?: string } | void>;
interface Internal extends QItem { run: Run; abort?: () => void }

let items: Internal[] = [];
let snapshot: QItem[] = [];
let nextId = 1;
const subs = new Set<() => void>();
const finishSubs = new Set<(i: QItem) => void>();

const strip = ({ run: _r, abort: _a, ...rest }: Internal): QItem => rest;
const emit = () => { snapshot = items.map(strip); subs.forEach((f) => f()); };

function pump() {
  if (items.some((i) => i.status === "uploading")) return; // one at a time
  const next = items.find((i) => i.status === "queued");
  if (!next) return;
  next.status = "uploading"; next.pct = 0; next.error = undefined; emit();
  next.run((n) => { next.pct = Math.max(0, Math.min(100, Math.round(n))); emit(); }, (a) => { next.abort = a; })
    .then((r) => { if (next.status === "cancelled") return; next.status = "done"; next.pct = 100; if (r && r.title) next.title = r.title; emit(); finishSubs.forEach((f) => f(strip(next))); })
    .catch((e: unknown) => { if (next.status === "cancelled") return; next.status = "error"; next.error = e instanceof Error ? e.message : "Upload failed"; emit(); finishSubs.forEach((f) => f(strip(next))); })
    .finally(() => { next.abort = undefined; pump(); });
}

export function enqueueUploads(entries: { name: string; size: number; run: Run }[]) {
  for (const e of entries) items.push({ id: nextId++, name: e.name, size: e.size, status: "queued", pct: 0, run: e.run });
  emit(); pump();
}
export function retryUpload(id: number) { const i = items.find((x) => x.id === id); if (i && (i.status === "error" || i.status === "cancelled")) { i.status = "queued"; i.error = undefined; emit(); pump(); } }
export function cancelUpload(id: number) {
  const i = items.find((x) => x.id === id);
  if (!i || i.status === "done") return;
  const wasUploading = i.status === "uploading";
  i.status = "cancelled"; emit();
  if (wasUploading) { i.abort?.(); pump(); }
}
export function removeUpload(id: number) { items = items.filter((x) => x.id !== id || x.status === "uploading"); emit(); }
export function clearFinishedUploads() { items = items.filter((x) => x.status === "queued" || x.status === "uploading"); emit(); }
export function onUploadFinished(fn: (i: QItem) => void) { finishSubs.add(fn); return () => { finishSubs.delete(fn); }; }
export function useUploadQueue(): QItem[] {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => snapshot, () => snapshot);
}

// Warn before the page is closed while something is still uploading
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => { if (items.some((i) => i.status === "uploading" || i.status === "queued")) { e.preventDefault(); e.returnValue = ""; } });
}
