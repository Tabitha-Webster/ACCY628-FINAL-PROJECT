"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui";
import { canMarkContractCompleted } from "@/lib/contracts/delivery-completion";
import type { ContractStatus } from "@/lib/types";

type Props = {
  contractId: string;
  contractNumber: string;
  status: ContractStatus;
  profileId: string;
  openTicketCount: number;
  totalTicketCount: number;
  incompleteProjectCount: number;
  totalProjectCount: number;
};

export function MarkContractCompletedButton({
  contractId,
  contractNumber,
  status,
  profileId,
  openTicketCount,
  totalTicketCount,
  incompleteProjectCount,
  totalProjectCount,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const gate = canMarkContractCompleted(status, {
    openTicketCount,
    totalTicketCount,
    incompleteProjectCount,
    totalProjectCount,
  });

  async function markCompleted() {
    if (!gate.ok) {
      setError(gate.reason);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const signedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("contracts")
        .update({
          status: "expired",
          updated_by: profileId,
          updated_at: signedAt,
        })
        .eq("id", contractId);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      await supabase.from("contract_changes").insert({
        contract_id: contractId,
        field_name: "status",
        previous_value: status,
        new_value: "expired",
        change_reason:
          "Marked completed — all linked tickets and projects are finished",
        changed_by: profileId,
        source: "delivery_board",
      });

      setMessage(`${contractNumber} marked completed.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status !== "active" && status !== "on_hold") {
    return (
      <div className="text-right text-xs opacity-60">
        <StatusBadge status={status} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={busy || !gate.ok}
        title={gate.reason ?? "Close the contract term after delivery is finished"}
        onClick={() => void markCompleted()}
      >
        {busy ? "Working…" : "Mark Completed"}
      </button>
      {!gate.ok && gate.reason ? (
        <p className="max-w-xs text-right text-xs text-warning">{gate.reason}</p>
      ) : (
        <p className="max-w-xs text-right text-xs opacity-60">
          Linked tickets and projects are finished.
        </p>
      )}
      {error ? <p className="text-xs text-error">{error}</p> : null}
      {message ? <p className="text-xs text-success">{message}</p> : null}
      <Link href={`/contracts/${contractId}`} className="link link-hover text-xs">
        Open contract
      </Link>
    </div>
  );
}
