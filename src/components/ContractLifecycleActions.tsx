"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { ContractStatus } from "@/lib/types";
import type { UserRole } from "@/lib/constants";
import {
  canDeleteContractRecord,
  canRenewContracts,
  getLifecycleActionsForRole,
  type LifecycleAction,
} from "@/lib/contracts";

type Props = {
  contractId: string;
  status: ContractStatus;
  role: UserRole;
  profileId: string;
  /** When set, disables Mark Completed (active → expired) with this reason. */
  completeBlockedReason?: string | null;
};

export function ContractLifecycleActions({
  contractId,
  status,
  role,
  profileId,
  completeBlockedReason = null,
}: Props) {
  const router = useRouter();
  const actions = getLifecycleActionsForRole(status, role);
  const canDelete = canDeleteContractRecord(role, status);
  const canRenew = canRenewContracts(role);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  async function applyTransition(action: LifecycleAction) {
    setError(null);
    setMessage(null);
    if (action.to === "canceled" && !cancelReason.trim()) {
      setError("Enter a cancellation reason before canceling.");
      return;
    }
    if (action.to === "expired" && completeBlockedReason) {
      setError(completeBlockedReason);
      return;
    }
    if (action.to === "active" && status === "pending_approval") {
      setError(
        "Pending contracts become Active only after the customer signs and accepts in My Contracts."
      );
      return;
    }

    setBusy(action.to);
    try {
      const supabase = createClient();
      const updates: Record<string, unknown> = {
        status: action.to,
        updated_by: profileId,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from("contracts")
        .update(updates)
        .eq("id", contractId);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      await supabase.from("contract_changes").insert({
        contract_id: contractId,
        field_name: "status",
        previous_value: status,
        new_value: action.to,
        change_reason:
          action.to === "canceled"
            ? cancelReason.trim()
            : action.label,
        changed_by: profileId,
        source: "lifecycle",
      });

      setMessage(`${action.label} completed.`);
      setCancelReason("");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function deleteContract() {
    if (!canDelete) return;
    if (!window.confirm("Permanently delete this contract? This cannot be undone.")) return;
    setBusy("delete");
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase.from("contracts").delete().eq("id", contractId);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      router.push("/contracts/reports");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (actions.length === 0 && !canDelete && !canRenew) {
    return (
      <p className="mt-3 text-sm opacity-60">
        No lifecycle actions available for your role on this status.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      {message ? <div className="alert alert-success text-sm">{message}</div> : null}

      {actions.some((a) => a.to === "canceled") ? (
        <label className="form-control w-full max-w-xl">
          <span className="label-text text-xs">Cancellation reason (required to cancel)</span>
          <textarea
            className="textarea textarea-bordered textarea-sm"
            rows={2}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Why is this agreement being cancelled?"
          />
        </label>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => (
          <div
            key={action.to}
            className="rounded-box border border-base-300 bg-base-200/40 p-3 flex flex-col gap-2"
          >
            <p className="text-sm font-medium">{action.label}</p>
            <p className="text-xs opacity-60 flex-1">
              {action.to === "expired" && completeBlockedReason
                ? completeBlockedReason
                : action.description}
            </p>
            <button
              type="button"
              className={`btn btn-sm ${
                action.to === "canceled"
                  ? "btn-error"
                  : action.to === "active"
                    ? "btn-primary"
                    : "btn-outline"
              }`}
              disabled={
                busy != null || (action.to === "expired" && Boolean(completeBlockedReason))
              }
              onClick={() => applyTransition(action)}
            >
              {busy === action.to ? "Working…" : action.label}
            </button>
          </div>
        ))}

        {canRenew ? (
          <div className="rounded-box border border-base-300 bg-base-200/40 p-3 flex flex-col gap-2">
            <p className="text-sm font-medium">Renew Contract</p>
            <p className="text-xs opacity-60 flex-1">
              Process auto or manual renewal and extend the term from Renewal & Expiration.
            </p>
            <Link href="#renewal-expiration" className="btn btn-sm btn-outline">
              Go to renewals
            </Link>
          </div>
        ) : null}

        {canDelete ? (
          <div className="rounded-box border border-error/30 bg-error/5 p-3 flex flex-col gap-2">
            <p className="text-sm font-medium">Delete Contract</p>
            <p className="text-xs opacity-60 flex-1">
              Permanently remove this {status === "draft" ? "draft" : "cancelled"} agreement.
            </p>
            <button
              type="button"
              className="btn btn-sm btn-error btn-outline"
              disabled={busy != null}
              onClick={deleteContract}
            >
              {busy === "delete" ? "Deleting…" : "Delete"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
