"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { processContractRenewal } from "@/lib/contracts";
import type { ContractStatus, RenewalType } from "@/lib/types";

type DueContract = {
  id: string;
  status: ContractStatus;
  start_date: string;
  end_date: string | null;
  renewal_type: RenewalType | string | null;
  version_number: number | null;
  contract_number: string;
  name: string;
};

export function RenewalsActionsClient({
  profileId,
  contracts,
}: {
  profileId: string;
  contracts: DueContract[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function processAll() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    let ok = 0;
    const failures: string[] = [];

    for (const contract of contracts) {
      const { error: renewError } = await processContractRenewal(supabase, {
        contract,
        method: "auto",
        notes: "Bulk auto-renew from Renewal & Expiration",
        renewedBy: profileId,
      });
      if (renewError) {
        failures.push(`${contract.contract_number}: ${renewError.message}`);
      } else {
        ok += 1;
      }
    }

    setBusy(false);
    if (failures.length) {
      setError(failures.join(" · "));
    }
    if (ok > 0) {
      setMessage(`Processed ${ok} auto-renewal${ok === 1 ? "" : "s"}.`);
      router.refresh();
    }
  }

  return (
    <div className="rounded-box border border-warning/40 bg-warning/10 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Auto-renewals due</h2>
          <p className="text-sm opacity-70">
            {contracts.length} contract{contracts.length === 1 ? "" : "s"} with auto-renew and a
            past end date.
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {contracts.map((c) => (
              <li key={c.id}>
                {c.contract_number} — {c.name}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          className="btn btn-warning btn-sm"
          disabled={busy}
          onClick={processAll}
        >
          {busy ? "Processing…" : "Process all due auto-renewals"}
        </button>
      </div>
      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      {message ? <div className="alert alert-success text-sm">{message}</div> : null}
    </div>
  );
}
