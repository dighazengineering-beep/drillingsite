// One shared text reader for the whole page. It is loaded from our own site (not an outside server) and started as soon as a form
// with a "Scan your ID" button opens, so by the time the client scans, it is ready.
export interface Ocr { recognize: (c: HTMLCanvasElement) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> }
let shared: Promise<Ocr> | null = null;

export function getOcr(): Promise<Ocr> {
  shared ??= import("tesseract.js")
    .then(({ createWorker }) => createWorker("eng", 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr/core", langPath: "/ocr/lang", gzip: true, workerBlobURL: false }) as unknown as Promise<Ocr>)
    .catch((e) => { shared = null; throw e; });
  return shared;
}
/** Start loading in the background. Safe to call many times. */
let users = 0; // several scan buttons can be on one page (one per director): the reader stops only when the last one goes
export function preloadOcr() { users++; void getOcr().catch(() => {}); }
export function releaseOcr() { if (--users > 0) return; users = 0; const s = shared; shared = null; void s?.then((w) => w.terminate()).catch(() => {}); }
// reader loads from /ocr (own site)
