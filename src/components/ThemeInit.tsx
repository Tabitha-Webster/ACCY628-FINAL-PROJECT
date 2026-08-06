"use client";

import { useEffect } from "react";
import {
  FORCE_LIGHT_ONCE_KEY,
  THEME_STORAGE_KEY,
  applyAppearance,
  readAppearance,
} from "@/components/ThemeSelector";

export function ThemeInit() {
  useEffect(() => {
    if (!window.localStorage.getItem(FORCE_LIGHT_ONCE_KEY)) {
      window.localStorage.setItem(THEME_STORAGE_KEY, "light");
      window.localStorage.setItem(FORCE_LIGHT_ONCE_KEY, "1");
    }

    const appearance = readAppearance();
    applyAppearance(appearance);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onSystemChange() {
      if (readAppearance() === "system") applyAppearance("system");
    }
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  return null;
}
