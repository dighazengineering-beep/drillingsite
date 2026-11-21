// Turns a photo of a signature or a stamp (ink on paper) into a transparent PNG: the paper is removed, only the ink stays.
// Runs on the phone itself. Works best with dark or coloured ink on white or light paper.

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Could not open that picture.")); i.src = src; });
}
export function readFile(f: File): Promise<string> {
  return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error("Could not read that file.")); r.readAsDataURL(f); });
}

const hex = (h: string): [number, number, number] => { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** ink: a colour like "#1c3fb8" to repaint all the ink in that colour (signatures), or "keep" to keep the original colours (stamps). */
export async function removeBackground(src: string, ink: string | "keep", maxW = 720): Promise<string> {
  const img = await loadImg(src);
  const k = Math.min(1, maxW / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.max(40, Math.round(img.naturalWidth * k)), H = Math.max(40, Math.round(img.naturalHeight * k));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H), d = px.data;
  // the paper colour around each spot: a very blurred copy of the photo (ink is thin, so it hardly changes the blur)
  const b = document.createElement("canvas"); b.width = W; b.height = H;
  const bg = b.getContext("2d", { willReadFrequently: true })!;
  bg.filter = `blur(${Math.max(8, Math.round(Math.max(W, H) / 22))}px)`; bg.drawImage(c, 0, 0); bg.filter = "none";
  const bd = bg.getImageData(0, 0, W, H).data;
  const rgb = ink === "keep" ? null : hex(ink);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i], gg = d[i + 1], bl = d[i + 2];
    // how much darker or more colourful than the paper: the biggest drop in any colour channel, compared with the paper
    const drop = Math.max(bd[i] - r, bd[i + 1] - gg, bd[i + 2] - bl) / Math.max(60, Math.max(bd[i], bd[i + 1], bd[i + 2]));
    let a = (drop - 0.16) / 0.30; a = a < 0 ? 0 : a > 1 ? 1 : a; a = a * a * (3 - 2 * a);
    if (a > 0.02) {
      if (rgb) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; }
      else { // stamp: make the ink colour stronger where the paper was mixed in
        const m = Math.max(0.25, a); d[i] = Math.max(0, Math.min(255, bd[i] - (bd[i] - r) / m)); d[i + 1] = Math.max(0, Math.min(255, bd[i + 1] - (bd[i + 1] - gg) / m)); d[i + 2] = Math.max(0, Math.min(255, bd[i + 2] - (bd[i + 2] - bl) / m));
      }
      const x = p % W, y = (p / W) | 0; if (a > 0.25) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    d[i + 3] = Math.round(a * 255);
  }
  if (x1 < 0) throw new Error("I could not find any ink in that picture. Use dark ink on plain light paper, in good light.");
  g.putImageData(px, 0, 0);
  const pad = 4, sx = Math.max(0, x0 - pad), sy = Math.max(0, y0 - pad), sw = Math.min(W, x1 + pad) - sx, sh = Math.min(H, y1 + pad) - sy;
  const o = document.createElement("canvas"); o.width = sw; o.height = sh; o.getContext("2d")!.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
  return o.toDataURL("image/png");
}
