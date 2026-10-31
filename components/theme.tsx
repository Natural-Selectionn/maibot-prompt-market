"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ThemeProvider as NextThemeProvider, useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <NextThemeProvider attribute="data-theme" storageKey="maibot-theme" defaultTheme="system" enableSystem disableTransitionOnChange>{children}</NextThemeProvider>;
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- next-themes requires client mounting before using resolvedTheme, keeping the server/client first render identical.
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "切换至浅色主题" : "切换至深色主题";
  return <button type="button" className="key icon-key theme-toggle" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={label} title={label}><Sun className="theme-sun" size={16}/><Moon className="theme-moon" size={16}/></button>;
}
