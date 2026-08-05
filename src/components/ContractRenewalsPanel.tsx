"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui";
import { formatDate, formatDateTime, statusLabel } from "@/lib/format";
import {
  computeRenewedTermDates,
  isEligibleForAutoRenew,
  isEligibleForManualRenew,
  isAutoRenewContract,
  processContractRenewal,
  reminderBadgeClass,
  reminderKindLabel,
  unwrapProfile,
  type ContractRenewal,
  type ContractRenewalReminder,
  type ReminderKind,
} from "@/lib/contracts";
import type { Contract } from "@/lib/types";

export type RenewalReminderRow = ContractRenewalReminder & {
  acknowledged_by_profile?: { full_name: string } | { full_name: string }[] | null;
};

export type RenewalHistoryRow = ContractRenewal & {
  renewed_by_profile?: { full_name: string } | { full_name: string }[] | null;
};

type Props = {
  contract: Pick<
    Contract,
    "id" | "status" | "start_date" | "end_date" | "renewal_type" | "version_number"
  >;
  profileId: string;
  canManage: boolean;
  reminders: RenewalReminderRow[];
  renewals: RenewalHistoryRow[];
};

export function ContractRenewalsPanel({
  contract,
  profileId,
  canManage,
  reminders,
  renewals,
}: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const autoRenew = isAutoRenewContract(contract);
  const canAuto = canManage && isEligibleForAutoRenew(contract);
  const canManual = canManage && isEligibleForManualRenew(contract);
  const preview = computeRenewedTermDates(contract);
  const openReminders = reminders.filter((r) => r.status === "open");

  async function acknowledgeReminder(reminderId: string) {
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("contract_renewal_reminders")
      .update({
        status: "acknowledged",
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: profileId,
      })
      .eq("id", reminderId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Reminder acknowledged.");
    router.refresh();
  }

  async function renew(method: "auto" | "manual") {
    setError(null);
    setMessage(null);
    if (!canManage) {
      setError("Only managers can renew contracts.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error: renewError } = await processContractRenewal(supabase, {
        contract,
        method,
        notes,
        renewedBy: profileId,
      });
      if (renewError || !data) {
        setError(renewError?.message ?? "Renewal failed.");
        return;
      }
      setNotes("");
      setMessage(
        `${method === "auto" ? "Auto" : "Manual"} renewal recorded. New end date: ${data.newEndDate}.`
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-box border border-base-300 p-3">
          <p className="text-xs uppercase tracking-wide opacity-50">Renewal type</p>
          <p className="mt-1 font-medium">{statusLabel(String(contract.renewal_type ?? "none"))}</p>
          {autoRenew ? (
            <p className="mt-1 text-xs text-success">Auto-renew enabled</p>
          ) : null}
        </div>
        <div className="rounded-box border border-base-300 p-3">
          <p className="text-xs uppercase tracking-wide opacity-50">Current end date</p>
          <p className="mt-1 font-medium">{formatDate(contract.end_date)}</p>
        </div>
        <div className="rounded-box border border-base-300 p-3">
          <p className="text-xs uppercase tracking-wide opacity-50">Next term (if renewed)</p>
          <p className="mt-1 font-medium">
            {preview
              ? `${formatDate(preview.newStartDate)} → ${formatDate(preview.newEndDate)}`
              : "—"}
          </p>
          {preview ? (
            <p className="mt-1 text-xs opacity-60">{preview.termDays}-day term</p>
          ) : null}
        </div>
      </div>

      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      {message ? <div className="alert alert-success text-sm">{message}</div> : null}

      {canManage ? (
        <div className="rounded-box border border-base-300 bg-base-200/40 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Process renewal</h3>
          <p className="text-xs opacity-70">
            Extends the end date by the prior term length, keeps the contract active, resolves open
            reminders, and appends renewal history.
          </p>
          <label className="form-control w-full">
            <span className="label-text text-xs">Notes (optional)</span>
            <textarea
              className="textarea textarea-bordered textarea-sm"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason or customer confirmation notes"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !canAuto}
              onClick={() => renew("auto")}
              title={
                canAuto
                  ? "Process auto-renewal"
                  : "Available when auto-renew is set and the end date has passed"
              }
            >
              {busy ? "Working…" : "Process auto-renew"}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={busy || !canManual}
              onClick={() => renew("manual")}
            >
              Record manual renewal
            </button>
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-60">
          Active reminders & warnings
        </h3>
        {openReminders.length === 0 ? (
          <EmptyState
            title="No open renewal or expiration reminders"
            description="Reminders appear automatically at 90, 60, and 30 days before renewal, plus expiration warnings."
          />
        ) : (
          <div className="overflow-x-auto rounded-box border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Anchor</th>
                  <th>Generated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {openReminders.map((reminder) => (
                  <tr key={reminder.id}>
                    <td>
                      <span
                        className={`badge badge-sm ${reminderBadgeClass(reminder.reminder_kind as ReminderKind)}`}
                      >
                        {reminderKindLabel(reminder.reminder_kind as ReminderKind)}
                      </span>
                    </td>
                    <td className="text-sm max-w-md">{reminder.message}</td>
                    <td className="text-xs whitespace-nowrap">{formatDate(reminder.anchor_date)}</td>
                    <td className="text-xs whitespace-nowrap">
                      {formatDateTime(reminder.generated_at)}
                    </td>
                    <td>
                      {canManage ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => acknowledgeReminder(reminder.id)}
                        >
                          Acknowledge
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-60">
          Renewal history
        </h3>
        {renewals.length === 0 ? (
          <EmptyState
            title="No renewals recorded"
            description="Auto and manual renewals will appear here with previous and new term dates."
          />
        ) : (
          <div className="overflow-x-auto rounded-box border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Previous end</th>
                  <th>New term</th>
                  <th>Status</th>
                  <th>Renewed</th>
                  <th>By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {renewals.map((row) => {
                  const by = unwrapProfile(row.renewed_by_profile)?.full_name ?? "—";
                  return (
                    <tr key={row.id}>
                      <td>
                        <span
                          className={`badge badge-sm ${
                            row.renewal_method === "auto" ? "badge-success" : "badge-ghost"
                          }`}
                        >
                          {statusLabel(row.renewal_method)}
                        </span>
                      </td>
                      <td className="text-xs whitespace-nowrap">
                        {formatDate(row.previous_end_date)}
                      </td>
                      <td className="text-xs whitespace-nowrap">
                        {formatDate(row.new_start_date)} → {formatDate(row.new_end_date)}
                      </td>
                      <td className="text-xs">
                        {statusLabel(row.previous_status ?? "")} →{" "}
                        {statusLabel(row.resulting_status)}
                      </td>
                      <td className="text-xs whitespace-nowrap">
                        {formatDateTime(row.renewed_at)}
                      </td>
                      <td className="text-xs">{by}</td>
                      <td className="text-xs max-w-[12rem] truncate" title={row.notes ?? ""}>
                        {row.notes || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
