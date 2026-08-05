"use client";

import { useEffect, useState } from "react";

export const DEFAULT_THEME = "servicesync";
export const THEME_STORAGE_KEY = "servicesync-theme";

const THEMES = [
  { id: "servicesync", label: "ServiceSync", hint: "Default dark blue console" },
  { id: "corporate", label: "Corporate", hint: "Light business look" },
  { id: "business", label: "Business", hint: "Dark professional look" },
  { id: "nord", label: "Nord", hint: "Cool muted palette" },
  { id: "emerald", label: "Emerald", hint: "Blue-accent emerald" },
  { id: "cupcake", label: "Cupcake", hint: "Soft light theme" },
  { id: "dim", label: "Dim", hint: "Low-contrast dark theme" },
] as const;

export function ThemeSelector() {
  const [theme, setTheme] = useState(DEFAULT_THEME);

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  function onChange(next: string) {
    setTheme(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Theme</legend>
      <p className="text-xs opacity-70">ServiceSync dark is the default. Your choice is saved on this device.</p>
      <div className="space-y-2">
        {THEMES.map((item) => {
          const selected = theme === item.id;
          return (
            <label
              key={item.id}
              className={`flex cursor-pointer items-start gap-3 rounded-box border px-3 py-2 ${
                selected ? "border-primary bg-primary/10" : "border-base-300"
              }`}
            >
              <input
                type="radio"
                className="radio radio-primary radio-sm mt-0.5"
                name="servicesync-theme"
                value={item.id}
                checked={selected}
                onChange={() => onChange(item.id)}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{item.label}</span>
                  {item.id === DEFAULT_THEME ? <span className="badge badge-ghost badge-sm">Default</span> : null}
                </span>
                <span className="block text-xs opacity-60">{item.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
