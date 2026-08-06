"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  technicianId: string;
  customers: { id: string; name: string }[];
  contracts: { id: string; label: string; customerId: string }[];
};

export function AdHocWorkForm({ technicianId, customers, contracts }: Props) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [contractId, setContractId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const contractsForCustomer = contracts.filter((c) => c.customerId === customerId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!customerId) {
      setError("Please select a customer.");
      return;
    }
    if (!title.trim()) {
      setError("Please enter a title for the ad hoc work.");
      return;
    }
    if (!description.trim()) {
      setError("Please describe the work.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("additional_work_requests").insert({
      customer_id: customerId,
      contract_id: contractId || null,
      support_ticket_id: null,
      project_id: null,
      requested_by: technicianId,
      title: title.trim(),
      description: description.trim(),
      estimated_hours: estimatedHours ? Number(estimatedHours) : null,
      estimated_amount: estimatedAmount ? Number(estimatedAmount) : null,
      approval_status: "pending",
      customer_approval_status: "not_required",
    });
    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setMessage("Ad hoc work request submitted for manager review.");
    setTitle("");
    setDescription("");
    setEstimatedHours("");
    setEstimatedAmount("");
    setContractId("");
    router.refresh();
  }

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4">
      <h2 className="mb-3 text-sm font-semibold">Document Ad Hoc Work</h2>
      <p className="mb-3 text-xs opacity-60">
        Submit out-of-scope or unscheduled work for manager approval when it is not tied to an existing ticket.
      </p>

      <form className="space-y-3" onSubmit={submit}>
        {error ? <div className="alert alert-error text-sm">{error}</div> : null}
        {message ? <div className="alert alert-success text-sm">{message}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="form-control">
            <span className="label-text mb-1">Customer</span>
            <select
              className="select select-bordered"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setContractId("");
              }}
              required
            >
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Contract (optional)</span>
            <select
              className="select select-bordered"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              disabled={!customerId}
            >
              <option value="">None</option>
              {contractsForCustomer.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="form-control">
          <span className="label-text mb-1">Title</span>
          <input
            className="input input-bordered"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Emergency after-hours network restore"
            required
          />
        </label>

        <label className="form-control">
          <span className="label-text mb-1">Description</span>
          <textarea
            className="textarea textarea-bordered"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was done, why it was needed, and anything the manager should know."
            required
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="form-control">
            <span className="label-text mb-1">Estimated Hours (optional)</span>
            <input
              type="number"
              min="0"
              step="0.25"
              className="input input-bordered"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Estimated Amount (optional)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input input-bordered"
              value={estimatedAmount}
              onChange={(e) => setEstimatedAmount(e.target.value)}
            />
          </label>
        </div>

        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Submitting…" : "Submit Ad Hoc Request"}
        </button>
      </form>
    </div>
  );
}
