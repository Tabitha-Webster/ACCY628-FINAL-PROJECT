"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  customerId: string;
  createdBy: string;
  contracts: { id: string; label: string }[];
};

const PRIORITIES = ["low", "medium", "high", "critical"] as const;

export function SupportRequestForm({ customerId, createdBy, contracts }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [serviceCategory, setServiceCategory] = useState("");
  const [contractId, setContractId] = useState(contracts.length === 1 ? contracts[0].id : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!title.trim() || !description.trim()) {
      setError("Please provide a title and description of the issue.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("support_tickets").insert({
      customer_id: customerId,
      contract_id: contractId || null,
      title: title.trim(),
      description: description.trim(),
      priority,
      service_category: serviceCategory || null,
      status: "new",
      created_by: createdBy,
    });
    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setTitle("");
    setDescription("");
    setServiceCategory("");
    setPriority("medium");
    setMessage("Your request has been submitted. Our team will respond shortly.");
    router.refresh();
  }

  return (
    <form className="space-y-3 rounded-box border border-base-300 bg-base-100 p-4" onSubmit={onSubmit}>
      <p className="text-sm font-semibold">Submit a New Support Request</p>
      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      {message ? <div className="alert alert-success text-sm">{message}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="form-control">
          <span className="label-text mb-1">Title</span>
          <input
            className="input input-bordered"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief summary of the issue"
            required
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1">Priority</span>
          <select className="select select-bordered" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="form-control">
          <span className="label-text mb-1">Category (optional)</span>
          <input
            className="input input-bordered"
            value={serviceCategory}
            onChange={(e) => setServiceCategory(e.target.value)}
            placeholder="e.g. Network, Email, Hardware"
          />
        </label>
        {contracts.length > 1 ? (
          <label className="form-control">
            <span className="label-text mb-1">Related Contract</span>
            <select className="select select-bordered" value={contractId} onChange={(e) => setContractId(e.target.value)}>
              <option value="">Not sure / general</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <label className="form-control">
        <span className="label-text mb-1">Description</span>
        <textarea
          className="textarea textarea-bordered"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell us what's happening, including any error messages and when it started."
          required
        />
      </label>

      <button className="btn btn-primary" disabled={loading}>
        {loading ? "Submitting…" : "Submit Request"}
      </button>
    </form>
  );
}
