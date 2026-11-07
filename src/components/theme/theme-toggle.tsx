"use client";

import { ThemeIcon } from "@/components/icons";
import { THEME_INFO, type Theme } from "@/lib/theme";
import { applyTheme, useTheme } from "./use-theme";

/** One tap flips between Teal Paper and Graphite. `children` is an optional visible label. */
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
  const next: Theme = theme === "teal" ? "graphite" : "teal";
  const label = `Switch to ${THEME_INFO[next].label}`;
  return (
    <button type="button" onClick={() => applyTheme(next)} aria-label={children ? undefined : label} title={label} className={className}>
      <ThemeIcon width={iconSize} height={iconSize} className={`shrink-0 transition-transform duration-300 ${theme === "graphite" ? "rotate-180" : ""}`} />
      {children}
    </button>
  );
}
