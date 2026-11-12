"use client";

import { ThemeIcon } from "@/components/icons";
import { THEME_INFO, type Theme } from "@/lib/theme";
import { applyTheme, useTheme } from "./use-theme";

/**
 * One tap flips between Teal Paper and Graphite. `children` is an optional visible label, or,
 * with `decorative`, something shown that isn't a label (the collapsed side nav's Hidi, which
 * gives way to the icon on hover); the button is then named by its title. `iconClassName` styles
 * the icon.
 */
export function ThemeToggle({
  serverTheme,
  className = "",
  iconSize = 20,
  iconClassName = "",
  decorative = false,
  children,
}: {
  serverTheme: Theme;
  className?: string;
  iconSize?: number;
  iconClassName?: string;
  decorative?: boolean;
  children?: React.ReactNode;
}) {
  const theme = useTheme(serverTheme);
  const next: Theme = theme === "teal" ? "graphite" : "teal";
  const label = `Switch to ${THEME_INFO[next].label}`;
  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      aria-label={children && !decorative ? undefined : label}
      title={label}
      className={className}
    >
      <ThemeIcon
        width={iconSize}
        height={iconSize}
        className={`shrink-0 transition-[rotate,opacity] duration-300 ${theme === "graphite" ? "rotate-180" : ""} ${iconClassName}`}
      />
      {children}
    </button>
  );
}
