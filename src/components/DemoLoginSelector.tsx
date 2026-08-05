"use client";

import { DEMO_ACCOUNTS } from "@/lib/constants";

type Props = {
  onSelect: (email: string, password: string) => void;
};

export function DemoLoginSelector({ onSelect }: Props) {
  return (
    <div className="rounded-box border border-base-300 bg-base-200/60 p-4">
      <p className="text-sm font-semibold">Demo Login Selector</p>
      <p className="mt-1 text-xs opacity-70">
        For class demos only. Pick a role to fill the login form, then click Sign in.
        Each account still uses real Supabase Auth and database security.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.email}
            type="button"
            className="btn btn-outline btn-sm justify-start"
            onClick={() => onSelect(account.email, account.password)}
          >
            {account.label}
          </button>
        ))}
      </div>
    </div>
  );
}
