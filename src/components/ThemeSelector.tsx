"use client";

import { useEffect, useState } from "react";
import { Palette } from "lucide-react";

const THEMES = [
  { id: "corporate", label: "Corporate" },
  { id: "business", label: "Business" },
  { id: "nord", label: "Nord" },
  { id: "emerald", label: "Emerald" },
  { id: "cupcake", label: "Cupcake" },
  { id: "dim", label: "Dim" },
] as const;

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState("corporate");

  useEffect(() => {
    const saved = localStorage.getItem("servicesync-theme") || "corporate";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  function onChange(next: string) {
    setTheme(next);
    localStorage.setItem("servicesync-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <label className={`flex items-center gap-2 ${compact ? "" : "w-full"}`}>
      {!compact && <Palette className="h-4 w-4 opacity-70" />}
      <select
        className={`select select-bordered ${compact ? "select-sm w-36" : "w-full"}`}
        value={theme}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Theme"
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
