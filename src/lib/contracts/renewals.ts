import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contract, ContractStatus } from "@/lib/types";
import {
  RENEWAL_REMINDER_DAYS,
  RENEWAL_REMINDER_KIND_BY_DAYS,
  type RenewalReminderDays,
} from "./constants";
import { getContractRenewalDate } from "./dates";

export type ReminderKind =
  | "renewal_90"
  | "renewal_60"
  | "renewal_30"
  | "expiration_warning"
  | "expired";

export type ReminderStatus = "open" | "acknowledged" | "dismissed" | "resolved";

export type ContractRenewalReminder = {
  id: string;
  contract_id: string;
  reminder_kind: ReminderKind;
  anchor_date: string;
  days_before: number;
  status: ReminderStatus;
  message: string;
  generated_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
};

export type ContractRenewal = {
  id: string;
  contract_id: string;
  previous_start_date: string | null;
  previous_end_date: string | null;
  new_start_date: string;
  new_end_date: string | null;
  renewal_method: "auto" | "manual";
  previous_status: string | null;
  resulting_status: string;
  notes: string | null;
  renewed_by: string | null;
  renewed_at: string;
};

export type RenewalContractInput = Pick<
  Contract,
  "id" | "status" | "start_date" | "end_date" | "renewal_type"
>;

export type ComputedReminder = {
  reminder_kind: ReminderKind;
  anchor_date: string;
  days_before: number;
  message: string;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Calendar days from today to a date string (negative if past). */
export function daysUntilDate(dateValue: string | null | undefined, now: Date = new Date()): number | null {
  if (!dateValue) return null;
  const target = startOfDay(new Date(dateValue));
  if (Number.isNaN(target.getTime())) return null;
  const today = startOfDay(now);
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function addDays(isoDate: string, days: number): string {
  const d = startOfDay(new Date(isoDate));
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Term length in whole days (inclusive of start, exclusive of end+1). */
export function getTermLengthDays(startDate: string, endDate: string): number {
  const start = startOfDay(new Date(startDate));
  const end = startOfDay(new Date(endDate));
  const days = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(days, 1);
}

export function isAutoRenewContract(contract: { renewal_type: string | null }): boolean {
  return (contract.renewal_type ?? "").toLowerCase() === "auto";
}

export function isRenewableContract(contract: { renewal_type: string | null }): boolean {
  const type = (contract.renewal_type ?? "none").toLowerCase();
  return type === "auto" || type === "manual";
}

/**
 * Next term dates after renewing: new period starts the day after previous end,
 * lasting the same length as the prior start→end term.
 */
export function computeRenewedTermDates(contract: {
  start_date: string;
  end_date: string | null;
}): { newStartDate: string; newEndDate: string; termDays: number } | null {
  if (!contract.end_date) return null;
  const termDays = getTermLengthDays(contract.start_date, contract.end_date);
  const newStartDate = addDays(contract.end_date, 1);
  const newEndDate = addDays(contract.end_date, termDays);
  return { newStartDate, newEndDate, termDays };
}

export function isEligibleForAutoRenew(
  contract: RenewalContractInput,
  now: Date = new Date()
): boolean {
  if (!isAutoRenewContract(contract)) return false;
  if (contract.status !== "active" && contract.status !== "expired") return false;
  if (!contract.end_date) return false;
  const days = daysUntilDate(contract.end_date, now);
  return days != null && days <= 0;
}

export function isEligibleForManualRenew(contract: RenewalContractInput): boolean {
  if (!isRenewableContract(contract)) return false;
  return (
    contract.status === "active" ||
    contract.status === "expired" ||
    contract.status === "on_hold"
  );
}

/**
 * Build reminder specs for a contract based on end/renewal horizon.
 * Open reminders are generated when the threshold day has been reached or passed
 * but the anchor date is still in the future (or just reached).
 */
export function computeContractReminders(
  contract: RenewalContractInput,
  now: Date = new Date()
): ComputedReminder[] {
  if (contract.status !== "active" && contract.status !== "on_hold") {
    return [];
  }

  const endDays = daysUntilDate(contract.end_date, now);
  const reminders: ComputedReminder[] = [];

  if (contract.end_date && endDays != null && endDays < 0) {
    reminders.push({
      reminder_kind: "expired",
      anchor_date: contract.end_date,
      days_before: 0,
      message: `Contract end date ${contract.end_date} has passed (${Math.abs(endDays)} day${Math.abs(endDays) === 1 ? "" : "s"} overdue).`,
    });
    return reminders;
  }

  if (isRenewableContract(contract)) {
    const renewalDate = getContractRenewalDate(contract);
    const renewalDays = daysUntilDate(renewalDate, now);
    if (renewalDate && renewalDays != null && renewalDays >= 0) {
      for (const threshold of RENEWAL_REMINDER_DAYS) {
        if (renewalDays <= threshold) {
          reminders.push({
            reminder_kind: RENEWAL_REMINDER_KIND_BY_DAYS[threshold],
            anchor_date: renewalDate,
            days_before: threshold,
            message: `${threshold}-day renewal reminder: renews/ends in ${renewalDays} day${renewalDays === 1 ? "" : "s"} (${renewalDate}).`,
          });
          break; // only the tightest matching threshold
        }
      }
    }
  }

  // Expiration warning for non-renewable (or any) contracts approaching end within 30 days
  if (contract.end_date && endDays != null && endDays >= 0 && endDays <= 30) {
    if (!isRenewableContract(contract) || endDays <= 14) {
      reminders.push({
        reminder_kind: "expiration_warning",
        anchor_date: contract.end_date,
        days_before: endDays,
        message: `Expiration warning: ends in ${endDays} day${endDays === 1 ? "" : "s"} (${contract.end_date}).`,
      });
    }
  }

  return reminders;
}

export function reminderKindLabel(kind: ReminderKind): string {
  switch (kind) {
    case "renewal_90":
      return "90-day renewal";
    case "renewal_60":
      return "60-day renewal";
    case "renewal_30":
      return "30-day renewal";
    case "expiration_warning":
      return "Expiration warning";
    case "expired":
      return "Past end date";
    default:
      return kind;
  }
}

export function reminderBadgeClass(kind: ReminderKind): string {
  if (kind === "expired") return "badge-error";
  if (kind === "expiration_warning" || kind === "renewal_30") return "badge-warning";
  if (kind === "renewal_60") return "badge-info";
  return "badge-ghost";
}

/** Upsert open reminders for one contract; resolve stale open rows no longer applicable. */
export async function syncContractReminders(
  supabase: SupabaseClient,
  contract: RenewalContractInput,
  now: Date = new Date()
) {
  const computed = computeContractReminders(contract, now);
  const desiredKeys = new Set(
    computed.map((r) => `${r.reminder_kind}|${r.anchor_date}`)
  );

  const { data: existing, error: existingError } = await supabase
    .from("contract_renewal_reminders")
    .select("id, reminder_kind, anchor_date, status, message, days_before")
    .eq("contract_id", contract.id);

  if (existingError) return { error: existingError };

  const byKey = new Map(
    (existing ?? []).map((row) => [`${row.reminder_kind}|${row.anchor_date}`, row])
  );

  for (const row of existing ?? []) {
    if (row.status !== "open") continue;
    const key = `${row.reminder_kind}|${row.anchor_date}`;
    if (!desiredKeys.has(key)) {
      await supabase
        .from("contract_renewal_reminders")
        .update({ status: "resolved" })
        .eq("id", row.id);
    }
  }

  for (const reminder of computed) {
    const key = `${reminder.reminder_kind}|${reminder.anchor_date}`;
    const prior = byKey.get(key);

    if (prior) {
      if (prior.status === "acknowledged" || prior.status === "dismissed") {
        continue;
      }
      const { error } = await supabase
        .from("contract_renewal_reminders")
        .update({
          days_before: reminder.days_before,
          message: reminder.message,
          status: "open",
          generated_at: new Date().toISOString(),
        })
        .eq("id", prior.id);
      if (error) return { error };
      continue;
    }

    const { error } = await supabase.from("contract_renewal_reminders").insert({
      contract_id: contract.id,
      reminder_kind: reminder.reminder_kind,
      anchor_date: reminder.anchor_date,
      days_before: reminder.days_before,
      message: reminder.message,
      status: "open",
    });
    if (error) return { error };
  }

  return { error: null };
}

export async function syncRemindersForContracts(
  supabase: SupabaseClient,
  contracts: RenewalContractInput[],
  now: Date = new Date()
) {
  for (const contract of contracts) {
    const result = await syncContractReminders(supabase, contract, now);
    if (result.error) return result;
  }
  return { error: null };
}

export async function resolveOpenReminders(
  supabase: SupabaseClient,
  contractId: string
) {
  return supabase
    .from("contract_renewal_reminders")
    .update({ status: "resolved" })
    .eq("contract_id", contractId)
    .eq("status", "open");
}

export type ProcessRenewalInput = {
  contract: RenewalContractInput & {
    version_number?: number | null;
  };
  method: "auto" | "manual";
  notes?: string;
  renewedBy: string;
};

export type ProcessRenewalResult = {
  newStartDate: string;
  newEndDate: string;
  previousEndDate: string;
  resultingStatus: ContractStatus;
};

/**
 * Extend the contract term, write renewal history, resolve reminders, and log field changes.
 */
export async function processContractRenewal(
  supabase: SupabaseClient,
  input: ProcessRenewalInput
): Promise<{ data: ProcessRenewalResult | null; error: Error | null }> {
  const { contract, method, notes, renewedBy } = input;

  if (method === "auto" && !isEligibleForAutoRenew(contract)) {
    return {
      data: null,
      error: new Error("Contract is not eligible for auto-renewal yet (end date must have passed)."),
    };
  }
  if (method === "manual" && !isEligibleForManualRenew(contract)) {
    return {
      data: null,
      error: new Error("Contract cannot be renewed in its current status."),
    };
  }
  if (!contract.end_date) {
    return { data: null, error: new Error("Contract has no end date to renew from.") };
  }

  const term = computeRenewedTermDates(contract);
  if (!term) {
    return { data: null, error: new Error("Unable to calculate renewed term dates.") };
  }

  const previousStatus = contract.status;
  const resultingStatus: ContractStatus = "active";
  const nextVersion = Number(contract.version_number ?? 1) + 1;

  const { error: updateError } = await supabase
    .from("contracts")
    .update({
      end_date: term.newEndDate,
      status: resultingStatus,
      version_number: nextVersion,
      updated_by: renewedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contract.id);

  if (updateError) {
    return { data: null, error: new Error(updateError.message) };
  }

  const { error: historyError } = await supabase.from("contract_renewals").insert({
    contract_id: contract.id,
    previous_start_date: contract.start_date,
    previous_end_date: contract.end_date,
    new_start_date: term.newStartDate,
    new_end_date: term.newEndDate,
    renewal_method: method,
    previous_status: previousStatus,
    resulting_status: resultingStatus,
    notes: notes?.trim() || null,
    renewed_by: renewedBy,
  });

  if (historyError) {
    return { data: null, error: new Error(historyError.message) };
  }

  await resolveOpenReminders(supabase, contract.id);

  const changeRows = [
    {
      contract_id: contract.id,
      field_name: "end_date",
      previous_value: contract.end_date,
      new_value: term.newEndDate,
      change_reason: notes?.trim() || `${method === "auto" ? "Auto" : "Manual"} renewal`,
      changed_by: renewedBy,
      source: "renewal",
    },
    {
      contract_id: contract.id,
      field_name: "status",
      previous_value: previousStatus,
      new_value: resultingStatus,
      change_reason: notes?.trim() || `${method === "auto" ? "Auto" : "Manual"} renewal`,
      changed_by: renewedBy,
      source: "renewal",
    },
  ];

  await supabase.from("contract_changes").insert(changeRows);

  await supabase.from("contract_versions").insert({
    contract_id: contract.id,
    version_number: nextVersion,
    change_summary: `${method === "auto" ? "Auto" : "Manual"} renewal: term extended to ${term.newEndDate}`,
    snapshot: {
      previous_end_date: contract.end_date,
      new_start_date: term.newStartDate,
      new_end_date: term.newEndDate,
      renewal_method: method,
    },
    created_by: renewedBy,
  });

  return {
    data: {
      newStartDate: term.newStartDate,
      newEndDate: term.newEndDate,
      previousEndDate: contract.end_date,
      resultingStatus,
    },
    error: null,
  };
}

export function activeReminderThreshold(
  contract: RenewalContractInput,
  now: Date = new Date()
): RenewalReminderDays | null {
  if (!isRenewableContract(contract)) return null;
  const renewalDays = daysUntilDate(getContractRenewalDate(contract), now);
  if (renewalDays == null || renewalDays < 0) return null;
  for (const threshold of RENEWAL_REMINDER_DAYS) {
    if (renewalDays <= threshold) return threshold;
  }
  return null;
}
