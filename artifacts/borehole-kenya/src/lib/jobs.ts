export interface JobEvent {
  id: number; step: string; note: string; mediaUrl: string; mediaType: string; eta: string;
  teamName: string; teamPhone: string; important: boolean; by: string; at: string;
}
export interface ClientJob {
  item: string; kind: "service" | "product"; type: string; typeLabel: string; steps: string[]; index: number; step: string;
  status: "waiting" | "progress" | "done"; note: string; eta: string; updatedAt: string | null;
  team: { name: string; phone: string } | null; agreedTotal: number; paid: number; balance: number;
  liveUrl: string; recordingUrl: string; events: JobEvent[];
}

/** "12 minutes ago" style text. */
export function ago(iso?: string | null): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}
/** "12 Oct, 2:15 pm" in East Africa time. */
export function clock(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
/** A still picture from a Cloudinary video, used as its cover. */
export const posterOf = (url: string) => url.replace("/upload/", "/upload/so_0,w_700/").replace(/\.[a-z0-9]+$/i, ".jpg");

export const STATUS_LABEL = { waiting: "Waiting", progress: "In progress", done: "Completed" } as const;
export const STATUS_STYLE = {
  waiting: "bg-slate-100 text-slate-700",
  progress: "bg-sky-100 text-sky-800",
  done: "bg-emerald-100 text-emerald-800",
} as const;
