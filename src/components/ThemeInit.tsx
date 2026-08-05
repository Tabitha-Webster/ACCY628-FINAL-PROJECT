"use client";

import { useEffect } from "react";
import {
  applyAppearance,
  readAppearance,
} from "@/components/ThemeSelector";

export function ThemeInit() {
  useEffect(() => {
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
