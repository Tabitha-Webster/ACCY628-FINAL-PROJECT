"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  THEME_STORAGE_KEY,
  applyAppearance,
  readAppearance,
  type AppearancePreference,
} from "@/components/ThemeSelector";

/** Compact header control to flip between light and dark. */
export function ThemeToggle() {
  const [appearance, setAppearance] = useState<AppearancePreference>("light");

  useEffect(() => {
    setAppearance(readAppearance() === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next: AppearancePreference = appearance === "dark" ? "light" : "dark";
    setAppearance(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyAppearance(next);
  }

  const isDark = appearance === "dark";

  return (
    <button
      type="button"
      className="btn btn-ghost btn-square btn-sm"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
