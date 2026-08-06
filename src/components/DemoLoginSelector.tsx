"use client";

import { useRef, useState } from "react";
import { DEMO_ACCOUNTS, type UserRole } from "@/lib/constants";
import { isDemoModeEnabled } from "@/lib/demo-mode";
import { switchDemoRole } from "@/lib/demo-switch";

type Props = {
  /** Legacy autofill callback when Demo Mode API is unavailable. */
  onSelect?: (email: string, password: string) => void;
};

/**
 * One-click demo login. With Demo Mode on, signs in and navigates without typing a password.
 */
export function DemoLoginSelector({ onSelect }: Props) {
  const demoMode = isDemoModeEnabled();
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  async function onPick(role: UserRole) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoadingRole(role);
    setError(null);

    const account = DEMO_ACCOUNTS.find((row) => row.role === role);
    if (!account) {
      inFlightRef.current = false;
      setLoadingRole(null);
      setError("Unknown demo role.");
      return;
    }

    setSelectedEmail(account.email);

    try {
      if (demoMode) {
        const result = await switchDemoRole(role);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        window.location.assign(result.homePath);
        return;
      }

      // Fallback when Demo Mode is off: autofill the form (password still required to submit).
      const res = await fetch("/api/demo/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        email?: string;
        password?: string;
      };

      if (res.ok && data.email && data.password && onSelect) {
        onSelect(data.email, data.password);
        return;
      }

      onSelect?.(account.email, "1234");
    } catch {
      setError("Could not start demo login. Try again.");
    } finally {
      inFlightRef.current = false;
      setLoadingRole(null);
    }
  }

  return (
    <div className="login-demo-panel rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 sm:p-5">
      <p className="text-sm font-semibold tracking-tight">Demo Login Selector</p>
      <p className="mt-1 text-xs text-slate-500">
        {demoMode
          ? "Click a role to sign in instantly — no password needed."
          : "Click a role to fill the form, then sign in."}
      </p>
      <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {DEMO_ACCOUNTS.map((account) => {
          const selected = selectedEmail === account.email;
          const loading = loadingRole === account.role;
          return (
            <button
              key={account.email}
              type="button"
              aria-pressed={selected}
              disabled={loadingRole !== null}
              className={[
                "btn login-demo-role-btn h-11 min-h-11 w-full justify-center px-3.5 text-sm font-medium normal-case",
                "border",
                selected ? "login-demo-role-btn-selected" : "",
              ].join(" ")}
              onClick={() => void onPick(account.role)}
            >
              {loading ? "Signing in…" : account.label}
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
    </div>
  );
}
