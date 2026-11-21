import { Router } from "express";
import { createHash } from "node:crypto";

// Backup ID reader. The phone tries first. Only when it could not read the card, the photos come here and are tried on
// up to three free readers, one after the other, so if one is out of free use the next one answers:
//   1. Gemini with GEMINI_API_KEY   2. Gemini with GEMINI_API_KEY_2 (a second key)   3. OCR.space with OCRSPACE_API_KEY
// A reader with no key is skipped. Nothing is saved here.
const router = Router();
// what happened on the last tries (no keys, no ID data): open /api/id-read/status to see why a backup reader did not answer
const recent: string[] = [];
const note = (m: string) => { recent.unshift(`${new Date().toISOString().slice(0, 19)}Z ${m}`); recent.length = Math.min(recent.length, 12); };
const hits = new Map<string, number[]>();
const limited = (k: string, n: number) => { const now = Date.now(), a = (hits.get(k) ?? []).filter((t) => now - t < 3600_000); a.push(now); hits.set(k, a); return a.length > n; };
const okImg = (d: unknown): d is string => typeof d === "string" && d.length < 1_000_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d);
const PROMPT = `These are photos of a Kenyan national ID card (front and/or back). Read the holder's full name and the ID number exactly as printed. The back may have a machine-readable strip at the bottom: use it. Reply with JSON only: {"name":"FULL NAMES","idNo":"digits only"}. If you cannot read one, use an empty string. Never guess.`;

async function gemini(key: string, imgs: string[]): Promise<{ name: string; idNo: string }> {
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(9000),
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }, ...imgs.map((d) => ({ inline_data: { mime_type: /^data:(image\/[a-z]+)/.exec(d)![1], data: d.split(",")[1] } }))] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
  });
  if (!r.ok) { const body = (await r.text().catch(() => "")).slice(0, 160).replace(/AQ\.[\w-]+/g, "[key]"); throw new Error(`gemini ${r.status} ${body}`); }
  const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const m = /\{[\s\S]*\}/.exec(t); if (!m) throw new Error(`gemini no JSON: ${t.slice(0, 80)}`);
  const o = JSON.parse(m[0]) as { name?: unknown; idNo?: unknown };
  return { name: String(o.name ?? ""), idNo: String(o.idNo ?? "") };
}

async function ocrSpace(key: string, imgs: string[]): Promise<string> {
  let all = "";
  for (const d of imgs) {
    const f = new URLSearchParams({ apikey: key, base64Image: d, OCREngine: "2", scale: "true", language: "eng" });
    const r = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: f, signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error(`ocrspace ${r.status}`);
    const j = (await r.json()) as { IsErroredOnProcessing?: boolean; ParsedResults?: { ParsedText?: string }[] };
    if (j.IsErroredOnProcessing) throw new Error("ocrspace error");
    all += "\n" + (j.ParsedResults?.[0]?.ParsedText ?? "");
  }
  return all;
}

const cleanName = (n: string) => n.replace(/[^A-Za-z' -]/g, " ").replace(/\s+/g, " ").trim().split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

router.get("/id-read/status", (_req, res) => {
  res.json({ geminiKey1: !!(process.env.GEMINI_API_KEY ?? "").trim(), geminiKey2: !!(process.env.GEMINI_API_KEY_2 ?? "").trim(), ocrSpaceKey: !!(process.env.OCRSPACE_API_KEY ?? "").trim(), model: process.env.GEMINI_MODEL || "gemini-flash-latest", dbFingerprint: (() => { try { const u = new URL(process.env.DATABASE_URL ?? ""); return createHash("sha256").update(`${u.hostname}${u.pathname}`).digest("hex").slice(0, 8); } catch { return "none"; } })(), service: { id: process.env.RENDER_SERVICE_ID ?? "", name: process.env.RENDER_SERVICE_NAME ?? "", url: process.env.RENDER_EXTERNAL_URL ?? "", commit: (process.env.RENDER_GIT_COMMIT ?? "").slice(0, 7) }, runs: process.env.VERCEL ? `vercel (${process.env.VERCEL_ENV ?? "?"})` : process.env.RENDER ? "render" : "other", namesSeen: Object.keys(process.env).filter((k) => /gemini|ocr|api_key/i.test(k)).map((k) => `[${k}]`), recent });
});

router.post("/id-read", async (req, res) => {
  try {
    if (limited(`idr:${req.ip}`, 20)) { res.status(429).json({ error: "Too many tries. Please type your details." }); return; }
    const imgs = [req.body?.back, req.body?.front].filter(okImg);
    if (!imgs.length) { res.status(400).json({ error: "No photo." }); return; }
    const gem = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].map((k) => (k ?? "").trim()).filter(Boolean);
    if (!gem.length && !(process.env.OCRSPACE_API_KEY ?? "").trim()) note("no reader key is set on this server");
    let gi = 0;
    for (const k of gem) {
      gi++;
      try {
        const o = await gemini(k, imgs); const idNo = o.idNo.replace(/\D/g, ""), name = cleanName(o.name), words = name.split(" ");
        const goodName = words.length >= 2 && words.every((w) => w.length >= 3 && /[aeiouy]/i.test(w));
        if (goodName || /^\d{7,9}$/.test(idNo)) { note(`gemini key ${gi} answered: name ${goodName ? "ok" : "not usable"}, id ${/^\d{7,9}$/.test(idNo) ? "ok" : "not usable"}`); res.json({ provider: "gemini", name: goodName ? name : "", idNo: /^\d{7,9}$/.test(idNo) ? idNo : "", text: "" }); return; }
        note(`gemini key ${gi} read nothing usable`);
      } catch (e) { note(`gemini key ${gi} failed: ${(e as Error).message.slice(0, 200)}`); /* out of free use or failed: try the next reader */ }
    }
    const oc = (process.env.OCRSPACE_API_KEY ?? "").trim();
    if (oc) { try { const text = await ocrSpace(oc, imgs); res.json({ provider: "ocrspace", name: "", idNo: "", text: text.slice(0, 4000) }); return; } catch (e) { note(`ocrspace failed: ${(e as Error).message.slice(0, 120)}`); /* none left */ } }
    res.json({ provider: "", name: "", idNo: "", text: "" });
  } catch { res.json({ provider: "", name: "", idNo: "", text: "" }); }
});

export default router;
