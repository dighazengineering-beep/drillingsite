/** Small Claude API client (plain fetch, no SDK). Reads ANTHROPIC_API_KEY. Web search is the API's own server tool; the sources it really opened are returned so references never come from the model's memory. */
/** Which AI does the work: REPORT_AI=openai, gemini or anthropic forces one (when its key is set); otherwise the first key found: Claude, then OpenAI, then Gemini. */
const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
export const provider = (): "anthropic" | "openai" | "gemini" => {
  const f = (process.env.REPORT_AI || "").toLowerCase();
  if (f === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (f === "gemini" && geminiKey()) return "gemini";
  if (f === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return geminiKey() ? "gemini" : "openai";
};
export const claudeReady = () => !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || geminiKey());
export const MODEL = () => process.env.REPORT_MODEL || "claude-sonnet-5-5";

export interface Source { url: string; title: string }
export interface ClaudeOut { text: string; sources: Source[]; searches: number; inTokens: number; outTokens: number }
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

/** Google Gemini (generateContent). Web search is Google Search grounding; the pages it used are returned as the sources. */
async function gemini(o: { system: string; messages: Msg[]; maxTokens?: number; search?: number; model?: string; json?: boolean }): Promise<ClaudeOut> {
  const key = geminiKey();
  if (!key) throw new Error("GEMINI_API_KEY is not set on the server");
  const model = o.model && /^gemini/i.test(o.model) ? o.model : process.env.GEMINI_MODEL || "gemini-2.5-pro";
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
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(280_000),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300).replace(key, "[key]")}`);
  const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[]; webSearchQueries?: string[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
  const c = j.candidates?.[0]; const sources = new Map<string, string>();
  for (const ch of c?.groundingMetadata?.groundingChunks ?? []) if (ch.web?.uri) sources.set(ch.web.uri, ch.web.title ?? ch.web.uri);
  const text = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  return { text, sources: [...sources].map(([url, title]) => ({ url, title })), searches: c?.groundingMetadata?.webSearchQueries?.length ?? 0, inTokens: j.usageMetadata?.promptTokenCount ?? 0, outTokens: j.usageMetadata?.candidatesTokenCount ?? 0 };
}

export async function claude(o: { system: string; messages: Msg[]; maxTokens?: number; search?: number; model?: string; json?: boolean }): Promise<ClaudeOut> {
  const pv = provider();
  if (pv === "openai") return openai(o);
  if (pv === "gemini") return gemini(o);
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
