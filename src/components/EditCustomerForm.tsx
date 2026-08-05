"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/Button";
import { Card } from "@/components/Card";
import {
  findLikelyDuplicateCustomers,
  normalizeContactEmail,
  normalizeCustomerName,
  type DuplicateCustomerMatch,
} from "@/lib/customer-duplicates";
import { createClient } from "@/lib/supabase/client";
import { statusLabel } from "@/lib/format";
import type { CustomerStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: CustomerStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "prospect", label: "Prospective" },
  { value: "on_hold", label: "On Hold" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "rejected", label: "Rejected" },
];

export type EditCustomerInitial = {
  id: string;
  customerIdentifier: string | null;
  name: string;
  status: CustomerStatus;
  industry: string;
  primaryContact: string;
  contactEmail: string;
  contactPhone: string;
  billingContactName: string;
  billingContactEmail: string;
  billingAddress: string;
  city: string;
  state: string;
  postalCode: string;
  /** Preserved when billing columns are stored via notes on the live DB. */
  existingNotes: string | null;
};

type FormValues = {
  name: string;
  status: CustomerStatus;
  industry: string;
  primaryContact: string;
  contactEmail: string;
  contactPhone: string;
  billingContactName: string;
  billingContactEmail: string;
  billingAddress: string;
  city: string;
  state: string;
  postalCode: string;
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_EMAIL_MESSAGE = "Enter a valid email address (for example, name@company.com).";

const BILLING_COLUMN_PATTERN =
  /billing_contact_name|billing_contact_email|billing_address|\bcity\b|\bstate\b|postal_code/i;

const STRUCTURED_NOTE_PATTERN =
  /^(primary phone|billing contact|billing email|billing address|city|state|postal code):/i;

function isValidCustomerName(name: string) {
  return name.trim().length > 0;
}

function emailFormatError(email: string): string | undefined {
  const trimmed = email.trim();
  if (!trimmed) return undefined;
  if (!EMAIL_PATTERN.test(trimmed)) return INVALID_EMAIL_MESSAGE;
  return undefined;
}

function buildBillingNotes(values: FormValues, existingNotes: string | null) {
  const kept = (existingNotes ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !STRUCTURED_NOTE_PATTERN.test(line));

  const structured = [
    values.contactPhone.trim() && `Primary phone: ${values.contactPhone.trim()}`,
    values.billingContactName.trim() && `Billing contact: ${values.billingContactName.trim()}`,
    values.billingContactEmail.trim() && `Billing email: ${values.billingContactEmail.trim()}`,
    values.billingAddress.trim() && `Billing address: ${values.billingAddress.trim()}`,
    values.city.trim() && `City: ${values.city.trim()}`,
    values.state.trim() && `State: ${values.state.trim()}`,
    values.postalCode.trim() && `Postal code: ${values.postalCode.trim()}`,
  ].filter(Boolean) as string[];

  const merged = [...kept, ...structured];
  return merged.length > 0 ? merged.join("\n") : null;
}

function toFormValues(initial: EditCustomerInitial): FormValues {
  return {
    name: initial.name,
    status: initial.status,
    industry: initial.industry,
    primaryContact: initial.primaryContact,
    contactEmail: initial.contactEmail,
    contactPhone: initial.contactPhone,
    billingContactName: initial.billingContactName,
    billingContactEmail: initial.billingContactEmail,
    billingAddress: initial.billingAddress,
    city: initial.city,
    state: initial.state,
    postalCode: initial.postalCode,
  };
}

export function EditCustomerForm({ initial }: { initial: EditCustomerInitial }) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(() => toFormValues(initial));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateCustomerMatch[]>([]);

  const displayIdentifier = initial.customerIdentifier?.trim() || initial.id;
  const detailHref = `/customers/${initial.id}`;

  function nameOrEmailChanged() {
    return (
      normalizeCustomerName(values.name) !== normalizeCustomerName(initial.name) ||
      normalizeContactEmail(values.contactEmail) !== normalizeContactEmail(initial.contactEmail)
    );
  }

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === "name" || key === "contactEmail") {
      setDuplicateMatches([]);
    }
    if (key === "name" || key === "contactEmail" || key === "billingContactEmail" || key === "primaryContact") {
      setFieldErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function clearDuplicateWarning() {
    setDuplicateMatches([]);
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!isValidCustomerName(values.name)) {
      next.name = "Customer name is required. Enter a name — spaces alone are not allowed.";
    }
    if (!values.status) next.status = "Select a customer status.";
    if (!values.primaryContact.trim()) next.primaryContact = "Primary contact name is required.";
    if (!values.contactEmail.trim()) {
      next.contactEmail = "Primary contact email is required.";
    } else {
      const formatError = emailFormatError(values.contactEmail);
      if (formatError) next.contactEmail = formatError;
    }
    const billingEmailError = emailFormatError(values.billingContactEmail);
    if (billingEmailError) next.billingContactEmail = billingEmailError;
    return next;
  }

  async function saveCustomer(options?: { acknowledgeDuplicates?: boolean }) {
    const acknowledgeDuplicates = Boolean(options?.acknowledgeDuplicates);
    setError(null);
    setSuccess(null);

    const nextErrors = validate();
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError("Please fix the highlighted fields, then try again.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Only check duplicates when name or primary contact email changed.
    if (nameOrEmailChanged() && !acknowledgeDuplicates) {
      const { matches, error: duplicateError } = await findLikelyDuplicateCustomers(
        supabase,
        values.name,
        values.contactEmail
      );
      if (duplicateError) {
        setLoading(false);
        setError(`Could not check for existing customers. ${duplicateError}`);
        return;
      }
      const others = matches.filter((match) => match.id !== initial.id);
      if (others.length > 0) {
        setDuplicateMatches(others);
        setLoading(false);
        return;
      }
    }

    const notes = buildBillingNotes(values, initial.existingNotes);

    let payload: Record<string, string | null> = {
      name: values.name.trim(),
      status: values.status,
      industry: values.industry.trim() || null,
      primary_contact: values.primaryContact.trim(),
      contact_email: values.contactEmail.trim().toLowerCase(),
      billing_contact_name: values.billingContactName.trim() || null,
      billing_contact_email: values.billingContactEmail.trim()
        ? values.billingContactEmail.trim().toLowerCase()
        : null,
      billing_address: values.billingAddress.trim() || null,
      city: values.city.trim() || null,
      state: values.state.trim() || null,
      postal_code: values.postalCode.trim() || null,
      primary_contact_phone: values.contactPhone.trim() || null,
      notes,
    };

    let { error: updateError } = await supabase.from("customers").update(payload).eq("id", initial.id);

    if (updateError && /primary_contact_phone/i.test(updateError.message)) {
      const { primary_contact_phone: _phone, ...withoutPhone } = payload;
      payload = withoutPhone;
      const retry = await supabase.from("customers").update(payload).eq("id", initial.id);
      updateError = retry.error;
    }

    if (updateError && BILLING_COLUMN_PATTERN.test(updateError.message)) {
      const {
        billing_contact_name: _a,
        billing_contact_email: _b,
        billing_address: _c,
        city: _d,
        state: _e,
        postal_code: _f,
        ...corePayload
      } = payload;
      const fallback = await supabase
        .from("customers")
        .update({ ...corePayload, notes })
        .eq("id", initial.id);
      updateError = fallback.error;
    }

    setLoading(false);

    if (updateError) {
      setError(`Could not save customer changes. ${updateError.message}`);
      return;
    }

    setSuccess("Customer updated successfully. Returning to the customer profile…");
    window.setTimeout(() => {
      router.push(detailHref);
      router.refresh();
    }, 1000);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await saveCustomer();
  }

  const disabled = loading || Boolean(success);

  return (
    <Card title="Edit customer" description="Update this customer record in Supabase.">
      <form className="space-y-4" onSubmit={(e) => void onSubmit(e)} noValidate>
        {error ? (
          <div className="alert alert-error text-sm">
            <span>{error}</span>
          </div>
        ) : null}
        {success ? (
          <div className="alert alert-success text-sm">
            <span>{success}</span>
          </div>
        ) : null}

        {duplicateMatches.length > 0 ? (
          <div className="alert alert-warning text-sm">
            <div className="w-full space-y-3">
              <div>
                <p className="font-semibold">This may match another customer</p>
                <p className="mt-1 opacity-90">
                  Another customer has the same normalized name and/or primary contact email.
                  Nothing was saved. Review the match below — records are not merged or
                  overwritten automatically.
                </p>
              </div>
              <ul className="space-y-2">
                {duplicateMatches.map((match) => (
                  <li
                    key={match.id}
                    className="rounded-box border border-warning/40 bg-base-100 p-3 text-base-content"
                  >
                    <p className="font-medium">{match.name}</p>
                    <p className="text-xs opacity-70">
                      {match.customer_identifier ? `${match.customer_identifier} · ` : null}
                      Status: {match.status ? statusLabel(match.status) : "—"}
                      {" · "}
                      Matched on: {match.matchedOn.join(" and ")}
                    </p>
                    <p className="mt-1 text-xs">
                      Contact: {match.primary_contact ?? "—"}
                      {match.contact_email ? ` · ${match.contact_email}` : null}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={clearDuplicateWarning}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <ButtonLink href="/customers" variant="secondary" size="sm">
                  Review customer list
                </ButtonLink>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={loading}
                  onClick={() => void saveCustomer({ acknowledgeDuplicates: true })}
                >
                  Save anyway — I confirm this is not a duplicate
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-box border border-dashed border-base-300 bg-base-200/40 px-3 py-2 text-sm">
          <p className="font-medium">Customer identifier</p>
          <p className="font-mono text-xs tabular-nums opacity-80">{displayIdentifier}</p>
          <p className="mt-1 opacity-70">Read-only — this identifier cannot be changed.</p>
        </div>

        <label className="form-control w-full">
          <span className="label-text mb-1">
            Customer name <span className="text-error">*</span>
          </span>
          <input
            className={`input input-bordered w-full ${fieldErrors.name ? "input-error" : ""}`}
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            disabled={disabled}
            autoComplete="organization"
            required
            aria-required="true"
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name ? (
            <span className="mt-1 text-xs text-error" role="alert">
              {fieldErrors.name}
            </span>
          ) : null}
        </label>

        <label className="form-control w-full max-w-xs">
          <span className="label-text mb-1">
            Customer status <span className="text-error">*</span>
          </span>
          <select
            className={`select select-bordered w-full ${fieldErrors.status ? "select-error" : ""}`}
            value={values.status}
            onChange={(e) => update("status", e.target.value as CustomerStatus)}
            disabled={disabled}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldErrors.status ? (
            <span className="mt-1 text-xs text-error">{fieldErrors.status}</span>
          ) : null}
        </label>

        <label className="form-control w-full">
          <span className="label-text mb-1">Industry</span>
          <input
            className="input input-bordered w-full"
            value={values.industry}
            onChange={(e) => update("industry", e.target.value)}
            disabled={disabled}
            placeholder="e.g. Healthcare, Education, Banking"
          />
        </label>

        <label className="form-control w-full">
          <span className="label-text mb-1">
            Primary contact name <span className="text-error">*</span>
          </span>
          <input
            className={`input input-bordered w-full ${fieldErrors.primaryContact ? "input-error" : ""}`}
            value={values.primaryContact}
            onChange={(e) => update("primaryContact", e.target.value)}
            disabled={disabled}
            autoComplete="name"
          />
          {fieldErrors.primaryContact ? (
            <span className="mt-1 text-xs text-error">{fieldErrors.primaryContact}</span>
          ) : null}
        </label>

        <label className="form-control w-full">
          <span className="label-text mb-1">
            Primary contact email <span className="text-error">*</span>
          </span>
          <input
            type="email"
            className={`input input-bordered w-full ${fieldErrors.contactEmail ? "input-error" : ""}`}
            value={values.contactEmail}
            onChange={(e) => update("contactEmail", e.target.value)}
            disabled={disabled}
            autoComplete="email"
            aria-invalid={Boolean(fieldErrors.contactEmail)}
          />
          {fieldErrors.contactEmail ? (
            <span className="mt-1 text-xs text-error" role="alert">
              {fieldErrors.contactEmail}
            </span>
          ) : null}
        </label>

        <label className="form-control w-full">
          <span className="label-text mb-1">Primary contact phone</span>
          <input
            type="tel"
            className="input input-bordered w-full"
            value={values.contactPhone}
            onChange={(e) => update("contactPhone", e.target.value)}
            disabled={disabled}
            autoComplete="tel"
            placeholder="Optional"
          />
        </label>

        <fieldset className="space-y-4 rounded-box border border-base-300 p-4">
          <legend className="px-1 text-sm font-semibold">Billing information</legend>

          <label className="form-control w-full">
            <span className="label-text mb-1">Billing contact name</span>
            <input
              className="input input-bordered w-full"
              value={values.billingContactName}
              onChange={(e) => update("billingContactName", e.target.value)}
              disabled={disabled}
              autoComplete="name"
            />
          </label>

          <label className="form-control w-full">
            <span className="label-text mb-1">Billing contact email</span>
            <input
              type="email"
              className={`input input-bordered w-full ${fieldErrors.billingContactEmail ? "input-error" : ""}`}
              value={values.billingContactEmail}
              onChange={(e) => update("billingContactEmail", e.target.value)}
              disabled={disabled}
              autoComplete="email"
              aria-invalid={Boolean(fieldErrors.billingContactEmail)}
            />
            {fieldErrors.billingContactEmail ? (
              <span className="mt-1 text-xs text-error" role="alert">
                {fieldErrors.billingContactEmail}
              </span>
            ) : null}
          </label>

          <label className="form-control w-full">
            <span className="label-text mb-1">Billing address</span>
            <input
              className="input input-bordered w-full"
              value={values.billingAddress}
              onChange={(e) => update("billingAddress", e.target.value)}
              disabled={disabled}
              autoComplete="street-address"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="form-control w-full">
              <span className="label-text mb-1">City</span>
              <input
                className="input input-bordered w-full"
                value={values.city}
                onChange={(e) => update("city", e.target.value)}
                disabled={disabled}
                autoComplete="address-level2"
              />
            </label>
            <label className="form-control w-full">
              <span className="label-text mb-1">State</span>
              <input
                className="input input-bordered w-full"
                value={values.state}
                onChange={(e) => update("state", e.target.value)}
                disabled={disabled}
                autoComplete="address-level1"
              />
            </label>
            <label className="form-control w-full">
              <span className="label-text mb-1">Postal code</span>
              <input
                className="input input-bordered w-full"
                value={values.postalCode}
                onChange={(e) => update("postalCode", e.target.value)}
                disabled={disabled}
                autoComplete="postal-code"
              />
            </label>
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" variant="primary" disabled={disabled}>
            {loading ? "Saving…" : "Save changes"}
          </Button>
          <ButtonLink href={detailHref} variant="secondary" disabled={loading}>
            Cancel
          </ButtonLink>
        </div>
      </form>
    </Card>
  );
}
