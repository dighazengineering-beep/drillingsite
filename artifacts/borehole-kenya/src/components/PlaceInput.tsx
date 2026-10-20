import { useEffect, useRef, useState } from "react";
import type { Suggestion } from "@/lib/places";

/**
 * A text box that suggests places as you type (tap one to fill it in). You can always type anything you like;
 * the suggestions are only there to save typing.
 */
export default function PlaceInput({ value, onChange, onPick, suggest, placeholder, disabled, className, maxLength = 40, testId }: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (s: Suggestion) => void;
  suggest: (q: string) => Suggestion[];
  placeholder: string;
  disabled?: boolean;
  className: string;
  maxLength?: number;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const items = open ? suggest(value).filter((s) => s.label.toLowerCase() !== value.trim().toLowerCase()) : [];

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);

  const pick = (s: Suggestion) => { onChange(s.label); onPick?.(s); setOpen(false); };

  return (
    <div ref={box} className="relative">
      <input
        className={className} placeholder={placeholder} value={value} maxLength={maxLength} disabled={disabled} data-testid={testId}
        autoComplete="off" autoCapitalize="words" enterKeyHint="next"
        onFocus={() => { setOpen(true); setHot(0); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHot(0); }}
        onKeyDown={(e) => {
          if (!items.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHot((h) => Math.min(h + 1, items.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHot((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && open) { e.preventDefault(); pick(items[hot] ?? items[0]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {items.length > 0 && (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-xl">
          {items.map((s, i) => (
            <li key={`${s.label}-${s.county ?? ""}`}>
              <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => pick(s)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm ${i === hot ? "bg-muted" : ""} active:bg-muted`}>
                <span className="font-medium text-foreground">{s.label}</span>
                {s.hint && <span className="text-xs text-muted-foreground">{s.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
