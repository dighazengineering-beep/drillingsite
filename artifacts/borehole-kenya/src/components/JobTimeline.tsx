import { Check } from "lucide-react";
import { clock, posterOf, type JobEvent } from "@/lib/jobs";

/** Photo or short video from the site. Text is always shown as plain text. */
export function Media({ e }: { e: Pick<JobEvent, "mediaUrl" | "mediaType"> }) {
  if (!e.mediaUrl) return null;
  return e.mediaType === "video" ? (
    <video src={e.mediaUrl} poster={posterOf(e.mediaUrl)} controls playsInline preload="none" className="mt-1.5 max-h-72 w-full rounded-xl bg-black object-contain" />
  ) : (
    <a href={e.mediaUrl} target="_blank" rel="noopener noreferrer"><img src={e.mediaUrl} alt="Photo from the site" loading="lazy" className="mt-1.5 max-h-72 w-full rounded-xl object-cover" /></a>
  );
}

/** Vertical timeline: finished steps are ticked with their time, the current step pulses, later steps are grey. */
export default function JobTimeline({ steps, index, events }: { steps: string[]; index: number; events: JobEvent[] }) {
  const chrono = [...events].reverse();
  const byStep = new Map<string, JobEvent[]>();
  for (const e of chrono) byStep.set(e.step, [...(byStep.get(e.step) ?? []), e]);
  const other = chrono.filter((e) => !steps.includes(e.step));

  return (
    <ol className="relative" data-testid="job-timeline">
      {steps.map((s, i) => {
        const state = i < index ? "done" : i === index ? "now" : "next";
        const list = byStep.get(s) ?? [];
        const reached = list[0]?.at;
        const last = i === steps.length - 1;
        return (
          <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && <span className={`absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5 ${i < index ? "bg-emerald-400" : "bg-border"}`} />}
            <span className="relative mt-0.5 grid h-6 w-6 shrink-0 place-items-center">
              {state === "now" && <span className="absolute inline-flex h-6 w-6 animate-ping rounded-full bg-sky-400/60" />}
              <span className={`relative grid h-6 w-6 place-items-center rounded-full text-white ${state === "done" ? "bg-emerald-500" : state === "now" ? "bg-sky-500 ring-4 ring-sky-200" : "bg-muted-foreground/25"}`}>
                {state === "done" ? <Check className="h-3.5 w-3.5" /> : state === "now" ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[13px] leading-tight ${state === "now" ? "font-extrabold text-foreground" : state === "done" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{s}</p>
              {state !== "next" && reached && <p className="text-[11px] text-muted-foreground">{clock(reached)}</p>}
              {state !== "next" && list.map((e) => (e.note || e.eta || e.mediaUrl) && (
                <div key={e.id} className="mt-1">
                  {e.eta && <p className="text-xs font-semibold text-sky-700">{e.eta}</p>}
                  {e.note && <p className="text-xs text-foreground/80">{e.note}</p>}
                  <Media e={e} />
                </div>
              ))}
            </div>
          </li>
        );
      })}
      {other.length > 0 && (
        <li className="mt-3 border-t border-border pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Other updates</p>
          {other.map((e) => (
            <div key={e.id} className="mt-1.5">
              <p className="text-[11px] text-muted-foreground">{e.step} · {clock(e.at)}</p>
              {e.note && <p className="text-xs text-foreground/80">{e.note}</p>}
              <Media e={e} />
            </div>
          ))}
        </li>
      )}
    </ol>
  );
}
