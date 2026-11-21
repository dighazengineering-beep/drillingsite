// Finds an ID card (a rectangle) in the live camera picture and flattens it, like a document-scanner app.
// Uses OpenCV, hosted on our own site (/ocr/opencv.js) and loaded only when the scanner opens. If it cannot load, the scanner
// falls back to its normal frame-based snapping, so nothing breaks.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt]; // top-left, top-right, bottom-right, bottom-left

let loading: Promise<any> | null = null;
export function loadCv(): Promise<any> {
  loading ??= new Promise<any>((ok, no) => {
    const w = window as any;
    const ready = async () => { try { const c = await w.cv; if (c?.Mat) ok(c); else no(new Error("cv")); } catch (e) { no(e as Error); } };
    if (w.cv) { void ready(); return; }
    const s = document.createElement("script"); s.src = "/ocr/opencv.js"; s.async = true;
    s.onload = () => void ready(); s.onerror = () => no(new Error("cv load"));
    document.head.appendChild(s);
  }).catch((e) => { loading = null; throw e; });
  return loading;
}
export const preloadCv = () => { void loadCv().catch(() => {}); };

const order = (p: Pt[]): Quad => {
  const s = p.map((q) => q.x + q.y), d = p.map((q) => q.x - q.y);
  const tl = p[s.indexOf(Math.min(...s))], br = p[s.indexOf(Math.max(...s))], tr = p[d.indexOf(Math.max(...d))], bl = p[d.indexOf(Math.min(...d))];
  return [tl, tr, br, bl];
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** The biggest card-shaped rectangle in a small picture (any size, about 320 wide is best). Points are in that picture's pixels. */
export function findCard(cv: any, canvas: HTMLCanvasElement): Quad | null {
  const W = canvas.width, H = canvas.height;
  const src = cv.imread(canvas), gray = new cv.Mat(), edges = new cv.Mat(), contours = new cv.MatVector(), hier = new cv.Mat();
  const k = cv.Mat.ones(3, 3, cv.CV_8U);
  let best: Quad | null = null, bestArea = 0;
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    cv.Canny(gray, edges, 35, 110); cv.dilate(edges, edges, k);
    cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i), area = cv.contourArea(c);
      if (area < W * H * 0.05) { c.delete(); continue; }
      const hull = new cv.Mat(); cv.convexHull(c, hull); const peri = cv.arcLength(hull, true), ap = new cv.Mat();
      let pts: Pt[] | null = null;
      for (const f of [0.02, 0.03, 0.045]) { cv.approxPolyDP(hull, ap, f * peri, true); if (ap.rows === 4) { pts = []; for (let j = 0; j < 4; j++) pts.push({ x: ap.data32S[j * 2], y: ap.data32S[j * 2 + 1] }); break; } }
      if (!pts) { // rounded corners: a tilted box round the shape, accepted when the shape fills it well
        const rr = cv.minAreaRect(hull), box = cv.RotatedRect.points(rr), ra = rr.size.width * rr.size.height;
        if (ra > 0 && cv.contourArea(hull) / ra > 0.93) pts = box.map((q: Pt) => ({ x: q.x, y: q.y }));
      }
      ap.delete(); hull.delete(); c.delete();
      if (!pts) continue;
      const q = order(pts), w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
      const ratio = Math.max(w, h) / Math.max(1, Math.min(w, h));
      if (ratio < 1.3 || ratio > 1.95) continue; // an ID card is about 1.59 : 1
      if (area > bestArea) { bestArea = area; best = q; }
    }
  } finally { src.delete(); gray.delete(); edges.delete(); contours.delete(); hier.delete(); k.delete(); }
  return best;
}

/** Cut the card out of a picture and flatten it to a clean upright rectangle (like a scanner app), with its contrast stretched. */
export function flattenCard(cv: any, canvas: HTMLCanvasElement, q: Quad, outW = 1100): HTMLCanvasElement {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  const p = w >= h ? q : ([q[3], q[0], q[1], q[2]] as Quad); // a card held upright is turned to lie flat
  const outH = Math.round(outW / 1.586);
  const src = cv.imread(canvas), dst = new cv.Mat();
  const a = cv.matFromArray(4, 1, cv.CV_32FC2, p.flatMap((t) => [t.x, t.y])), b = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);
  const M = cv.getPerspectiveTransform(a, b);
  const out = document.createElement("canvas");
  try { cv.warpPerspective(src, dst, M, new cv.Size(outW, outH), cv.INTER_CUBIC, cv.BORDER_REPLICATE); cv.imshow(out, dst); }
  finally { src.delete(); dst.delete(); a.delete(); b.delete(); M.delete(); }
  // stretch the contrast so faint print is clearer (only when the picture is flat/washed out)
  const x = out.getContext("2d")!, im = x.getImageData(0, 0, outW, outH), d = im.data, hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 28) hist[(d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10 | 0]++;
  const tot = hist.reduce((s, v) => s + v, 0); let lo = 0, hi = 255, c = 0;
  for (let v = 0; v < 256; v++) { c += hist[v]; if (c >= tot * 0.02) { lo = v; break; } }
  c = 0; for (let v = 255; v >= 0; v--) { c += hist[v]; if (c >= tot * 0.02) { hi = v; break; } }
  if (hi - lo > 50 && (hi - lo < 215)) { const g = 255 / (hi - lo); for (let i = 0; i < d.length; i += 4) { d[i] = Math.max(0, Math.min(255, (d[i] - lo) * g)); d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] - lo) * g)); d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] - lo) * g)); } x.putImageData(im, 0, 0); }
  return out;
}
