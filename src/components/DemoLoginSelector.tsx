"use client";

import { useState } from "react";
import { DEMO_ACCOUNTS } from "@/lib/constants";

type Props = {
  onSelect: (email: string, password: string) => void;
};

export function DemoLoginSelector({ onSelect }: Props) {
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

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
          return (
            <button
              key={account.email}
              type="button"
              aria-pressed={selected}
              className={[
                "btn h-11 min-h-11 w-full justify-center px-3 text-sm font-medium normal-case",
                "border transition-colors duration-150",
                selected
                  ? "border-primary bg-primary/10 text-primary hover:border-primary hover:bg-primary/15"
                  : "btn-outline border-base-300/80 bg-base-100/70 hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
              ].join(" ")}
              onClick={() => {
                setSelectedEmail(account.email);
                onSelect(account.email, account.password);
              }}
            >
              {account.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
