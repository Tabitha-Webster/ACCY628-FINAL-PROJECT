"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Hours, Money } from "@/components/ui";
import type { UserRole } from "@/lib/constants";
import type { ApprovalStatus, ProjectStatus } from "@/lib/types";
import {
  additionalWorkOverallLabel,
  isAdditionalWorkAwaitingDecision,
  isAdditionalWorkFullyApproved,
  needsCustomerAdditionalWorkDecision,
  needsManagerAdditionalWorkDecision,
} from "@/lib/additional-work-approvals";

type MilestoneAction = {
  id: string;
  name: string;
  completed: boolean;
  approval_status: ApprovalStatus | null;
};

type ContractOption = {
  id: string;
  label: string;
};

type Props = {
  projectId: string;
  projectName?: string;
  customerId: string;
  contractId: string | null;
  contractOptions?: ContractOption[];
  status: ProjectStatus;
  customerApprovalStatus: ApprovalStatus | null;
  currentUserId: string;
  role: UserRole;
  milestones?: MilestoneAction[];
};

export function ProjectActions({
  projectId,
  projectName,
  customerId,
  contractId,
  contractOptions = [],
  status,
  customerApprovalStatus,
  currentUserId,
  role,
  milestones = [],
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [showChangeForm, setShowChangeForm] = useState(false);
  const [crTitle, setCrTitle] = useState("");
  const [crDescription, setCrDescription] = useState("");
  const [crHours, setCrHours] = useState("");
  const [crAmount, setCrAmount] = useState("");
  const [markRelatedTime, setMarkRelatedTime] = useState(role === "technician");
  const [selectedContractId, setSelectedContractId] = useState(contractId ?? "");

  useEffect(() => {
    setSelectedContractId(contractId ?? "");
  }, [contractId]);

  const awaitingCustomerApproval =
    status === "awaiting_customer_approval" || customerApprovalStatus === "pending";
  const canCustomerDecide = role === "customer" && awaitingCustomerApproval;
  const canManagerDecideCustomerApproval = role === "manager" && customerApprovalStatus === "pending";
  const canAdvanceStatus = role === "manager" && ["proposed", "approved", "in_progress"].includes(status);
  const canSubmitChangeRequest = role === "manager" || role === "technician";
  const options =
    contractOptions.length > 0
      ? contractOptions
      : contractId
        ? [{ id: contractId, label: "Linked contract" }]
        : [];

  async function run(label: string, work: () => Promise<string | null>) {
    setError(null);
    setMessage(null);
    setLoading(label);
    const err = await work();
    setLoading(null);
    if (err) {
      setError(err);
      return;
    }
    router.refresh();
  }

  async function decideCustomerApproval(decision: "approved" | "rejected") {
    await run(decision, async () => {
      const supabase = createClient();
      const nextStatus: ProjectStatus = decision === "approved" ? "approved" : "canceled";
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("projects")
        .update({
          customer_approval_status: decision,
          status: nextStatus,
          customer_approved_by: currentUserId,
          customer_approved_at: now,
        })
        .eq("id", projectId);
      if (updateError) return updateError.message;
      setMessage(decision === "approved" ? "Project approved." : "Project rejected.");
      return null;
    });
  }

  async function setProjectStatus(next: ProjectStatus) {
    await run(next, async () => {
      const supabase = createClient();
      const patch: Record<string, unknown> = { status: next };
      if (next === "awaiting_customer_approval") {
        patch.customer_approval_status = "pending";
      }
      if (next === "completed") {
        patch.billing_status = "ready";
      }
      const { error: updateError } = await supabase.from("projects").update(patch).eq("id", projectId);
      if (updateError) return updateError.message;
      setMessage(`Project marked ${next.replaceAll("_", " ")}.`);
      return null;
    });
  }

  async function completeMilestone(milestoneId: string) {
    await run(`milestone-${milestoneId}`, async () => {
      const supabase = createClient();
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        completed: true,
        completed_at: now,
        approval_status: role === "manager" ? "approved" : "pending",
      };
      if (role === "manager") {
        patch.approved_by = currentUserId;
        patch.approved_at = now;
      }
      const { error: updateError } = await supabase
        .from("project_milestones")
        .update(patch)
        .eq("id", milestoneId)
        .eq("project_id", projectId);
      if (updateError) return updateError.message;
      setMessage(role === "manager" ? "Milestone completed and approved." : "Milestone marked complete — pending approval.");
      return null;
    });
  }

  async function decideMilestone(milestoneId: string, decision: "approved" | "rejected") {
    await run(`milestone-decision-${milestoneId}`, async () => {
      const supabase = createClient();
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        approval_status: decision,
        approved_by: currentUserId,
        approved_at: now,
      };
      if (decision === "approved") {
        patch.completed = true;
        patch.completed_at = now;
      }
      const { error: updateError } = await supabase
        .from("project_milestones")
        .update(patch)
        .eq("id", milestoneId)
        .eq("project_id", projectId);
      if (updateError) return updateError.message;
      setMessage(`Milestone ${decision}.`);
      return null;
    });
  }

  async function submitOutOfScope(e: React.FormEvent) {
    e.preventDefault();
    if (!crTitle.trim() || !crDescription.trim()) {
      setError("Provide a title and description for the out-of-scope work.");
      return;
    }
    if (!selectedContractId) {
      setError("Select the related contract so this change request stays connected to the agreement.");
      return;
    }
    const hoursValue = Number(crHours);
    const priceValue = Number(crAmount);
    if (!crHours.trim() || Number.isNaN(hoursValue) || hoursValue < 0) {
      setError("Enter the requested additional hours (use 0 if none).");
      return;
    }
    if (!crAmount.trim() || Number.isNaN(priceValue) || priceValue < 0) {
      setError("Enter the requested additional price (use 0 if none).");
      return;
    }
    await run("change-request", async () => {
      const supabase = createClient();
      const title = crTitle.trim().startsWith("[Out of Scope]")
        ? crTitle.trim()
        : `[Out of Scope] ${crTitle.trim()}`;
      const linkedContract = options.find((c) => c.id === selectedContractId);
      const description = [
        "Flagged as outside the approved project / contract scope.",
        `Linked project: ${projectName ?? projectId}`,
        `Linked contract: ${linkedContract?.label ?? selectedContractId}`,
        `Requested additional hours: ${hoursValue}`,
        `Requested additional price: $${priceValue.toFixed(2)}`,
        crDescription.trim(),
        markRelatedTime
          ? "Related unbilled project time was also marked out of scope pending manager and customer approval."
          : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      const { error: insertError } = await supabase.from("additional_work_requests").insert({
        customer_id: customerId,
        contract_id: selectedContractId,
        project_id: projectId,
        support_ticket_id: null,
        requested_by: currentUserId,
        title,
        description,
        estimated_hours: hoursValue,
        estimated_amount: priceValue,
        approval_status: "pending",
        customer_approval_status: "pending",
      });
      if (insertError) return insertError.message;

      if (markRelatedTime) {
        await supabase
          .from("time_entries")
          .update({
            classification: "out_of_scope",
            approval_status: "pending",
          })
          .eq("project_id", projectId)
          .in("billing_status", ["unbilled", "ready"])
          .neq("classification", "out_of_scope");
      }

      setShowChangeForm(false);
      setCrTitle("");
      setCrDescription("");
      setCrHours("");
      setCrAmount("");
      setMarkRelatedTime(role === "technician");
      setMessage("Out-of-scope work flagged — needs manager and customer approval before billing.");
      return null;
    });
  }

  const showCustomerBlock = canCustomerDecide;
  const showManagerApprovalBlock = canManagerDecideCustomerApproval && !canCustomerDecide;
  const showStatusBlock = canAdvanceStatus;
  const showMilestones = (role === "manager" || role === "technician") && milestones.length > 0;
  const showChangeRequest = canSubmitChangeRequest;

  if (!showCustomerBlock && !showManagerApprovalBlock && !showStatusBlock && !showMilestones && !showChangeRequest) {
    return null;
  }

  const actionCount =
    (showCustomerBlock ? 1 : 0) +
    (showManagerApprovalBlock ? 1 : 0) +
    (showStatusBlock ? 1 : 0) +
    (showMilestones ? milestones.filter((m) => !m.completed || (role === "manager" && m.approval_status === "pending")).length : 0) +
    (showChangeRequest ? 1 : 0);

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            Project Actions
            {actionCount > 0 ? <span className="badge badge-ghost badge-sm">{actionCount}</span> : null}
          </span>
          <span className="text-xs font-normal opacity-60">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>

        <div className="mt-3 space-y-4 border-t border-base-300 pt-3">
          {error ? <div className="alert alert-error text-sm">{error}</div> : null}
          {message ? <div className="alert alert-success text-sm">{message}</div> : null}

          {showCustomerBlock ? (
            <div className="space-y-2 border-b border-base-300 pb-4">
              <p className="text-sm">This project is waiting for your approval before work begins.</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-success btn-sm" onClick={() => decideCustomerApproval("approved")} disabled={loading !== null}>
                  {loading === "approved" ? "Approving…" : "Approve Project"}
                </button>
                <button className="btn btn-error btn-outline btn-sm" onClick={() => decideCustomerApproval("rejected")} disabled={loading !== null}>
                  {loading === "rejected" ? "Rejecting…" : "Reject"}
                </button>
              </div>
            </div>
          ) : null}

          {showManagerApprovalBlock ? (
            <div className="space-y-2 border-b border-base-300 pb-4">
              <p className="text-sm opacity-80">Customer approval is still pending. Record the decision if already confirmed offline.</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-success btn-sm" onClick={() => decideCustomerApproval("approved")} disabled={loading !== null}>
                  Mark Customer Approved
                </button>
                <button className="btn btn-error btn-outline btn-sm" onClick={() => decideCustomerApproval("rejected")} disabled={loading !== null}>
                  Mark Rejected
                </button>
              </div>
            </div>
          ) : null}

          {showStatusBlock ? (
            <div className="space-y-2 border-b border-base-300 pb-4">
              <p className="text-xs font-medium uppercase tracking-wide opacity-60">Status</p>
              <div className="flex flex-wrap gap-2">
                {status === "proposed" ? (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setProjectStatus("awaiting_customer_approval")}
                    disabled={loading !== null}
                  >
                    {loading === "awaiting_customer_approval" ? "Sending…" : "Send for Customer Approval"}
                  </button>
                ) : null}
                {status === "approved" ? (
                  <button className="btn btn-primary btn-sm" onClick={() => setProjectStatus("in_progress")} disabled={loading !== null}>
                    {loading === "in_progress" ? "Updating…" : "Start Project"}
                  </button>
                ) : null}
                {status === "in_progress" ? (
                  <button className="btn btn-success btn-sm" onClick={() => setProjectStatus("completed")} disabled={loading !== null}>
                    {loading === "completed" ? "Completing…" : "Mark Completed"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {showMilestones ? (
            <div className="space-y-3 border-b border-base-300 pb-4">
              <p className="text-xs font-medium uppercase tracking-wide opacity-60">Milestones</p>
              {milestones.map((m) => (
                <div key={m.id} className="rounded-lg border border-base-300 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{m.name}</p>
                    <span className="text-xs opacity-60">{m.completed ? (m.approval_status ?? "completed") : "open"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!m.completed ? (
                      <button className="btn btn-outline btn-xs" onClick={() => completeMilestone(m.id)} disabled={loading !== null}>
                        {loading === `milestone-${m.id}` ? "Saving…" : "Mark Complete"}
                      </button>
                    ) : null}
                    {role === "manager" && m.approval_status === "pending" ? (
                      <>
                        <button className="btn btn-success btn-xs" onClick={() => decideMilestone(m.id, "approved")} disabled={loading !== null}>
                          Approve
                        </button>
                        <button className="btn btn-error btn-outline btn-xs" onClick={() => decideMilestone(m.id, "rejected")} disabled={loading !== null}>
                          Reject
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {showChangeRequest ? (
            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-warning">Out of Scope</p>
                  <p className="text-xs opacity-70">
                    Linked to project{projectName ? ` “${projectName}”` : ""} and a contract before manager review.
                  </p>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${showChangeForm ? "btn-ghost" : "btn-warning"}`}
                  onClick={() => setShowChangeForm((v) => !v)}
                >
                  {showChangeForm ? "Cancel" : role === "technician" ? "Flag Out of Scope" : "New Change Request"}
                </button>
              </div>
              {showChangeForm ? (
                <form className="space-y-2" onSubmit={submitOutOfScope}>
                  <div className="rounded-lg border border-base-300 bg-base-100 p-2 text-xs">
                    <p>
                      <span className="opacity-60">Project: </span>
                      <Link href={`/projects/${projectId}`} className="link link-hover font-medium">
                        {projectName ?? "Current project"}
                      </Link>
                    </p>
                    <label className="mt-2 block">
                      <span className="opacity-60">Contract</span>
                      <select
                        className="select select-bordered select-sm mt-1 w-full"
                        value={selectedContractId}
                        onChange={(e) => setSelectedContractId(e.target.value)}
                        required
                      >
                        <option value="">Select contract…</option>
                        {options.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {options.length === 0 ? (
                      <p className="mt-1 text-error">No contracts found for this customer. Link a contract on the project first.</p>
                    ) : null}
                  </div>
                  <input
                    className="input input-bordered input-sm w-full"
                    placeholder={role === "technician" ? "What is out of scope?" : "Change request title"}
                    value={crTitle}
                    onChange={(e) => setCrTitle(e.target.value)}
                    required
                  />
                  <textarea
                    className="textarea textarea-bordered textarea-sm w-full"
                    rows={3}
                    placeholder="Describe why this is out of scope, what extra work is needed, and customer impact…"
                    value={crDescription}
                    onChange={(e) => setCrDescription(e.target.value)}
                    required
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="form-control">
                      <span className="label-text mb-1 text-xs font-medium">Requested additional hours</span>
                      <input
                        className="input input-bordered input-sm"
                        type="number"
                        min="0"
                        step="0.25"
                        placeholder="e.g. 4"
                        value={crHours}
                        onChange={(e) => setCrHours(e.target.value)}
                        required
                      />
                    </label>
                    <label className="form-control">
                      <span className="label-text mb-1 text-xs font-medium">Requested additional price ($)</span>
                      <input
                        className="input input-bordered input-sm"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g. 500.00"
                        value={crAmount}
                        onChange={(e) => setCrAmount(e.target.value)}
                        required
                      />
                    </label>
                  </div>
                  <p className="text-[11px] opacity-60">
                    Enter the extra hours and price you are requesting for this out-of-scope work (use 0 if not applicable).
                  </p>
                  {role === "technician" || role === "manager" ? (
                    <label className="label cursor-pointer justify-start gap-2 py-1">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-warning checkbox-sm"
                        checked={markRelatedTime}
                        onChange={(e) => setMarkRelatedTime(e.target.checked)}
                      />
                      <span className="label-text text-xs">
                        Also mark related unbilled time on this project as out of scope (pending approval)
                      </span>
                    </label>
                  ) : null}
                  <button className="btn btn-warning btn-sm" type="submit" disabled={loading === "change-request" || options.length === 0}>
                    {loading === "change-request" ? "Submitting…" : "Submit Out-of-Scope Request"}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

type ChangeRequestRow = {
  id: string;
  title: string;
  description: string;
  estimated_hours: number | null;
  estimated_amount: number | null;
  approval_status: ApprovalStatus;
  customer_approval_status?: string | null;
  created_at: string;
  requested_by: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  project_id?: string | null;
  contract_id?: string | null;
};

export function ProjectChangeRequestPanel({
  requests,
  requesterNames,
  projectNames = {},
  contractLabels = {},
  role,
  currentUserId,
}: {
  requests: ChangeRequestRow[];
  requesterNames: Record<string, string>;
  projectNames?: Record<string, string>;
  contractLabels?: Record<string, string>;
  role: UserRole;
  currentUserId: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = requests.filter((r) => isAdditionalWorkAwaitingDecision(r));
  const decided = requests.filter((r) => !isAdditionalWorkAwaitingDecision(r));
  const canDecide = (r: ChangeRequestRow) => {
    if (role === "manager") return needsManagerAdditionalWorkDecision(r);
    if (role === "customer") {
      if (!needsCustomerAdditionalWorkDecision(r)) return false;
      return Number(r.estimated_hours ?? 0) > 0 || Number(r.estimated_amount ?? 0) > 0;
    }
    return false;
  };

  async function decide(requestId: string, decision: "approved" | "rejected") {
    setError(null);
    setLoading(`${requestId}-${decision}`);
    const supabase = createClient();
    const now = new Date().toISOString();
    const request = requests.find((r) => r.id === requestId);
    if (!request) {
      setLoading(null);
      setError("Request not found.");
      return;
    }

    const patch: Record<string, unknown> = {
      review_notes: notes.trim() || null,
    };

    if (role === "manager") {
      patch.approval_status = decision;
      patch.reviewed_by = currentUserId;
      patch.reviewed_at = now;
    } else if (role === "customer") {
      patch.customer_approval_status = decision;
      if (!request.reviewed_at) {
        patch.reviewed_by = currentUserId;
        patch.reviewed_at = now;
      }
    } else {
      setLoading(null);
      setError("You cannot decide this request.");
      return;
    }

    const { error: updateError } = await supabase.from("additional_work_requests").update(patch).eq("id", requestId);

    if (!updateError && decision === "approved" && request.project_id) {
      const nextState = {
        ...request,
        approval_status: role === "manager" ? decision : request.approval_status,
        customer_approval_status:
          role === "customer" ? decision : (request.customer_approval_status ?? "pending"),
      };
      if (isAdditionalWorkFullyApproved(nextState)) {
        await supabase
          .from("time_entries")
          .update({
            approval_status: "approved",
            approved_by: currentUserId,
            approved_at: now,
          })
          .eq("project_id", request.project_id)
          .eq("classification", "out_of_scope")
          .eq("approval_status", "pending");
      }
    }

    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  function linksFor(r: ChangeRequestRow) {
    return (
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {r.project_id ? (
          <Link href={`/projects/${r.project_id}`} className="badge badge-outline badge-sm gap-1">
            Project: {projectNames[r.project_id] ?? "View"}
          </Link>
        ) : (
          <span className="badge badge-ghost badge-sm">No project link</span>
        )}
        {r.contract_id ? (
          <Link href={`/contracts/${r.contract_id}`} className="badge badge-outline badge-sm gap-1">
            Contract: {contractLabels[r.contract_id] ?? "View"}
          </Link>
        ) : (
          <span className="badge badge-ghost badge-sm">No contract link</span>
        )}
      </div>
    );
  }

  function statusBadges(r: ChangeRequestRow) {
    return (
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className={`badge badge-sm ${r.approval_status === "approved" ? "badge-success" : r.approval_status === "rejected" ? "badge-error" : "badge-warning"}`}>
          Manager: {r.approval_status}
        </span>
        <span
          className={`badge badge-sm ${
            (r.customer_approval_status ?? "pending") === "approved"
              ? "badge-success"
              : (r.customer_approval_status ?? "pending") === "rejected"
                ? "badge-error"
                : (r.customer_approval_status ?? "pending") === "not_required"
                  ? "badge-ghost"
                  : "badge-warning"
          }`}
        >
          Customer: {r.customer_approval_status ?? "pending"}
        </span>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-box border border-dashed border-base-300 bg-base-100 p-4">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span>Out of Scope</span>
            <span className="text-xs font-normal opacity-60">
              <span className="group-open:hidden">Show</span>
              <span className="hidden group-open:inline">Hide</span>
            </span>
          </summary>
          <div className="mt-3 border-t border-base-300 pt-3 text-center">
            <p className="font-medium">No out-of-scope flags yet</p>
            <p className="mt-1 text-sm opacity-70">
              When a technician flags work outside the approved project scope, it will appear here linked to the project and
              contract.
            </p>
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            Out of Scope
            {pending.length > 0 ? <span className="badge badge-warning badge-sm">{pending.length}</span> : null}
          </span>
          <span className="text-xs font-normal opacity-60">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>

        <div className="mt-3 space-y-4 border-t border-base-300 pt-3">
          {error ? <div className="alert alert-error text-sm">{error}</div> : null}

          <div>
            <h3 className="mb-2 text-sm font-semibold">Awaiting Approval ({pending.length})</h3>
            {pending.length === 0 ? (
              <p className="text-sm opacity-60">Nothing pending.</p>
            ) : (
              <div className="space-y-3">
                {pending.map((r) => {
                  const isOutOfScope = r.title.toLowerCase().includes("out of scope");
                  return (
                    <div
                      key={r.id}
                      className={`rounded-box border bg-base-100 p-4 ${isOutOfScope ? "border-warning/50" : "border-base-300"}`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        {isOutOfScope ? (
                          <span className="badge badge-warning badge-sm">Out of Scope</span>
                        ) : (
                          <span className="badge badge-ghost badge-sm">Change Request</span>
                        )}
                        <span className="badge badge-outline badge-sm">{additionalWorkOverallLabel(r)}</span>
                      </div>
                      <p className="font-medium">{r.title}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm opacity-80">{r.description}</p>
                      {linksFor(r)}
                      {statusBadges(r)}
                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-base-300 bg-base-200/40 p-2 text-sm">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide opacity-60">Requested additional hours</p>
                          <p className="font-semibold">
                            {r.estimated_hours != null ? <Hours value={Number(r.estimated_hours)} /> : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide opacity-60">Requested additional price</p>
                          <p className="font-semibold">
                            {r.estimated_amount != null ? <Money value={Number(r.estimated_amount)} /> : "—"}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs opacity-60">Requested by {requesterNames[r.requested_by] ?? "—"}</p>
                      {canDecide(r) ? (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs opacity-70">
                            {role === "customer"
                              ? "Your approval is required in addition to the manager’s before this work can be billed."
                              : "Manager approval is required in addition to the customer’s before this work can be billed."}
                          </p>
                          <textarea
                            className="textarea textarea-bordered textarea-sm w-full"
                            rows={1}
                            placeholder="Review notes (optional)"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <button className="btn btn-success btn-sm" onClick={() => decide(r.id, "approved")} disabled={loading !== null}>
                              {loading === `${r.id}-approved` ? "Approving…" : role === "customer" ? "Approve Additional Work" : "Approve"}
                            </button>
                            <button
                              className="btn btn-error btn-outline btn-sm"
                              onClick={() => decide(r.id, "rejected")}
                              disabled={loading !== null}
                            >
                              {loading === `${r.id}-rejected` ? "Rejecting…" : "Reject"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2">
                          <span className="badge badge-warning">{additionalWorkOverallLabel(r)}</span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {decided.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Reviewed</h3>
              <div className="space-y-2">
                {decided.map((r) => {
                  const isOutOfScope = r.title.toLowerCase().includes("out of scope");
                  const overall = additionalWorkOverallLabel(r);
                  return (
                    <div key={r.id} className="rounded-box border border-base-300 bg-base-100 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          {isOutOfScope ? <span className="badge badge-ghost badge-sm mb-1">Out of Scope</span> : null}
                          <p className="font-medium">{r.title}</p>
                          {linksFor(r)}
                          {statusBadges(r)}
                        </div>
                        <span className={`badge ${overall === "approved" ? "badge-success" : overall === "rejected" ? "badge-error" : "badge-warning"}`}>
                          {overall}
                        </span>
                      </div>
                      <p className="mt-1 text-xs opacity-60">{requesterNames[r.requested_by] ?? "—"}</p>
                      {r.reviewed_at ? (
                        <p className="mt-1 text-xs opacity-70">
                          Last review by {r.reviewed_by ? requesterNames[r.reviewed_by] ?? "team member" : "team member"} on{" "}
                          {new Date(r.reviewed_at).toLocaleString()}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        <span>
                          Hours:{" "}
                          <strong>
                            {r.estimated_hours != null ? <Hours value={Number(r.estimated_hours)} /> : "—"}
                          </strong>
                        </span>
                        <span>
                          Price:{" "}
                          <strong>
                            {r.estimated_amount != null ? <Money value={Number(r.estimated_amount)} /> : "—"}
                          </strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
