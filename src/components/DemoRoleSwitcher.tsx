"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEMO_ACCOUNTS, roleHomePath, type UserRole } from "@/lib/constants";
import { isDemoModeEnabled } from "@/lib/demo-mode";
import { switchDemoRole } from "@/lib/demo-switch";
import { createClient } from "@/lib/supabase/client";

type DemoAccount = (typeof DEMO_ACCOUNTS)[number];

export function DemoRoleSwitcher({ currentRole }: { currentRole: UserRole }) {
  const demoMode = isDemoModeEnabled();
  const [pending, setPending] = useState<DemoAccount | null>(null);
  const [password, setPassword] = useState("");
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (pending && !demoMode) {
      passwordRef.current?.focus();
    }
  }, [pending, demoMode]);

  useEffect(() => {
    if (!pending || demoMode) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPending(null);
        setPassword("");
        setError(null);
        setSwitching(false);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pending, demoMode]);

  async function performDemoSwitch(account: DemoAccount) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSwitching(true);
    setError(null);

    const result = await switchDemoRole(account.role);
    if (!result.ok) {
      inFlightRef.current = false;
      setSwitching(false);
      setError(result.error);
      return;
    }

    const path = window.location.pathname;
    const stayOnSharedCustomerView =
      path === "/customers" || path.startsWith("/customers/");
    window.location.assign(stayOnSharedCustomerView ? path : result.homePath);
  }

  function onSelectRole(nextRole: string) {
    setError(null);
    if (nextRole === currentRole) {
      setPending(null);
      setPassword("");
      return;
    }
    const account = DEMO_ACCOUNTS.find((a) => a.role === nextRole);
    if (!account) return;

    if (demoMode) {
      void performDemoSwitch(account);
      return;
    }

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
    if (!pending || inFlightRef.current) return;
    if (!password.trim()) {
      setError("Enter the password for that role to continue.");
      return;
    }

    inFlightRef.current = true;
    setSwitching(true);
    setError(null);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: pending.email,
      password,
    });

    if (signError) {
      inFlightRef.current = false;
      setSwitching(false);
      const msg = (signError.message || "").trim();
      setError(
        !msg || msg === "Invalid login credentials"
          ? "That password did not match. Role was not changed."
          : msg
      );
      return;
    }

    const path = window.location.pathname;
    const stayOnSharedCustomerView =
      path === "/customers" || path.startsWith("/customers/");
    if (stayOnSharedCustomerView) {
      window.location.assign(path);
      return;
    }
    window.location.assign(roleHomePath(pending.role));
  }

  const selectedRole = pending?.role ?? currentRole;

  const passwordModal =
    mounted && pending && !demoMode
      ? createPortal(
          <div className="modal modal-open" style={{ zIndex: 80 }}>
            <div className="modal-box max-w-md rounded-2xl shadow-2xl">
              <h3 className="text-lg font-semibold tracking-tight">Confirm role switch</h3>
              <p className="mt-2 text-sm leading-relaxed opacity-80">
                Switching to <strong>{pending.label}</strong> requires that role&apos;s password. A
                technician should not open billing or manager screens without this step.
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
                    className="input input-bordered w-full rounded-xl"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                {error ? <p className="text-sm text-error">{error}</p> : null}
                <div className="modal-action">
                  <button type="button" className="btn btn-ghost rounded-xl" onClick={cancel} disabled={switching}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary rounded-xl" disabled={switching}>
                    {switching ? "Switching…" : "Switch role"}
                  </button>
                </div>
              </form>
            </div>
            <button type="button" className="modal-backdrop" aria-label="Close" onClick={cancel} />
          </div>,
          document.body
        )
      : null;

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

      {demoMode ? (
        <p className="mt-1 text-[11px] opacity-60">
          {switching ? "Switching demo role…" : `Demo Mode · ${labelForRole(currentRole)}`}
        </p>
      ) : null}

      {error && demoMode ? <p className="mt-1 max-w-xs text-center text-xs text-error">{error}</p> : null}

      {passwordModal}
    </div>
  );
}

function labelForRole(role: UserRole) {
  return DEMO_ACCOUNTS.find((account) => account.role === role)?.label ?? role;
}
