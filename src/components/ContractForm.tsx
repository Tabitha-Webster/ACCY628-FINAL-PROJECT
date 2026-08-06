"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  BILLING_FREQUENCIES,
  BILLING_METHOD_OPTIONS,
  BILLING_TIMINGS,
  CONTRACT_BILLING_STATUSES,
  CONTRACT_BILLING_STATUS_LABELS,
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  CONTRACT_TYPES,
  RENEWAL_TYPES,
  contractFormToPayload,
  emptyContractFormValues,
  validateContractFormValues,
  diffContractFormValues,
  splitPriceAndOtherChanges,
  priceChangesRequireManagerApproval,
  CONTRACT_PRICE_FIELDS,
  payloadWithBaselinePrices,
  insertPendingPriceModification,
  type ContractFormFieldErrors,
  type ContractFormValues,
} from "@/lib/contracts";

export type ContractFormOption = { id: string; label: string };

type Props = {
  mode: "create" | "edit";
  profileId: string;
  contractId?: string;
  currentVersion?: number;
  initialValues?: Partial<ContractFormValues>;
  customers: ContractFormOption[];
  managers: ContractFormOption[];
  technicians: ContractFormOption[];
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-left text-xs text-error">{message}</p>;
}

function FormField({
  label,
  error,
  className = "",
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`form-control w-full min-w-0 ${className}`}>
      <span className="mb-1.5 block min-h-5 text-left text-xs font-medium leading-5 tracking-wide opacity-70">
        {label}
      </span>
      <div className="flex w-full justify-start">{children}</div>
      <FieldError message={error} />
    </label>
  );
}

const fieldControlClass = "input input-bordered h-10 w-full text-left";
const selectControlClass = "select select-bordered h-10 w-full text-left";
const textareaControlClass = "textarea textarea-bordered w-full text-left";
const fieldGridClass = "grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3";


export function ContractForm({
  mode,
  profileId,
  contractId,
  currentVersion = 1,
  initialValues,
  customers,
  managers,
  technicians,
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<ContractFormValues>(() =>
    emptyContractFormValues(initialValues)
  );
  const [baseline] = useState<ContractFormValues>(() => emptyContractFormValues(initialValues));
  const [selectedSlaLevel, setSelectedSlaLevel] = useState<
    "critical" | "high" | "medium" | "low"
  >("critical");
  const [changeReason, setChangeReason] = useState("");
  const [activeEditAcknowledged, setActiveEditAcknowledged] = useState(false);
  const [customerSource, setCustomerSource] = useState<"existing" | "new">(
    mode === "create" && customers.length === 0 ? "new" : "existing"
  );
  const [newCustomerName, setNewCustomerName] = useState("");
  const [customerOptions, setCustomerOptions] = useState(customers);
  const [fieldErrors, setFieldErrors] = useState<ContractFormFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const title = mode === "create" ? "New Contract" : "Edit Contract";
  const cancelHref = mode === "edit" && contractId ? `/contracts/${contractId}` : "/contracts/reports";
  const isActiveContract = mode === "edit" && baseline.status === "active";

  const slaHoursFieldKey = {
    critical: "sla_critical_response_hours",
    high: "sla_high_response_hours",
    medium: "sla_medium_response_hours",
    low: "sla_low_response_hours",
  } as const satisfies Record<"critical" | "high" | "medium" | "low", keyof ContractFormValues>;

  function update<K extends keyof ContractFormValues>(key: K, value: ContractFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function verifyCustomerExists(customerId: string) {
    if (!customerId) return false;
    if (customerOptions.some((c) => c.id === customerId)) return true;
    const supabase = createClient();
    const { data } = await supabase.from("customers").select("id").eq("id", customerId).maybeSingle();
    return Boolean(data);
  }

  async function createCustomerIfNeeded(): Promise<{ customerId: string | null; error: string | null }> {
    if (customerSource !== "new") {
      return { customerId: values.customer_id || null, error: null };
    }

    const name = newCustomerName.trim();
    if (!name) {
      return { customerId: null, error: "Enter a customer name." };
    }

    const supabase = createClient();
    const { data: existing } = await supabase
      .from("customers")
      .select("id, name")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      setCustomerOptions((prev) =>
        prev.some((c) => c.id === existing.id)
          ? prev
          : [...prev, { id: existing.id, label: existing.name }].sort((a, b) =>
              a.label.localeCompare(b.label)
            )
      );
      update("customer_id", existing.id);
      setCustomerSource("existing");
      setNewCustomerName("");
      return { customerId: existing.id, error: null };
    }

    const { data, error } = await supabase
      .from("customers")
      .insert({
        name,
        status: "active",
        account_manager_id: profileId,
      })
      .select("id, name")
      .maybeSingle();

    if (error || !data?.id) {
      return { customerId: null, error: error?.message ?? "Could not create customer." };
    }

    setCustomerOptions((prev) =>
      [...prev, { id: data.id, label: data.name }].sort((a, b) => a.label.localeCompare(b.label))
    );
    update("customer_id", data.id);
    setCustomerSource("existing");
    setNewCustomerName("");
    return { customerId: data.id, error: null };
  }

  async function verifyContractNumberUnique(contractNumber: string) {
    const normalized = contractNumber.trim();
    if (!normalized) return false;
    const supabase = createClient();
    let query = supabase.from("contracts").select("id").eq("contract_number", normalized).limit(1);
    if (mode === "edit" && contractId) {
      query = query.neq("id", contractId);
    }
    const { data } = await query.maybeSingle();
    return !data;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    const supabase = createClient();
    let customerIdForSave = values.customer_id;

    if (mode === "create" && customerSource === "new") {
      const created = await createCustomerIfNeeded();
      if (created.error || !created.customerId) {
        setFieldErrors({ customer_id: created.error ?? "Enter a customer name." });
        setFormError(created.error ?? "Enter a customer name to continue.");
        setSaving(false);
        return;
      }
      customerIdForSave = created.customerId;
    }

    const valuesForSave: ContractFormValues = {
      ...values,
      customer_id: customerIdForSave,
    };

    const customerExists =
      customerSource === "new"
        ? true
        : await verifyCustomerExists(valuesForSave.customer_id);
    const contractNumberUnique = await verifyContractNumberUnique(valuesForSave.contract_number);
    const validation = validateContractFormValues(valuesForSave, {
      customerExists,
      contractNumberUnique,
    });

    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setFormError(validation.formError);
      setSaving(false);
      return;
    }

    if (mode === "create") {
      const payload = contractFormToPayload(valuesForSave, profileId, mode);
      const { data, error } = await supabase.from("contracts").insert(payload).select("id").maybeSingle();
      if (error) {
        setSaving(false);
        if (error.message.toLowerCase().includes("contract_number")) {
          setFieldErrors({ contract_number: "Contract number must be unique." });
          setFormError("Please fix the highlighted validation errors before saving.");
          return;
        }
        setFormError(error.message);
        return;
      }

      if (data?.id) {
        await supabase.from("contract_versions").insert({
          contract_id: data.id,
          version_number: 1,
          change_summary: "Initial agreement version",
          created_by: profileId,
        });
      }

      setSaving(false);
      router.push(`/contracts/${data?.id}`);
      router.refresh();
      return;
    }

    const fieldChanges = diffContractFormValues(baseline, values);
    if (fieldChanges.length === 0) {
      setFormError("No changes detected.");
      setSaving(false);
      return;
    }
    if (!changeReason.trim()) {
      setFormError("Enter a reason for this contract change (required for the audit trail).");
      setSaving(false);
      return;
    }
    if (isActiveContract && !activeEditAcknowledged) {
      setFormError("Acknowledge the active-contract warning before saving changes.");
      setSaving(false);
      return;
    }

    const reason = changeReason.trim();
    const { priceChanges, otherChanges } = splitPriceAndOtherChanges(fieldChanges);
    const holdPriceForApproval =
      priceChanges.length > 0 && priceChangesRequireManagerApproval(baseline.status);

    if (holdPriceForApproval) {
      const { data: existingPending } = await supabase
        .from("contract_modifications")
        .select("id")
        .eq("contract_id", contractId)
        .eq("approval_status", "pending")
        .limit(1)
        .maybeSingle();

      if (existingPending) {
        setFormError(
          "A price change is already pending manager approval. Approve or reject it before submitting another."
        );
        setSaving(false);
        return;
      }
    }

    const changesToApplyNow = holdPriceForApproval ? otherChanges : fieldChanges;
    const shouldUpdateContract = changesToApplyNow.length > 0;
    const nextVersion = currentVersion + 1;

    if (shouldUpdateContract) {
      const updatePayload = holdPriceForApproval
        ? payloadWithBaselinePrices(values, baseline, profileId, CONTRACT_PRICE_FIELDS)
        : contractFormToPayload(values, profileId, mode);

      const { error } = await supabase
        .from("contracts")
        .update({ ...updatePayload, version_number: nextVersion })
        .eq("id", contractId);

      if (error) {
        setSaving(false);
        if (error.message.toLowerCase().includes("contract_number")) {
          setFieldErrors({ contract_number: "Contract number must be unique." });
          setFormError("Please fix the highlighted validation errors before saving.");
          return;
        }
        setFormError(error.message);
        return;
      }

      const { error: changesError } = await supabase.from("contract_changes").insert(
        changesToApplyNow.map((change) => ({
          contract_id: contractId,
          field_name: change.field_name,
          previous_value: change.previous_value || null,
          new_value: change.new_value || null,
          change_reason: reason,
          changed_by: profileId,
          source: "edit_form",
        }))
      );
      if (changesError) {
        setFormError(changesError.message);
        setSaving(false);
        return;
      }

      const { error: versionError } = await supabase.from("contract_versions").insert({
        contract_id: contractId,
        version_number: nextVersion,
        change_summary: reason,
        created_by: profileId,
        snapshot: { changes: changesToApplyNow },
      });
      if (versionError) {
        setFormError(versionError.message);
        setSaving(false);
        return;
      }
    }

    if (holdPriceForApproval) {
      const { error: modError } = await insertPendingPriceModification(supabase, {
        contractId: contractId!,
        profileId,
        reason,
        priceChanges,
        effectiveDate: values.effective_date || values.start_date,
      });
      if (modError) {
        setFormError(modError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.push(`/contracts/${contractId}`);
    router.refresh();
  }

  return (
    <form className="mx-auto w-full max-w-5xl space-y-6" onSubmit={onSubmit} noValidate>
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm opacity-70">
            Required fields are marked. Validation runs before the agreement is saved.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={cancelHref} className="btn btn-ghost">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : mode === "create" ? "Create contract" : "Save changes"}
          </button>
        </div>
      </div>

      {formError ? <div className="alert alert-error text-sm">{formError}</div> : null}

      {isActiveContract ? (
        <section className="rounded-box border border-warning bg-warning/10 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
            Warning: active contract
          </h2>
          <p className="text-sm opacity-80">
            This agreement is live. Edits can affect billing, SLA response times, and support
            coverage. Price and commercial term changes require manager approval before they apply.
          </p>
          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-warning mt-0.5"
              checked={activeEditAcknowledged}
              onChange={(e) => setActiveEditAcknowledged(e.target.checked)}
            />
            <span>
              I understand this is an active contract and want to proceed with modifications.
            </span>
          </label>
        </section>
      ) : null}

      {mode === "edit" ? (
        <section className="rounded-box border border-warning/40 bg-warning/5 p-5">
          <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide opacity-60">
            Change reason (required)
          </h2>
          <FormField label="Reason for change *">
            <textarea
              className={textareaControlClass}
              rows={2}
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Explain why these contract values are being modified"
              required
            />
          </FormField>
          <p className="mt-2 text-center text-xs opacity-60">
            Every modified field is logged with previous value, new value, user, date, and this
            reason. Price changes on active contracts are held for manager approval.
          </p>
        </section>
      ) : null}

      <section className="rounded-box border border-base-300 bg-base-100 p-5">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide opacity-60">
          Core details
        </h2>
        <div className={fieldGridClass}>
          <FormField label="Contract number *" error={fieldErrors.contract_number}>
            <input
              className={`${fieldControlClass} ${fieldErrors.contract_number ? "input-error" : ""}`}
              value={values.contract_number}
              onChange={(e) => update("contract_number", e.target.value)}
              placeholder="CTR-1001"
            />
          </FormField>
          <FormField label="Contract name *" error={fieldErrors.name} className="sm:col-span-2">
            <input
              className={`${fieldControlClass} ${fieldErrors.name ? "input-error" : ""}`}
              value={values.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </FormField>
          <FormField label="Customer *" error={fieldErrors.customer_id} className="sm:col-span-2">
            {mode === "create" ? (
              <div className="flex w-full flex-col gap-2">
                <select
                  className={`${selectControlClass} ${fieldErrors.customer_id ? "select-error" : ""}`}
                  value={customerSource === "new" ? "__new__" : values.customer_id}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === "__new__") {
                      setCustomerSource("new");
                      update("customer_id", "");
                      return;
                    }
                    setCustomerSource("existing");
                    update("customer_id", next);
                  }}
                >
                  <option value="">Select a customer</option>
                  {customerOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                  <option value="__new__">+ Add new customer…</option>
                </select>
                {customerSource === "new" ? (
                  <input
                    className={`${fieldControlClass} ${fieldErrors.customer_id ? "input-error" : ""}`}
                    value={newCustomerName}
                    onChange={(e) => {
                      setNewCustomerName(e.target.value);
                      if (fieldErrors.customer_id) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.customer_id;
                          return next;
                        });
                      }
                    }}
                    placeholder="Type the new customer name"
                    autoFocus
                  />
                ) : null}
              </div>
            ) : (
              <select
                className={`${selectControlClass} ${fieldErrors.customer_id ? "select-error" : ""}`}
                value={values.customer_id}
                onChange={(e) => update("customer_id", e.target.value)}
              >
                <option value="">Select a customer</option>
                {customerOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Technician">
            <select
              className={selectControlClass}
              value={values.assigned_technician_id}
              onChange={(e) => update("assigned_technician_id", e.target.value)}
            >
              <option value="">Unassigned</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Contract type *">
            <select
              className={selectControlClass}
              value={values.contract_type}
              onChange={(e) => update("contract_type", e.target.value)}
            >
              {CONTRACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CONTRACT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Status *" error={fieldErrors.status}>
            <select
              className={`${selectControlClass} ${fieldErrors.status ? "select-error" : ""}`}
              value={values.status}
              onChange={(e) => update("status", e.target.value)}
            >
              {CONTRACT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CONTRACT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Account manager">
            <select
              className={selectControlClass}
              value={values.assigned_manager_id}
              onChange={(e) => update("assigned_manager_id", e.target.value)}
            >
              <option value="">Unassigned</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Sales representative">
            <select
              className={selectControlClass}
              value={values.sales_representative_id}
              onChange={(e) => update("sales_representative_id", e.target.value)}
            >
              <option value="">Unassigned</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Billing contact">
            <input
              className={fieldControlClass}
              value={values.billing_contact}
              onChange={(e) => update("billing_contact", e.target.value)}
              placeholder="Name or email for invoices"
            />
          </FormField>
          <FormField label="Description / notes" className="sm:col-span-2 lg:col-span-3">
            <textarea
              className={textareaControlClass}
              rows={3}
              value={values.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </FormField>
          <FormField label="Scope" className="sm:col-span-2 lg:col-span-3">
            <textarea
              className={textareaControlClass}
              rows={3}
              value={values.scope}
              onChange={(e) => update("scope", e.target.value)}
              placeholder="What work and deliverables this agreement covers"
            />
          </FormField>
        </div>
      </section>

      <section className="rounded-box border border-base-300 bg-base-100 p-5">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide opacity-60">
          Dates & renewal
        </h2>
        <div className={fieldGridClass}>
          <FormField label="Start date *" error={fieldErrors.start_date}>
            <input
              type="date"
              className={`${fieldControlClass} ${fieldErrors.start_date ? "input-error" : ""}`}
              value={values.start_date}
              onChange={(e) => update("start_date", e.target.value)}
            />
          </FormField>
          <FormField label="End date" error={fieldErrors.end_date}>
            <input
              type="date"
              className={`${fieldControlClass} ${fieldErrors.end_date ? "input-error" : ""}`}
              value={values.end_date}
              onChange={(e) => update("end_date", e.target.value)}
            />
          </FormField>
          <FormField label="Effective date">
            <input
              type="date"
              className={fieldControlClass}
              value={values.effective_date}
              onChange={(e) => update("effective_date", e.target.value)}
            />
          </FormField>
          <FormField label="Signed date">
            <input
              type="date"
              className={fieldControlClass}
              value={values.signed_date}
              onChange={(e) => update("signed_date", e.target.value)}
            />
          </FormField>
          <FormField label="Renewal type">
            <select
              className={selectControlClass}
              value={values.renewal_type}
              onChange={(e) => update("renewal_type", e.target.value)}
            >
              {RENEWAL_TYPES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Notice period (days)">
            <input
              type="number"
              min={0}
              className={fieldControlClass}
              value={values.cancellation_notice_days}
              onChange={(e) => update("cancellation_notice_days", e.target.value)}
            />
          </FormField>
          <FormField label="Renewal terms" className="sm:col-span-2 lg:col-span-3">
            <textarea
              className={textareaControlClass}
              rows={2}
              value={values.renewal_terms}
              onChange={(e) => update("renewal_terms", e.target.value)}
            />
          </FormField>
          <FormField label="Cancellation terms" className="sm:col-span-2 lg:col-span-3">
            <textarea
              className={textareaControlClass}
              rows={2}
              value={values.cancellation_terms}
              onChange={(e) => update("cancellation_terms", e.target.value)}
            />
          </FormField>
        </div>
      </section>

      <section className="rounded-box border border-base-300 bg-base-100 p-5">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide opacity-60">
          Billing integration
        </h2>
        <div className={fieldGridClass}>
          <FormField label="Monthly recurring revenue (MRR) *" error={fieldErrors.monthly_recurring_fee}>
            <input
              type="number"
              min={0}
              step="0.01"
              className={`${fieldControlClass} ${fieldErrors.monthly_recurring_fee ? "input-error" : ""}`}
              value={values.monthly_recurring_fee}
              onChange={(e) => update("monthly_recurring_fee", e.target.value)}
            />
          </FormField>
          <FormField label="One-time setup fee" error={fieldErrors.one_time_setup_fee}>
            <input
              type="number"
              min={0}
              step="0.01"
              className={`${fieldControlClass} ${fieldErrors.one_time_setup_fee ? "input-error" : ""}`}
              value={values.one_time_setup_fee}
              onChange={(e) => update("one_time_setup_fee", e.target.value)}
            />
          </FormField>
          <FormField label="Deposit amount" error={fieldErrors.deposit_amount}>
            <input
              type="number"
              min={0}
              step="0.01"
              className={`${fieldControlClass} ${fieldErrors.deposit_amount ? "input-error" : ""}`}
              value={values.deposit_amount}
              onChange={(e) => update("deposit_amount", e.target.value)}
            />
          </FormField>
          <FormField label="Included support hours *" error={fieldErrors.included_hours_per_month}>
            <input
              type="number"
              min={0}
              step="0.1"
              className={`${fieldControlClass} ${fieldErrors.included_hours_per_month ? "input-error" : ""}`}
              value={values.included_hours_per_month}
              onChange={(e) => update("included_hours_per_month", e.target.value)}
            />
          </FormField>
          <FormField label="Allow overage billing">
            <div className="flex h-10 w-full items-center justify-start rounded-lg border border-base-300 bg-base-100 px-3">
              <input
                type="checkbox"
                className="checkbox checkbox-primary"
                checked={values.overages_allowed}
                onChange={(e) => update("overages_allowed", e.target.checked)}
              />
            </div>
          </FormField>
          <FormField
            label={`Overage hourly rate${values.overages_allowed ? " *" : ""}`}
            error={fieldErrors.additional_hourly_rate}
          >
            <input
              type="number"
              min={0}
              step="0.01"
              className={`${fieldControlClass} ${fieldErrors.additional_hourly_rate ? "input-error" : ""}`}
              value={values.additional_hourly_rate}
              onChange={(e) => update("additional_hourly_rate", e.target.value)}
              disabled={!values.overages_allowed}
            />
          </FormField>
          <FormField label="Overage charges (accrued)" error={fieldErrors.overage_charges}>
            <input
              type="number"
              min={0}
              step="0.01"
              className={`${fieldControlClass} ${fieldErrors.overage_charges ? "input-error" : ""}`}
              value={values.overage_charges}
              onChange={(e) => update("overage_charges", e.target.value)}
              disabled={!values.overages_allowed}
            />
          </FormField>
          <FormField label="Billing frequency">
            <select
              className={selectControlClass}
              value={values.billing_frequency}
              onChange={(e) => update("billing_frequency", e.target.value)}
            >
              {BILLING_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Billing timing">
            <select
              className={selectControlClass}
              value={values.billing_timing}
              onChange={(e) => update("billing_timing", e.target.value)}
            >
              {BILLING_TIMINGS.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Billing method">
            <select
              className={selectControlClass}
              value={values.billing_method}
              onChange={(e) => update("billing_method", e.target.value)}
            >
              {Array.from(
                new Set([values.billing_method, ...BILLING_METHOD_OPTIONS].filter(Boolean))
              ).map((m) => (
                <option key={m} value={m}>
                  {String(m).replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Invoice / payment terms">
            <input
              className={fieldControlClass}
              value={values.payment_terms}
              onChange={(e) => update("payment_terms", e.target.value)}
              placeholder="Net 30"
            />
          </FormField>
          <FormField label="Billing status" error={fieldErrors.billing_status}>
            <select
              className={selectControlClass}
              value={values.billing_status}
              onChange={(e) => update("billing_status", e.target.value)}
            >
              {CONTRACT_BILLING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CONTRACT_BILLING_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Next invoice date">
            <input
              type="date"
              className={fieldControlClass}
              value={values.next_invoice_date}
              onChange={(e) => update("next_invoice_date", e.target.value)}
            />
          </FormField>
          <FormField label="Last invoice date">
            <input
              type="date"
              className={fieldControlClass}
              value={values.last_invoice_date}
              onChange={(e) => update("last_invoice_date", e.target.value)}
            />
          </FormField>
          <FormField label="Software markup %" error={fieldErrors.software_markup_pct}>
            <input
              type="number"
              min={0}
              step="0.01"
              className={`${fieldControlClass} ${fieldErrors.software_markup_pct ? "input-error" : ""}`}
              value={values.software_markup_pct}
              onChange={(e) => update("software_markup_pct", e.target.value)}
              placeholder="e.g. 15"
            />
          </FormField>
          <FormField label="Equipment markup %" error={fieldErrors.equipment_markup_pct}>
            <input
              type="number"
              min={0}
              step="0.01"
              className={`${fieldControlClass} ${fieldErrors.equipment_markup_pct ? "input-error" : ""}`}
              value={values.equipment_markup_pct}
              onChange={(e) => update("equipment_markup_pct", e.target.value)}
              placeholder="e.g. 20"
            />
          </FormField>
          <FormField label="Reimbursable cost policy" className="sm:col-span-2 lg:col-span-3">
            <textarea
              className={textareaControlClass}
              rows={2}
              value={values.reimbursable_cost_policy}
              onChange={(e) => update("reimbursable_cost_policy", e.target.value)}
              placeholder="How pass-through and reimbursable costs are handled"
            />
          </FormField>
        </div>
      </section>

      <section className="rounded-box border border-base-300 bg-base-100 p-5">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide opacity-60">
          Coverage & SLA
        </h2>
        <div className={fieldGridClass}>
          <FormField label="Remote support">
            <div className="flex h-10 w-full items-center justify-start rounded-lg border border-base-300 bg-base-100 px-3">
              <input
                type="checkbox"
                className="checkbox checkbox-primary"
                checked={values.remote_support}
                onChange={(e) => update("remote_support", e.target.checked)}
              />
            </div>
          </FormField>
          <FormField label="Onsite support">
            <div className="flex h-10 w-full items-center justify-start rounded-lg border border-base-300 bg-base-100 px-3">
              <input
                type="checkbox"
                className="checkbox checkbox-primary"
                checked={values.onsite_support}
                onChange={(e) => update("onsite_support", e.target.checked)}
              />
            </div>
          </FormField>
          <FormField label="After-hours terms" className="sm:col-span-2 lg:col-span-3">
            <textarea
              className={textareaControlClass}
              rows={2}
              value={values.after_hours_terms}
              onChange={(e) => update("after_hours_terms", e.target.value)}
              placeholder="After-hours coverage, rates, or response expectations"
            />
          </FormField>
          <FormField label="SLA level">
            <select
              className={selectControlClass}
              value={selectedSlaLevel}
              onChange={(e) =>
                setSelectedSlaLevel(e.target.value as "critical" | "high" | "medium" | "low")
              }
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </FormField>
          <FormField
            label="Response hours"
            error={fieldErrors[slaHoursFieldKey[selectedSlaLevel]]}
          >
            <input
              type="text"
              inputMode="decimal"
              className={fieldControlClass}
              value={values[slaHoursFieldKey[selectedSlaLevel]]}
              onChange={(e) => {
                const next = e.target.value;
                if (next === "" || /^\d*\.?\d*$/.test(next)) {
                  update(slaHoursFieldKey[selectedSlaLevel], next);
                }
              }}
              placeholder="Hours"
            />
          </FormField>
          <FormField label="Covered sites / locations" className="sm:col-span-2 lg:col-span-3">
            <input
              className={fieldControlClass}
              value={values.supported_locations}
              onChange={(e) => update("supported_locations", e.target.value)}
            />
          </FormField>
          <FormField label="Covered devices / users" className="sm:col-span-2 lg:col-span-3">
            <input
              className={fieldControlClass}
              value={values.supported_users_devices}
              onChange={(e) => update("supported_users_devices", e.target.value)}
            />
          </FormField>
          <FormField label="Covered services" className="sm:col-span-2 lg:col-span-3">
            <textarea
              className={textareaControlClass}
              rows={3}
              value={values.included_services}
              onChange={(e) => update("included_services", e.target.value)}
            />
          </FormField>
          <FormField label="Excluded services" className="sm:col-span-2 lg:col-span-3">
            <textarea
              className={textareaControlClass}
              rows={3}
              value={values.excluded_services}
              onChange={(e) => update("excluded_services", e.target.value)}
            />
          </FormField>
        </div>
      </section>

      <div className="flex justify-center gap-2">
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : mode === "create" ? "Create contract" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
