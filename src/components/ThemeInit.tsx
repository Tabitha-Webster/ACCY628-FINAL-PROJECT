"use client";

import { useEffect } from "react";
import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/components/ThemeSelector";

export function ThemeInit() {
  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  return null;
}
