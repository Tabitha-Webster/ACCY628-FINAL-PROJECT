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
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<ContractFormValues>(() =>
    emptyContractFormValues(initialValues)
  );
  const [baseline] = useState<ContractFormValues>(() => emptyContractFormValues(initialValues));
  const [changeReason, setChangeReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ContractFormFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const title = mode === "create" ? "New Contract" : "Edit Contract";
  const cancelHref = mode === "edit" && contractId ? `/contracts/${contractId}` : "/contracts";

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
    if (customers.some((c) => c.id === customerId)) return true;
    const supabase = createClient();
    const { data } = await supabase.from("customers").select("id").eq("id", customerId).maybeSingle();
    return Boolean(data);
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

    const customerExists = await verifyCustomerExists(values.customer_id);
    const contractNumberUnique = await verifyContractNumberUnique(values.contract_number);
    const validation = validateContractFormValues(values, {
      customerExists,
      contractNumberUnique,
    });

    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setFormError(validation.formError);
      setSaving(false);
      return;
    }

    const supabase = createClient();
    const payload = contractFormToPayload(values, profileId, mode);

    if (mode === "create") {
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

    const nextVersion = currentVersion + 1;
    const { error } = await supabase
      .from("contracts")
      .update({ ...payload, version_number: nextVersion })
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

    const reason = changeReason.trim();
    await supabase.from("contract_changes").insert(
      fieldChanges.map((change) => ({
        contract_id: contractId,
        field_name: change.field_name,
        previous_value: change.previous_value || null,
        new_value: change.new_value || null,
        change_reason: reason,
        changed_by: profileId,
        source: "edit_form",
      }))
    );

    await supabase.from("contract_versions").insert({
      contract_id: contractId,
      version_number: nextVersion,
      change_summary: reason,
      created_by: profileId,
      snapshot: { changes: fieldChanges },
    });

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

      {mode === "edit" ? (
        <section className="rounded-box border border-warning/40 bg-warning/5 p-5">
          <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide opacity-60">
            Change reason (audit trail)
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
            Every modified field is logged with previous value, new value, user, date, and this reason.
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
          <FormField label="Customer *" error={fieldErrors.customer_id}>
            <select
              className={`${selectControlClass} ${fieldErrors.customer_id ? "select-error" : ""}`}
              value={values.customer_id}
              onChange={(e) => update("customer_id", e.target.value)}
            >
              <option value="">Select a customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
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
          <FormField label="Description / notes" className="sm:col-span-2 lg:col-span-3">
            <textarea
              className={textareaControlClass}
              rows={3}
              value={values.description}
              onChange={(e) => update("description", e.target.value)}
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
        </div>
      </section>

      <section className="rounded-box border border-base-300 bg-base-100 p-5">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide opacity-60">
          Coverage & SLA
        </h2>
        <div className={fieldGridClass}>
          <FormField label="SLA Critical (hrs)">
            <input
              type="number"
              min={0}
              step="0.1"
              className={fieldControlClass}
              value={values.sla_critical_response_hours}
              onChange={(e) => update("sla_critical_response_hours", e.target.value)}
            />
          </FormField>
          <FormField label="SLA High (hrs)">
            <input
              type="number"
              min={0}
              step="0.1"
              className={fieldControlClass}
              value={values.sla_high_response_hours}
              onChange={(e) => update("sla_high_response_hours", e.target.value)}
            />
          </FormField>
          <FormField label="SLA Medium (hrs)">
            <input
              type="number"
              min={0}
              step="0.1"
              className={fieldControlClass}
              value={values.sla_medium_response_hours}
              onChange={(e) => update("sla_medium_response_hours", e.target.value)}
            />
          </FormField>
          <FormField label="SLA Low (hrs)">
            <input
              type="number"
              min={0}
              step="0.1"
              className={fieldControlClass}
              value={values.sla_low_response_hours}
              onChange={(e) => update("sla_low_response_hours", e.target.value)}
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
