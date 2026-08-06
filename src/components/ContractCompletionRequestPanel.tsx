"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import {
  type CompletionRequestSnapshot,
} from "@/lib/contracts/completionRequests";

type Props = {
  contractId: string;
  contractStatus: string;
  role: UserRole;
  latestRequest: CompletionRequestSnapshot | null;
};

export function ContractCompletionRequestPanel({
  contractId,
  contractStatus,
  role,
  latestRequest,
}: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isActive = contractStatus === "active";
  const isOpen = latestRequest?.new_value === "requested";
  const isTechnician = role === "technician";
  const isManager = role === "manager" || role === "admin";

  if (!isActive) return null;
  if (!isTechnician && !isManager) return null;

  async function writeRequest(nextValue: "requested" | "acknowledged", reason: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error: rpcError } =
        nextValue === "requested"
          ? await supabase.rpc("request_contract_completion", {
              p_contract_id: contractId,
              p_note: reason,
            })
          : await supabase.rpc("acknowledge_contract_completion_request", {
              p_contract_id: contractId,
            });
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setMessage(
        nextValue === "requested"
          ? "Manager notified that this contract is ready to complete."
          : "Completion request acknowledged."
      );
      setNote("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (isTechnician) {
    return (
      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <p className="text-sm font-semibold">Notify manager — contract complete</p>
        <p className="mt-1 text-xs opacity-70">
          Tell your manager this active agreement is ready for them to mark completed. This does not
          change the contract status.
        </p>
        {error ? <div className="alert alert-error mt-3 text-sm">{error}</div> : null}
        {message ? <div className="alert alert-success mt-3 text-sm">{message}</div> : null}
        {isOpen ? (
          <div className="alert alert-info mt-3 text-sm" role="status">
            <span>
              Request already sent
              {latestRequest?.changed_at ? ` on ${formatDateTime(latestRequest.changed_at)}` : ""}.
              {latestRequest?.change_reason ? ` Note: ${latestRequest.change_reason}` : ""}
            </span>
          </div>
        ) : (
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void writeRequest(
                "requested",
                note.trim() || "Technician reports this contract is ready to complete."
              );
            }}
          >
            <label className="flex w-full flex-col gap-1">
              <span className="text-sm font-medium">Note for manager (optional)</span>
              <textarea
                className="textarea textarea-bordered w-full"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. All assigned tickets closed; included hours wrapped up."
              />
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? "Sending…" : "Notify manager"}
            </button>
          </form>
        )}
      </div>
    );
  }

  // Manager / admin view
  if (!isOpen) return null;

  return (
    <div className="rounded-box border border-warning/40 bg-warning/10 p-4">
      <p className="text-sm font-semibold">Technician requested contract completion</p>
      <p className="mt-1 text-xs opacity-80">
        {latestRequest?.changed_at ? formatDateTime(latestRequest.changed_at) : "Recently"}
        {latestRequest?.change_reason ? ` — ${latestRequest.change_reason}` : ""}
      </p>
      <p className="mt-2 text-xs opacity-70">
        Review the agreement, then use <span className="font-medium">Mark Completed</span> in
        Contract Lifecycle when ready. Acknowledging only clears this notice.
      </p>
      {error ? <div className="alert alert-error mt-3 text-sm">{error}</div> : null}
      {message ? <div className="alert alert-success mt-3 text-sm">{message}</div> : null}
      <button
        type="button"
        className="btn btn-outline btn-sm mt-3"
        disabled={busy}
        onClick={() =>
          void writeRequest("acknowledged", "Manager acknowledged technician completion request.")
        }
      >
        {busy ? "Working…" : "Acknowledge request"}
      </button>
    </div>
  );
}
