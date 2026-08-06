"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  customerId: string;
  customerName: string;
  createdBy: string;
  contracts: { id: string; label: string }[];
};

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const;

const ISSUE_CATEGORIES = [
  "Password Reset",
  "Email",
  "Network",
  "Printer",
  "Hardware",
  "Software",
  "Security",
  "Server",
  "Cloud Services",
  "Other",
] as const;

const DESCRIPTION_PLACEHOLDER = `Please include:
• What happened
• Any error messages you saw
• When the issue began
• How this is affecting your business`;

type FieldErrors = {
  title?: string;
  description?: string;
  category?: string;
  priority?: string;
  customer?: string;
  contract?: string;
};

export function SupportRequestForm({ customerId, customerName, createdBy, contracts }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]["value"] | "">("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [contractId, setContractId] = useState(contracts.length === 1 ? contracts[0].id : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const hasContracts = contracts.length > 0;

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!title.trim()) next.title = "Please enter a request title.";
    if (!description.trim()) {
      next.description = "Please describe the issue, including what happened and when it began.";
    } else if (description.trim().length < 20) {
      next.description = "Please add a bit more detail so our team can help (at least a few sentences).";
    }
    if (!serviceCategory) next.category = "Please select an issue category.";
    if (!priority) next.priority = "Please select a priority.";
    if (!customerId) next.customer = "Your organization could not be determined. Please sign in again.";
    if (!hasContracts) {
      next.contract = "No active contracts are on file. Contact your account manager before submitting.";
    } else if (!contractId) {
      next.contract = "Please select the related active contract.";
    }
    return next;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const nextErrors = validate();
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError("Please complete the required fields highlighted below.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const submittedAt = new Date().toISOString();

    const { data, error: insertError } = await supabase
      .from("support_tickets")
      .insert({
        customer_id: customerId,
        contract_id: contractId,
        title: title.trim(),
        description: description.trim(),
        priority,
        service_category: serviceCategory,
        status: "new",
        submitted_at: submittedAt,
        created_by: createdBy,
      })
      .select("id, ticket_number")
      .single();

    setLoading(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "We couldn't submit your request. Please try again.");
      return;
    }

    setMessage(`Request ${data.ticket_number} was submitted successfully. Taking you to the ticket…`);
    router.push(`/tickets/${data.id}`);
    router.refresh();
  }

  return (
    <form
      className="space-y-4 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm sm:p-6"
      onSubmit={onSubmit}
      noValidate
    >
      <div>
        <p className="text-base font-semibold">Submit a New Support Request</p>
        <p className="mt-1 text-sm opacity-70">
          Tell us what you need help with. Fields marked with * are required.
        </p>
      </div>

      {error ? (
        <div className="alert alert-error text-sm" role="alert">
          <span>{error}</span>
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success text-sm" role="status">
          <span>{message}</span>
        </div>
      ) : null}

      {!hasContracts ? (
        <div className="alert alert-warning text-sm">
          <span>
            You do not have an active service contract on file, so new requests cannot be submitted
            yet. Please contact your account manager.
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="form-control w-full sm:col-span-2">
          <span className="label-text mb-1 text-xs font-medium uppercase tracking-wide opacity-70">
            Request Title *
          </span>
          <input
            className={`input input-bordered w-full ${fieldErrors.title ? "input-error" : ""}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief summary of the issue"
            disabled={loading || !hasContracts}
            aria-invalid={Boolean(fieldErrors.title)}
            aria-describedby={fieldErrors.title ? "title-error" : undefined}
          />
          {fieldErrors.title ? (
            <span id="title-error" className="mt-1 text-xs text-error">
              {fieldErrors.title}
            </span>
          ) : null}
        </label>

        <label className="form-control w-full">
          <span className="label-text mb-1 text-xs font-medium uppercase tracking-wide opacity-70">
            Issue Category *
          </span>
          <select
            className={`select select-bordered w-full ${fieldErrors.category ? "select-error" : ""}`}
            value={serviceCategory}
            onChange={(e) => setServiceCategory(e.target.value)}
            disabled={loading || !hasContracts}
            aria-invalid={Boolean(fieldErrors.category)}
          >
            <option value="">Select a category</option>
            {ISSUE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          {fieldErrors.category ? <span className="mt-1 text-xs text-error">{fieldErrors.category}</span> : null}
        </label>

        <label className="form-control w-full">
          <span className="label-text mb-1 text-xs font-medium uppercase tracking-wide opacity-70">
            Priority *
          </span>
          <select
            className={`select select-bordered w-full ${fieldErrors.priority ? "select-error" : ""}`}
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
            disabled={loading || !hasContracts}
            aria-invalid={Boolean(fieldErrors.priority)}
          >
            <option value="">Select priority</option>
            {PRIORITIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          {fieldErrors.priority ? <span className="mt-1 text-xs text-error">{fieldErrors.priority}</span> : null}
        </label>

        <label className="form-control w-full">
          <span className="label-text mb-1 text-xs font-medium uppercase tracking-wide opacity-70">
            Customer / Organization *
          </span>
          <input
            className="input input-bordered w-full bg-base-200"
            value={customerName}
            readOnly
            aria-readonly="true"
            title="Your organization is set from your signed-in account"
          />
          <span className="mt-1 text-xs opacity-60">Locked to your organization.</span>
          {fieldErrors.customer ? <span className="mt-1 text-xs text-error">{fieldErrors.customer}</span> : null}
        </label>

        <label className="form-control w-full">
          <span className="label-text mb-1 text-xs font-medium uppercase tracking-wide opacity-70">
            Related Active Contract *
          </span>
          <select
            className={`select select-bordered w-full ${fieldErrors.contract ? "select-error" : ""}`}
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            disabled={loading || !hasContracts}
            aria-invalid={Boolean(fieldErrors.contract)}
          >
            <option value="">{hasContracts ? "Select a contract" : "No active contracts"}</option>
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.label}
              </option>
            ))}
          </select>
          {fieldErrors.contract ? <span className="mt-1 text-xs text-error">{fieldErrors.contract}</span> : null}
        </label>
      </div>

      <label className="form-control w-full">
        <span className="label-text mb-1 text-xs font-medium uppercase tracking-wide opacity-70">
          Detailed Issue Description *
        </span>
        <textarea
          className={`textarea textarea-bordered w-full min-h-36 ${fieldErrors.description ? "textarea-error" : ""}`}
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={DESCRIPTION_PLACEHOLDER}
          disabled={loading || !hasContracts}
          aria-invalid={Boolean(fieldErrors.description)}
        />
        {fieldErrors.description ? (
          <span className="mt-1 text-xs text-error">{fieldErrors.description}</span>
        ) : (
          <span className="mt-1 text-xs opacity-60">
            Status will be set to New. Ticket number is assigned automatically.
          </span>
        )}
      </label>

      <div className="flex justify-end">
        <button className="btn btn-primary" type="submit" disabled={loading || !hasContracts}>
          {loading ? "Submitting…" : "Submit Request"}
        </button>
      </div>
    </form>
  );
}
