"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_ACCOUNTS, type UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

type DemoAccount = (typeof DEMO_ACCOUNTS)[number];

export function DemoRoleSwitcher({ currentRole }: { currentRole: UserRole }) {
  const [pending, setPending] = useState<DemoAccount | null>(null);
  const [password, setPassword] = useState("");
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pending) {
      passwordRef.current?.focus();
    }
  }, [pending]);

  function onSelectRole(nextRole: string) {
    setError(null);
    if (nextRole === currentRole) {
      setPending(null);
      setPassword("");
      return;
    }
    const account = DEMO_ACCOUNTS.find((a) => a.role === nextRole);
    if (!account) return;
    setPending(account);
    setPassword("");
  }

  function cancel() {
    setPending(null);
    setPassword("");
    setError(null);
    setSwitching(false);
  }

  async function confirmSwitch(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    if (!password.trim()) {
      setError("Enter the password for that role to continue.");
      return;
    }

    setSwitching(true);
    setError(null);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: pending.email,
      password,
    });

    if (signError) {
      setSwitching(false);
      const msg = (signError.message || "").trim();
      setError(
        !msg || msg === "Invalid login credentials"
          ? "That password did not match. Role was not changed."
          : msg
      );
      return;
    }

    // Stay on the same customer/list URL when possible so each role sees the same live record.
    const path = window.location.pathname;
    const stayOnSharedCustomerView =
      path === "/customers" || path.startsWith("/customers/");
    window.location.assign(stayOnSharedCustomerView ? path : "/dashboard");
  }

  const selectedRole = pending?.role ?? currentRole;

  return (
    <div className="flex min-w-0 flex-col items-center">
      <label className="flex items-center gap-2">
        <span className="hidden text-xs font-semibold uppercase tracking-wide opacity-60 xl:inline">
          Demo Role Switcher
        </span>
        <select
          className="select select-bordered select-sm w-44 sm:w-56"
          aria-label="Demo Role Switcher"
          value={selectedRole}
          disabled={switching}
          onChange={(e) => onSelectRole(e.target.value)}
        >
          {DEMO_ACCOUNTS.map((account) => (
            <option key={account.role} value={account.role}>
              {account.label}
            </option>
          ))}
        </select>
      </label>

      {pending ? (
        <div className="modal modal-open z-50">
          <div className="modal-box">
            <h3 className="text-lg font-semibold">Confirm role switch</h3>
            <p className="mt-2 text-sm opacity-80">
              Switching to <strong>{pending.label}</strong> requires that role&apos;s password.
              A technician should not open billing or manager screens without this step.
            </p>
            <p className="mt-3 text-sm">
              Account: <span className="font-medium">{pending.email}</span>
            </p>
            <form className="mt-4 space-y-3" onSubmit={confirmSwitch}>
              <label className="form-control w-full">
                <span className="label-text mb-1">Password</span>
                <input
                  ref={passwordRef}
                  type="password"
                  className="input input-bordered w-full"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              {error ? <p className="text-sm text-error">{error}</p> : null}
              <div className="modal-action">
                <button type="button" className="btn btn-ghost" onClick={cancel} disabled={switching}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={switching}>
                  {switching ? "Switching…" : "Switch role"}
                </button>
              </div>
            </form>
          </div>
          <button type="button" className="modal-backdrop" aria-label="Close" onClick={cancel} />
        </div>
      ) : null}
    </div>
  );
}
