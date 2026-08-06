"use client";

import { useRef, useState } from "react";
import { DEMO_ACCOUNTS, type UserRole } from "@/lib/constants";
import { switchDemoRole } from "@/lib/demo-switch";

type DemoAccount = (typeof DEMO_ACCOUNTS)[number];

export function DemoRoleSwitcher({ currentRole }: { currentRole: UserRole }) {
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

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
    if (nextRole === currentRole) return;
    const account = DEMO_ACCOUNTS.find((a) => a.role === nextRole);
    if (!account) return;
    void performDemoSwitch(account);
  }

  return (
    <div className="flex min-w-0 flex-col items-center">
      <label className="flex items-center gap-2">
        <span className="hidden text-xs font-semibold uppercase tracking-wide opacity-60 xl:inline">
          Demo Role Switcher
        </span>
        <select
          className="select select-bordered select-sm w-44 sm:w-56"
          aria-label="Demo Role Switcher"
          value={currentRole}
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

      <p className="mt-1 text-[11px] opacity-60">
        {switching ? "Switching demo role…" : `Demo Mode · ${labelForRole(currentRole)}`}
      </p>

      {error ? <p className="mt-1 max-w-xs text-center text-xs text-error">{error}</p> : null}
    </div>
  );
}

function labelForRole(role: UserRole) {
  return DEMO_ACCOUNTS.find((account) => account.role === role)?.label ?? role;
}
