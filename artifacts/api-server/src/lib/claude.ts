/** Small Claude API client (plain fetch, no SDK). Reads ANTHROPIC_API_KEY. Web search is the API's own server tool; the sources it really opened are returned so references never come from the model's memory. */
/**
 * Which AI does the work. REPORT_AI=openai | anthropic | gemini forces that one. REPORT_AI=free (or auto) shares the work between the FREE services
 * (Gemini, Groq, Cerebras) so none of them hits its limit. With no paid key set, any free keys are shared the same way automatically.
 */
/** Each service may have SEVERAL keys (from different accounts) in one box, separated by commas: key1,key2,key3. Every key has its own limits, so more keys means more room. */
const splitKeys = (v?: string) => [...new Set((v || "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
const ENV_KEYS: Record<string, () => string[]> = {
  gemini: () => [...new Set([...splitKeys(process.env.GEMINI_API_KEY), ...splitKeys(process.env.GOOGLE_API_KEY)])],
  groq: () => splitKeys(process.env.GROQ_API_KEY),
  cerebras: () => splitKeys(process.env.CEREBRAS_API_KEY),
};
export const geminiKeys = ENV_KEYS.gemini;
const geminiKey = () => geminiKeys()[0] || "";
const freeNames = () => (process.env.REPORT_AI_ORDER || "gemini,groq,cerebras").split(",").map((x) => x.trim().toLowerCase()).filter((n) => ENV_KEYS[n]?.().length);
export const provider = (): "anthropic" | "openai" | "gemini" | "pool" => {
  const f = (process.env.REPORT_AI || "").toLowerCase();
  if (f === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (f === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if ((f === "free" || f === "auto" || f === "pool") && freeNames().length) return "pool";
  if (f === "gemini" && geminiKey()) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return freeNames().length ? "pool" : "openai";
};
export const claudeReady = () => !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || freeNames().length);
export const MODEL = () => process.env.REPORT_MODEL || "claude-sonnet-5-5";

export interface Source { url: string; title: string }
export interface ClaudeOut { text: string; sources: Source[]; searches: number; inTokens: number; outTokens: number }
/** An AI service said no: the status and how long it asked us to wait, so the pool can move to another service. */
class ProviderError extends Error {
  constructor(public who: string, public status: number, body: string, retryAfter?: string | null) {
    super(`${who} ${status}: ${body.slice(0, 300)}`);
    const h = Number(retryAfter), m = /retryDelay\W+(\d+(?:\.\d+)?)s/.exec(body);
    this.waitMs = Number.isFinite(h) && h > 0 ? h * 1000 : m ? Math.ceil(Number(m[1])) * 1000 : 0;
    this.daily = /per day|daily|RPD|TPD|per-day/i.test(body);
  }
  waitMs = 0; daily = false;
}
type Block = { type: string; [k: string]: unknown };
export type Msg = { role: "user" | "assistant"; content: string | Block[] };

async function openai(o: { system: string; messages: Msg[]; maxTokens?: number; search?: number; model?: string; json?: boolean }): Promise<ClaudeOut> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set on the server");
  const input = o.messages.map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : m.content.map((b) => {
      if (b.type === "image") { const src = b.source as { media_type: string; data: string }; return { type: "input_image", image_url: `data:${src.media_type};base64,${src.data}` }; }
      return { type: m.role === "assistant" ? "output_text" : "input_text", text: String(b.text ?? "") };
    }),
  }));
  const body: Record<string, unknown> = { model: o.model || process.env.OPENAI_MODEL || "gpt-4.1", instructions: o.system, input, max_output_tokens: o.maxTokens ?? 8000 };
  if (o.search) body.tools = [{ type: "web_search" }];
  else if (o.json) body.text = { format: { type: "json_object" } };
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(280_000),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300).replace(key, "[key]")}`);
  const j = (await r.json()) as { output?: { type: string; content?: { type: string; text?: string; annotations?: { type: string; url?: string; title?: string }[] }[] }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  const sources = new Map<string, string>(); let text = "", searches = 0;
  for (const it of j.output ?? []) {
    if (it.type === "web_search_call") searches++;
    if (it.type === "message") for (const c of it.content ?? []) if (c.type === "output_text") {
      text += c.text ?? "";
      for (const a of c.annotations ?? []) if (a.type === "url_citation" && a.url) sources.set(a.url, a.title ?? a.url);
    }
  }
  return { text, sources: [...sources].map(([url, title]) => ({ url, title })), searches, inTokens: j.usage?.input_tokens ?? 0, outTokens: j.usage?.output_tokens ?? 0 };
}

/** Google retires Gemini models too (gemini-2.5-flash is closed to new accounts). Newest first; if one says "no longer available" we move to the next and remember it. GEMINI_MODEL still wins if set. */
const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
let geminiAt = 0;
const geminiModel = () => process.env.GEMINI_MODEL || GEMINI_MODELS[Math.min(geminiAt, GEMINI_MODELS.length - 1)];
/** Google Gemini (generateContent). Web search is Google Search grounding; the pages it used are returned as the sources. */
async function gemini(o: { system: string; messages: Msg[]; maxTokens?: number; search?: number; model?: string; json?: boolean }, useKey?: string): Promise<ClaudeOut> {
  const key = useKey || geminiKey();
  if (!key) throw new Error("GEMINI_API_KEY is not set on the server");
  const model = o.model && /^gemini/i.test(o.model) ? o.model : geminiModel();
  const contents = o.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: typeof m.content === "string" ? [{ text: m.content }] : m.content.map((b) => {
      if (b.type === "image") { const src = b.source as { media_type: string; data: string }; return { inlineData: { mimeType: src.media_type, data: src.data } }; }
      return { text: String(b.text ?? "") };
    }),
  }));
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: o.system }] }, contents,
    generationConfig: { maxOutputTokens: (o.maxTokens ?? 8000) + 4000, thinkingConfig: { thinkingBudget: 1024 }, ...(o.json && !o.search ? { responseMimeType: "application/json" } : {}) },
  };
  if (o.search) body.tools = [{ google_search: {} }];
  const send = () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(280_000),
  });
  let r = await send();
  if (r.status === 400) {
    // some newer models do not accept this thinking setting: ask again without it
    const t = await r.text();
    if (/thinking/i.test(t)) { delete (body.generationConfig as Record<string, unknown>).thinkingConfig; r = await send(); }
    else throw new ProviderError("Gemini", 400, t.replace(key, "[key]"), null);
  }
  if (!r.ok) throw new ProviderError("Gemini", r.status, (await r.text()).replace(key, "[key]"), r.headers.get("retry-after"));
  const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[]; webSearchQueries?: string[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
  const c = j.candidates?.[0]; const sources = new Map<string, string>();
  for (const ch of c?.groundingMetadata?.groundingChunks ?? []) if (ch.web?.uri) sources.set(ch.web.uri, ch.web.title ?? ch.web.uri);
  const text = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  return { text, sources: [...sources].map(([url, title]) => ({ url, title })), searches: c?.groundingMetadata?.webSearchQueries?.length ?? 0, inTokens: j.usageMetadata?.promptTokenCount ?? 0, outTokens: j.usageMetadata?.candidatesTokenCount ?? 0 };
}

/** Groq and Cerebras speak the same "chat completions" language. Text only: pictures and web search are left to Gemini. */
async function chatCompat(who: string, base: string, key: string, model: string, o: { system: string; messages: Msg[]; maxTokens?: number }): Promise<ClaudeOut> {
  const messages = [{ role: "system", content: o.system }, ...o.messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : m.content.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("\n") }))];
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: (o.maxTokens ?? 8000) + 2000, temperature: 0.3 }), signal: AbortSignal.timeout(280_000),
  });
  if (!r.ok) throw new ProviderError(who, r.status, (await r.text()).replace(key, "[key]"), r.headers.get("retry-after"));
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  return { text: j.choices?.[0]?.message?.content ?? "", sources: [], searches: 0, inTokens: j.usage?.prompt_tokens ?? 0, outTokens: j.usage?.completion_tokens ?? 0 };
}

type CallOpts = { system: string; messages: Msg[]; maxTokens?: number; search?: number; model?: string; json?: boolean };
const ms = (name: string, d: number) => Number(process.env[name]) || d;
/** Smallest pause between two calls to the same service (their free plans allow only a few requests a minute). */
const GAP: Record<string, () => number> = { gemini: () => ms("GEMINI_GAP_MS", 6000), groq: () => ms("GROQ_GAP_MS", 4000), cerebras: () => ms("CEREBRAS_GAP_MS", 13000) };
const cooling = new Map<string, number>(), lastUsed = new Map<string, number>();
let turn = 0;
const sleep = (t: number) => new Promise((r) => setTimeout(r, t));

/** Shares the work between the free services: takes turns, spaces the calls out, and when one says "limit reached" it rests that one and carries on with the next. */
/** Groq retires models from time to time; if one is gone (404 "model not found") we move to the next one in this list and remember it. GROQ_MODEL still wins if set. */
const GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
let groqAt = 0;
const groqModel = () => process.env.GROQ_MODEL || GROQ_MODELS[Math.min(groqAt, GROQ_MODELS.length - 1)];
async function pool(o: CallOpts): Promise<ClaudeOut> {
  // One slot per key: two Gemini keys are two slots, each with its own pause and its own limit.
  const slots = freeNames().flatMap((n) => ENV_KEYS[n]().map((key, i) => ({ id: `${n}#${i}`, n, key })));
  const needs = !!o.search || o.messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "image"));
  const skip = new Set<string>();
  let last: unknown = new Error("No free AI service is available");
  for (let attempt = 0; attempt < 12; attempt++) {
    // Pictures and web search only work on Gemini; the others get the text part when Gemini is unavailable for too long.
    // Groq's free plan allows only about 8,000 tokens per minute in one request, so big requests are left to Gemini (Groq still takes the small ones).
    const big = Math.ceil(JSON.stringify([o.system, o.messages.map((m) => (typeof m.content === "string" ? m.content : m.content.map((b) => (b.type === "text" ? b.text : "")).join(" ")))]).length / 3.2) > 6000;
    let cands = slots.filter((s) => !skip.has(s.n) && !(big && s.n === "groq" && slots.some((x) => x.n !== "groq")));
    if (needs && cands.some((s) => s.n === "gemini") && attempt < 6) cands = cands.filter((s) => s.n === "gemini");
    if (!cands.length) break;
    const at = (s: { id: string; n: string }) => Math.max(cooling.get(s.id) ?? 0, (lastUsed.get(s.id) ?? 0) + GAP[s.n]());
    const start = turn++ % cands.length;
    const order = cands.map((s, i) => ({ s, t: at(s), i: (i - start + cands.length) % cands.length })).sort((a, b) => a.t - b.t || a.i - b.i);
    const pick = order[0].s, wait = order[0].t - Date.now();
    if (wait > 120_000) { last = new Error(`All free AI services are resting (next one in ${Math.round(wait / 1000)}s)`); break; }
    if (wait > 0) await sleep(wait);
    lastUsed.set(pick.id, Date.now());
    try {
      if (pick.n === "gemini") return await gemini({ ...o, model: o.model && /^gemini/i.test(o.model) ? o.model : undefined }, pick.key);
      const text = pick.n === "groq" ? { base: "https://api.groq.com/openai/v1", model: groqModel() } : { base: "https://api.cerebras.ai/v1", model: process.env.CEREBRAS_MODEL || "gpt-oss-120b" };
      return await chatCompat(pick.n, text.base, pick.key, text.model, o);
    } catch (e) {
      last = e;
      const pe = e as ProviderError, st = pe.status ?? 0, msg = String((e as Error).message ?? "");
      if (st === 413 || /too large|reduce the length|context length|maximum context|request_too_large/i.test(msg)) skip.add(pick.n);            // too big for this service, try another
      else if (st === 401 || st === 403) cooling.set(pick.id, Date.now() + 3_600_000);                                                            // bad key
      else if (st === 429 || /rate|quota|limit|exhaust/i.test(msg)) cooling.set(pick.id, Date.now() + (pe.daily ? 3_600_000 : Math.max(pe.waitMs || 0, 65_000)));
      else if (st >= 500 || st === 0) cooling.set(pick.id, Date.now() + 30_000);                                                                  // service hiccup or timeout
      else if (pick.n === "gemini" && st === 404 && !process.env.GEMINI_MODEL && !(o.model && /^gemini/i.test(o.model)) && geminiAt < GEMINI_MODELS.length - 1) { geminiAt++; console.warn(`[ai] gemini model gone, switching to ${geminiModel()}`); }
      else if (pick.n === "groq" && /model/i.test(msg) && (st === 404 || /not exist|not found|decommission/i.test(msg)) && !process.env.GROQ_MODEL && groqAt < GROQ_MODELS.length - 1) { groqAt++; console.warn(`[ai] groq model gone, switching to ${groqModel()}`); }
      else skip.add(pick.n);                                                                                                                      // refused this request (e.g. unknown model)
      console.warn(`[ai] ${pick.id} failed (${st || "error"}): ${msg.slice(0, 160)}; trying another`);
    }
  }
  throw last;
}

export async function claude(o: { system: string; messages: Msg[]; maxTokens?: number; search?: number; model?: string; json?: boolean }): Promise<ClaudeOut> {
  const pv = provider();
  if (pv === "openai") return openai(o);
  if (pv === "gemini") return gemini(o);
  if (pv === "pool") return pool(o);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set on the server");
  const messages: Msg[] = [...o.messages];
  const sources = new Map<string, string>();
  let text = "", searches = 0, inTokens = 0, outTokens = 0;
  for (let turn = 0; turn < 6; turn++) {
    const body: Record<string, unknown> = { model: o.model || MODEL(), max_tokens: o.maxTokens ?? 8000, system: o.system, messages };
    if (o.search) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: o.search }];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(280_000),
    });
    if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 300).replace(key, "[key]")}`);
    const j = (await r.json()) as { content: Block[]; stop_reason: string; usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } } };
    inTokens += j.usage?.input_tokens ?? 0; outTokens += j.usage?.output_tokens ?? 0; searches += j.usage?.server_tool_use?.web_search_requests ?? 0;
    for (const b of j.content) {
      if (b.type === "text") {
        text += String(b.text ?? "");
        for (const c of (b.citations as { url?: string; title?: string }[] | undefined) ?? []) if (c.url) sources.set(c.url, c.title ?? c.url);
      } else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const x of b.content as { url?: string; title?: string }[]) if (x.url) sources.set(x.url, x.title ?? x.url);
      }
    }
    if (j.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: j.content }); continue; }
    break;
  }
  return { text, sources: [...sources].map(([url, title]) => ({ url, title })), searches, inTokens, outTokens };
}

export function parseJson<T>(t: string): T {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  const s = m ? m[1]! : t;
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error("The AI did not return data in the expected form");
  return JSON.parse(s.slice(a, b + 1)) as T;
}
