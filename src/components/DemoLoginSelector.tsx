"use client";

import { useRef, useState } from "react";
import { DEMO_ACCOUNTS, type UserRole } from "@/lib/constants";
import { isDemoModeEnabled } from "@/lib/demo-mode";

/** Public class-demo password shown in README; used when Demo Mode API is off. */
const FALLBACK_DEMO_PASSWORD = "1234";

type Props = {
  onSelect: (email: string, password: string) => void;
};

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

    try {
      if (demoMode) {
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

        if (res.ok && data.email && data.password) {
          setSelectedEmail(data.email);
          onSelect(data.email, data.password);
          return;
        }
      }

      setSelectedEmail(account.email);
      onSelect(account.email, FALLBACK_DEMO_PASSWORD);
    } catch {
      setSelectedEmail(account.email);
      onSelect(account.email, FALLBACK_DEMO_PASSWORD);
    } finally {
      inFlightRef.current = false;
      setLoadingRole(null);
    }
  }

  return (
    <div className="login-demo-panel rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 sm:p-5">
      <p className="text-sm font-semibold tracking-tight">Demo Login Selector</p>
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
              {loading ? "Loading…" : account.label}
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
    </div>
  );
}
