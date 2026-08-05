"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/Button";
import { Card } from "@/components/Card";
import {
  findLikelyDuplicateCustomers,
  type DuplicateCustomerMatch,
} from "@/lib/customer-duplicates";
import { allocateNextCustomerIdentifier } from "@/lib/customer-identifier";
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

const EMPTY: FormValues = {
  name: "",
  status: "prospect",
  industry: "",
  primaryContact: "",
  contactEmail: "",
  contactPhone: "",
  billingContactName: "",
  billingContactEmail: "",
  billingAddress: "",
  city: "",
  state: "",
  postalCode: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_EMAIL_MESSAGE = "Enter a valid email address (for example, name@company.com).";

const BILLING_COLUMN_PATTERN =
  /billing_contact_name|billing_contact_email|billing_address|\bcity\b|\bstate\b|postal_code/i;

function isValidCustomerName(name: string) {
  return name.trim().length > 0;
}

/** Returns true when blank (caller decides if blank is allowed) or when format is valid. */
function isValidEmailFormat(email: string) {
  const trimmed = email.trim();
  if (!trimmed) return true;
  return EMAIL_PATTERN.test(trimmed);
}

function emailFormatError(email: string): string | undefined {
  const trimmed = email.trim();
  if (!trimmed) return undefined;
  if (!EMAIL_PATTERN.test(trimmed)) return INVALID_EMAIL_MESSAGE;
  return undefined;
}

function buildBillingNotes(values: FormValues) {
  const lines = [
    values.billingContactName.trim() && `Billing contact: ${values.billingContactName.trim()}`,
    values.billingContactEmail.trim() && `Billing email: ${values.billingContactEmail.trim()}`,
    values.billingAddress.trim() && `Billing address: ${values.billingAddress.trim()}`,
    values.city.trim() && `City: ${values.city.trim()}`,
    values.state.trim() && `State: ${values.state.trim()}`,
    values.postalCode.trim() && `Postal code: ${values.postalCode.trim()}`,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
}

export function AddCustomerForm() {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdIdentifier, setCreatedIdentifier] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateCustomerMatch[]>([]);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === "name" || key === "contactEmail") {
      setDuplicateMatches([]);
      setDuplicateConfirmed(false);
    }
    if (key === "name" || key === "contactEmail" || key === "billingContactEmail") {
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
    setDuplicateConfirmed(false);
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!isValidCustomerName(values.name)) {
      next.name = "Customer name is required. Enter a name — spaces alone are not allowed.";
    }
    if (!values.status) next.status = "Select a customer status.";
    if (!values.primaryContact.trim()) next.primaryContact = "Primary contact name is required.";
    // Primary contact email is required on this form; blank is not allowed.
    if (!values.contactEmail.trim()) {
      next.contactEmail = "Primary contact email is required.";
    } else {
      const formatError = emailFormatError(values.contactEmail);
      if (formatError) next.contactEmail = formatError;
    }
    // Billing contact email is optional; validate format only when entered.
    const billingEmailError = emailFormatError(values.billingContactEmail);
    if (billingEmailError) next.billingContactEmail = billingEmailError;
    return next;
  }

  async function createCustomer(options?: { acknowledgeDuplicates?: boolean }) {
    const acknowledgeDuplicates = Boolean(options?.acknowledgeDuplicates);
    setError(null);
    setSuccess(null);

    const nextErrors = validate();
    setFieldErrors(nextErrors);
    if (
      !isValidCustomerName(values.name) ||
      !isValidEmailFormat(values.contactEmail) ||
      !isValidEmailFormat(values.billingContactEmail) ||
      Object.keys(nextErrors).length > 0
    ) {
      setError("Please fix the highlighted fields, then try again.");
      return;
    }

    setLoading(true);
    setCreatedIdentifier(null);
    const supabase = createClient();

    if (!acknowledgeDuplicates) {
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
      if (matches.length > 0) {
        setDuplicateMatches(matches);
        setDuplicateConfirmed(false);
        setLoading(false);
        return;
      }
    } else {
      setDuplicateConfirmed(true);
    }

    const allocated = await allocateNextCustomerIdentifier(supabase);
    if (!allocated.identifier) {
      setLoading(false);
      setError(allocated.error ?? "Could not generate a unique customer identifier.");
      return;
    }

    let customerIdentifier = allocated.identifier;

    const buildPayload = (identifier: string) => {
      const payload: Record<string, string | null> = {
        customer_identifier: identifier,
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
      };
      const phone = values.contactPhone.trim();
      if (phone) payload.primary_contact_phone = phone;
      return payload;
    };

    let payload = buildPayload(customerIdentifier);
    let { data: inserted, error: insertError } = await supabase
      .from("customers")
      .insert(payload)
      .select("id, customer_identifier")
      .single();

    // Live DB may not have primary_contact_phone yet — retry without it.
    if (insertError && payload.primary_contact_phone && /primary_contact_phone/i.test(insertError.message)) {
      delete payload.primary_contact_phone;
      const retry = await supabase
        .from("customers")
        .insert(payload)
        .select("id, customer_identifier")
        .single();
      inserted = retry.data;
      insertError = retry.error;
    }

    // If billing columns are not on the live table yet, keep data on the customers row via notes.
    if (insertError && BILLING_COLUMN_PATTERN.test(insertError.message)) {
      const {
        billing_contact_name: _a,
        billing_contact_email: _b,
        billing_address: _c,
        city: _d,
        state: _e,
        postal_code: _f,
        ...corePayload
      } = payload;
      const notes = buildBillingNotes(values);
      const fallback = await supabase
        .from("customers")
        .insert(notes ? { ...corePayload, notes } : corePayload)
        .select("id, customer_identifier")
        .single();
      inserted = fallback.data;
      insertError = fallback.error;
    }

    // Unique violation — allocate a new identifier and retry a few times.
    for (let attempt = 0; attempt < 3 && insertError && /duplicate|unique/i.test(insertError.message); attempt++) {
      const again = await allocateNextCustomerIdentifier(supabase);
      if (!again.identifier) break;
      customerIdentifier = again.identifier;
      payload = { ...payload, customer_identifier: customerIdentifier };
      const retry = await supabase
        .from("customers")
        .insert(payload)
        .select("id, customer_identifier")
        .single();
      inserted = retry.data;
      insertError = retry.error;
    }

    setLoading(false);

    if (insertError) {
      if (/customer_identifier/i.test(insertError.message)) {
        setError(
          "Could not save the customer identifier. Run the customer_identifier migration so CUST-00001 values can be stored uniquely."
        );
        return;
      }
      setError(`Could not save the customer. ${insertError.message}`);
      return;
    }

    const savedId =
      (inserted?.customer_identifier as string | undefined)?.trim() || customerIdentifier;
    setCreatedIdentifier(savedId);
    setDuplicateMatches([]);
    setSuccess(
      `${values.name.trim()} was added successfully as ${savedId}. Returning to the customer list…`
    );
    window.setTimeout(() => {
      router.push("/customers");
      router.refresh();
    }, 1600);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createCustomer({ acknowledgeDuplicates: duplicateConfirmed });
  }

  const disabled = loading || Boolean(success);

  return (
    <Card
      title="New customer"
      description="Create a customer record in Supabase, including optional billing information."
    >
      <form className="space-y-4" onSubmit={(e) => void onSubmit(e)} noValidate>
        {error ? (
          <div className="alert alert-error text-sm">
            <span>{error}</span>
          </div>
        ) : null}
        {success ? (
          <div className="alert alert-success text-sm">
            <div className="space-y-1">
              <p>{success}</p>
              {createdIdentifier ? (
                <p className="font-mono text-base font-semibold tracking-wide">{createdIdentifier}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {duplicateMatches.length > 0 ? (
          <div className="alert alert-warning text-sm">
            <div className="w-full space-y-3">
              <div>
                <p className="font-semibold">This customer may already exist</p>
                <p className="mt-1 opacity-90">
                  A matching name and/or primary contact email was found. Review the possible
                  match below. Nothing was created yet.
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
                  onClick={() => void createCustomer({ acknowledgeDuplicates: true })}
                >
                  Create anyway — I confirm this is a new customer
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-box border border-dashed border-base-300 bg-base-200/40 px-3 py-2 text-sm">
          <p className="font-medium">Customer ID</p>
          <p className="opacity-70">
            Assigned automatically on save (for example, CUST-00001). This field is not editable.
          </p>
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
            aria-describedby={fieldErrors.name ? "customer-name-error" : undefined}
          />
          {fieldErrors.name ? (
            <span id="customer-name-error" className="mt-1 text-xs text-error" role="alert">
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
            aria-describedby={fieldErrors.contactEmail ? "contact-email-error" : undefined}
          />
          {fieldErrors.contactEmail ? (
            <span id="contact-email-error" className="mt-1 text-xs text-error" role="alert">
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
          <p className="text-xs opacity-70">Optional. Used for invoices and collections later.</p>

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
              aria-describedby={
                fieldErrors.billingContactEmail ? "billing-contact-email-error" : undefined
              }
            />
            {fieldErrors.billingContactEmail ? (
              <span id="billing-contact-email-error" className="mt-1 text-xs text-error" role="alert">
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
            <label className="form-control w-full sm:col-span-1">
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
            {loading ? "Saving…" : "Save customer"}
          </Button>
          <ButtonLink href="/customers" variant="secondary" disabled={loading}>
            Cancel
          </ButtonLink>
        </div>
      </form>
    </Card>
  );
}
