"use client";

import { useEffect, useState } from "react";

export const THEME_STORAGE_KEY = "servicesync-theme";
export const DEFAULT_APPEARANCE = "system" as const;

export type AppearancePreference = "light" | "dark" | "system";

const LIGHT_THEME = "corporate";
const DARK_THEME = "business";

const OPTIONS: { id: AppearancePreference; label: string; hint: string }[] = [
  { id: "light", label: "Light", hint: "Always use the light theme" },
  { id: "dark", label: "Dark", hint: "Always use the dark theme" },
  { id: "system", label: "Match system", hint: "Follow this computer's light or dark setting" },
];

/** @deprecated Use DEFAULT_APPEARANCE — kept for existing ThemeInit imports during migration. */
export const DEFAULT_THEME = DEFAULT_APPEARANCE;

function prefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function normalizeAppearance(raw: string | null): AppearancePreference {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  // Migrate older DaisyUI theme ids
  if (raw === "business" || raw === "dim" || raw === "nord") return "dark";
  if (raw === "corporate" || raw === "emerald" || raw === "cupcake") return "light";
  return DEFAULT_APPEARANCE;
}

export function resolveTheme(preference: AppearancePreference): string {
  if (preference === "light") return LIGHT_THEME;
  if (preference === "dark") return DARK_THEME;
  return prefersDark() ? DARK_THEME : LIGHT_THEME;
}

export function applyAppearance(preference: AppearancePreference) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolveTheme(preference));
}

export function readAppearance(): AppearancePreference {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  return normalizeAppearance(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export function ThemeSelector() {
  const [appearance, setAppearance] = useState<AppearancePreference>(() =>
    typeof window === "undefined" ? DEFAULT_APPEARANCE : readAppearance()
  );

  useEffect(() => {
    applyAppearance(appearance);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onSystemChange() {
      if (readAppearance() === "system") applyAppearance("system");
    }
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, [appearance]);

  function onChange(next: AppearancePreference) {
    setAppearance(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyAppearance(next);
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Theme</legend>
      <p className="text-xs opacity-70">Your choice is saved on this device.</p>
      <div className="space-y-2">
        {OPTIONS.map((item) => {
          const selected = appearance === item.id;
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
                <span className="block font-medium">{item.label}</span>
                <span className="block text-xs opacity-60">{item.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
