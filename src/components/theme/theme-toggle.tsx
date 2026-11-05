"use client";

import { ThemeIcon } from "@/components/icons";
import { THEME_INFO, type Theme } from "@/lib/theme";
import { applyTheme, useTheme } from "./use-theme";

/** One tap flips between the teal and the blue look. `children` is an optional visible label. */
export function ThemeToggle({
  serverTheme,
  className = "",
  iconSize = 20,
  children,
}: {
  serverTheme: Theme;
  className?: string;
  iconSize?: number;
  children?: React.ReactNode;
}) {
  const theme = useTheme(serverTheme);
  const next: Theme = theme === "teal" ? "blue" : "teal";
  const label = `Switch to the ${THEME_INFO[next].label.toLowerCase()} theme`;
  return (
    <button type="button" onClick={() => applyTheme(next)} aria-label={children ? undefined : label} title={label} className={className}>
      <ThemeIcon width={iconSize} height={iconSize} className={`shrink-0 transition-transform duration-300 ${theme === "blue" ? "rotate-180" : ""}`} />
      {children}
    </button>
  );
}
