import type { ReactNode } from "react";
import { ThemeProvider as NextThemes } from "next-themes";

/**
 * Theme engine: Light, Dark or Auto (follows the phone's own setting).
 * The choice is remembered on the device (key "dighaz-theme") and the dark colours switch on with a `dark` class on <html>.
 * index.html applies the saved choice before the first paint, so the page never flashes white in dark mode.
 */
export default function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem enableColorScheme storageKey="dighaz-theme" disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
