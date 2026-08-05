"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEMO_ACCOUNTS, type UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

export function DemoRoleSwitcher({ currentRole }: { currentRole: UserRole }) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchRole(nextRole: string) {
    const account = DEMO_ACCOUNTS.find((a) => a.role === nextRole);
    if (!account || account.role === currentRole) return;

    setError(null);
    setSwitching(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });

    if (signError) {
      setSwitching(false);
      setError("Could not switch roles. Try signing out and using the demo login selector.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-w-0 flex-col items-center">
      <label className="flex items-center gap-2">
        <span className="hidden text-xs font-semibold uppercase tracking-wide opacity-60 lg:inline">
          Demo Role Switcher
        </span>
        <select
          className="select select-bordered select-sm w-44 sm:w-56"
          aria-label="Demo Role Switcher"
          value={currentRole}
          disabled={switching}
          onChange={(e) => void switchRole(e.target.value)}
        >
          {DEMO_ACCOUNTS.map((account) => (
            <option key={account.role} value={account.role}>
              {account.label}
            </option>
          ))}
        </select>
      </label>
      {switching ? <p className="mt-1 text-xs opacity-60">Switching role…</p> : null}
      {error ? <p className="mt-1 text-xs text-error">{error}</p> : null}
    </div>
  );
}
