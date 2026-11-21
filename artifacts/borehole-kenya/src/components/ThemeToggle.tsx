import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

type Mode = "system" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const NAME: Record<Mode, string> = { system: "Auto", light: "Light", dark: "Dark" };

function useMode(): [Mode, (m: Mode) => void] {
  const { theme, setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const mode: Mode = ready && (theme === "light" || theme === "dark") ? theme : "system";
  return [mode, (m) => setTheme(m)];
}

/** One round button for the header: tap to go Auto, Light, Dark. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, set] = useMode();
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => set(NEXT[mode])}
      className={`rounded-md p-1.5 text-foreground/70 transition-colors hover:bg-muted sm:p-2 ${className}`}
      aria-label={`Appearance: ${NAME[mode]}. Tap to change.`}
      title={`Appearance: ${NAME[mode]}${mode === "system" ? " (follows your phone)" : ""}`}
      data-testid="button-theme"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

/** Three clear choices, for the phone menu. */
export function ThemeChoice() {
  const [mode, set] = useMode();
  const items: { id: Mode; label: string; Icon: typeof Sun }[] = [
    { id: "system", label: "Auto", Icon: Monitor },
    { id: "light", label: "Light", Icon: Sun },
    { id: "dark", label: "Dark", Icon: Moon },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-2.5 shadow-sm" data-testid="theme-choice">
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <span className="text-[13px] font-bold text-foreground">Appearance</span>
        <span className="text-[11px] text-muted-foreground">{mode === "system" ? "Follows your phone" : `${NAME[mode]} mode`}</span>
      </div>
      <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-1.5">
        {items.map(({ id, label, Icon }) => {
          const on = mode === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => set(id)}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[13px] font-semibold transition active:scale-[.97] ${
                on ? "border-primary bg-primary/15 text-primary" : "border-border bg-background text-foreground/80 hover:border-primary/40"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
