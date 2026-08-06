"use client";

import { useRef, useState } from "react";
import { DEMO_ACCOUNTS, type UserRole } from "@/lib/constants";
import { isDemoModeEnabled } from "@/lib/demo-mode";

type Props = {
  onSelect: (email: string, password: string) => void;
};

export function DemoLoginSelector({ onSelect }: Props) {
  const demoMode = isDemoModeEnabled();
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  if (!demoMode) {
    return null;
  }

  async function onPick(role: UserRole) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoadingRole(role);
    setError(null);

    try {
      const res = await fetch("/api/demo/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        email?: string;
        password?: string;
        error?: string;
      };

      if (!res.ok || !data.email || !data.password) {
        setError(
          data.error ||
            (res.redirected || res.status === 307 || res.status === 302
              ? "Demo autofill was blocked. Refresh and try again."
              : "Could not load demo credentials.")
        );
        return;
      }

      setSelectedEmail(data.email);
      onSelect(data.email, data.password);
    } catch {
      setError("Network error while loading demo credentials.");
    } finally {
      inFlightRef.current = false;
      setLoadingRole(null);
    }
  }

  return (
    <div className="rounded-xl border border-base-300/70 bg-base-200/40 p-3.5 sm:p-4">
      <p className="text-sm font-semibold">Demo Login Selector</p>
      <p className="mt-1.5 text-xs leading-relaxed text-base-content/70">
        For class demos only. Pick a role to fill the login form, then click Sign in.
        Each account still uses real Supabase Auth and database security.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                "btn login-demo-role-btn h-11 min-h-11 w-full justify-center px-3 text-sm font-medium normal-case",
                "border",
                selected ? "login-demo-role-btn-selected" : "",
              ].join(" ")}
              onClick={() => void onPick(account.role)}
            >
              {loading ? "Loading…" : account.label}
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
    </div>
  );
}
