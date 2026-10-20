const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } },
  set: (k: string, v: string) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* ignore */ } },
};

export interface Member { id: number; name: string; email: string; phone: string; code: string; affiliate: boolean }
export interface Enquiry { id: number; type: string; message: string; county: string | null; createdAt: string }
export interface Referral {
  id: number; clientName: string; clientPhone: string; kind: "service" | "product"; need: string; source: string;
  rate: number; amount: number | null; commission: number | null;
  status: "in_progress" | "awaiting_payment" | "payable" | "paid";
  completed: boolean; fullyPaid: boolean; paidOut: boolean; notes: string; createdAt: string;
}

const TOKEN = "kws_member";
const REF = "kws_ref";

export const memberToken = () => store.get(TOKEN);
export const setMemberToken = (t: string) => store.set(TOKEN, t);
export const signOutMember = () => store.set(TOKEN, "");

/** Remember a referral code from a link like /?ref=KWS-AB12C so it can be credited when the visitor sends an enquiry. */
export function captureRef() {
  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code && /^[A-Za-z0-9-]{4,20}$/.test(code)) store.set(REF, code.toUpperCase());
  } catch { /* ignore */ }
}
export const savedRef = () => store.get(REF);

export async function memberApi<T = any>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const token = opts.token ?? memberToken();
  const r = await fetch(`${API}/api/members${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { status: r.status });
  return data as T;
}

export const kes = (n: number | null | undefined) => (n == null ? "—" : `KSh ${Math.round(n).toLocaleString("en-KE")}`);

export const STATUS_LABEL: Record<Referral["status"], string> = {
  in_progress: "In progress",
  awaiting_payment: "Awaiting client payment",
  payable: "Ready to pay you",
  paid: "Paid",
};
