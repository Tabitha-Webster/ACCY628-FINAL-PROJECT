import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONTRACT_CHANGE_FIELD_LABELS,
  type ContractFieldChange,
  type ContractPriceField,
} from "./audit";
import { contractFormToPayload, type ContractFormValues } from "./validation";

/** Build a human-readable summary of pending price field changes. */
export function summarizePriceChanges(changes: ContractFieldChange[]): string {
  if (changes.length === 0) return "Price modification";
  const labels = changes.map(
    (c) => CONTRACT_CHANGE_FIELD_LABELS[c.field_name] ?? c.field_name
  );
  return `Price change pending approval: ${labels.join(", ")}`;
}

/** Coerce a proposed string/boolean value into a contracts-table column value. */
export function coerceProposedContractValue(field: string, raw: string): string | number | boolean | null {
  if (field === "overages_allowed") {
    return raw === "true";
  }
  if (
    field === "monthly_recurring_fee" ||
    field === "one_time_setup_fee" ||
    field === "included_hours_per_month" ||
    field === "additional_hourly_rate" ||
    field === "overage_charges"
  ) {
    if (raw.trim() === "") return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return raw;
}

/** Apply baseline price values so pending price edits are not written to contracts yet. */
export function payloadWithBaselinePrices(
  values: ContractFormValues,
  baseline: ContractFormValues,
  profileId: string,
  priceFields: readonly ContractPriceField[]
) {
  const payload = contractFormToPayload(values, profileId, "edit");
  const baselinePayload = contractFormToPayload(baseline, profileId, "edit");
  for (const field of priceFields) {
    payload[field] = baselinePayload[field];
  }
  return payload;
}

export async function insertPendingPriceModification(
  supabase: SupabaseClient,
  input: {
    contractId: string;
    profileId: string;
    reason: string;
    priceChanges: ContractFieldChange[];
    effectiveDate?: string;
  }
) {
  const summary = `${summarizePriceChanges(input.priceChanges)}. Reason: ${input.reason}`;
  return supabase
    .from("contract_modifications")
    .insert({
      contract_id: input.contractId,
      modification_summary: summary,
      effective_date: input.effectiveDate || new Date().toISOString().slice(0, 10),
      approval_status: "pending",
      created_by: input.profileId,
      proposed_changes: input.priceChanges,
    })
    .select("id")
    .maybeSingle();
}

export async function approvePendingPriceModification(
  supabase: SupabaseClient,
  input: {
    modificationId: string;
    contractId: string;
    profileId: string;
    currentVersion: number;
  }
) {
  const { data: mod, error: loadError } = await supabase
    .from("contract_modifications")
    .select("id, contract_id, approval_status, proposed_changes, modification_summary")
    .eq("id", input.modificationId)
    .eq("contract_id", input.contractId)
    .maybeSingle();

  if (loadError) return { error: loadError };
  if (!mod) return { error: { message: "Modification not found." } };
  if (mod.approval_status !== "pending") {
    return { error: { message: "This modification is no longer pending approval." } };
  }

  const changes = (mod.proposed_changes ?? []) as ContractFieldChange[];
  if (!Array.isArray(changes) || changes.length === 0) {
    return { error: { message: "No proposed price changes to apply." } };
  }

  const updatePayload: Record<string, unknown> = {
    updated_by: input.profileId,
    updated_at: new Date().toISOString(),
    version_number: input.currentVersion + 1,
  };
  for (const change of changes) {
    updatePayload[change.field_name] = coerceProposedContractValue(
      change.field_name,
      change.new_value
    );
  }

  const { error: updateError } = await supabase
    .from("contracts")
    .update(updatePayload)
    .eq("id", input.contractId);

  if (updateError) return { error: updateError };

  const reason = `Manager approved price change: ${mod.modification_summary}`;
  const { error: changesError } = await supabase.from("contract_changes").insert(
    changes.map((change) => ({
      contract_id: input.contractId,
      field_name: change.field_name,
      previous_value: change.previous_value || null,
      new_value: change.new_value || null,
      change_reason: reason,
      changed_by: input.profileId,
      source: "price_approval",
    }))
  );
  if (changesError) return { error: changesError };

  const { error: versionError } = await supabase.from("contract_versions").insert({
    contract_id: input.contractId,
    version_number: input.currentVersion + 1,
    change_summary: reason,
    created_by: input.profileId,
    snapshot: { changes, modification_id: input.modificationId },
  });
  if (versionError) return { error: versionError };

  const { error: approveError } = await supabase
    .from("contract_modifications")
    .update({
      approval_status: "approved",
      approved_by: input.profileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.modificationId);

  return { error: approveError };
}

export async function rejectPendingPriceModification(
  supabase: SupabaseClient,
  input: {
    modificationId: string;
    contractId: string;
    profileId: string;
  }
) {
  return supabase
    .from("contract_modifications")
    .update({
      approval_status: "rejected",
      approved_by: input.profileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.modificationId)
    .eq("contract_id", input.contractId)
    .eq("approval_status", "pending");
}
