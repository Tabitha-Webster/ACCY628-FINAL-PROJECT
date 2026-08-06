"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Hours, Money, StatusBadge } from "@/components/ui";
import { DashboardMetricAccordion, DashboardSection } from "@/components/DashboardAccordion";
import {
  isAdditionalWorkFullyApproved,
  needsManagerAdditionalWorkDecision,
} from "@/lib/additional-work-approvals";

type ProjectSummary = {
  id: string;
  name: string;
  status: string;
  customer_name: string;
};

type PendingProject = {
  id: string;
  name: string;
  status: string;
  customer_name: string;
  customer_approval_status: string | null;
};

type PendingChangeRequest = {
  id: string;
  title: string;
  project_id: string | null;
  project_name: string;
  estimated_hours: number | null;
  estimated_amount: number | null;
  approval_status: string;
  customer_approval_status?: string | null;
};

type PendingMilestone = {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
};

type TechnicianAttentionItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone?: "default" | "warning";
};

function ProjectLinkRow({
  href,
  title,
  detail,
  trailing,
}: {
  href: string;
  title: string;
  detail?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-box border border-base-300 bg-base-200/40 px-3 py-2">
      <div className="min-w-0">
        <Link href={href} className="link link-hover font-medium" onClick={(e) => e.stopPropagation()}>
          {title}
        </Link>
        {detail ? <p className="text-xs opacity-60">{detail}</p> : null}
      </div>
      {trailing}
    </div>
  );
}

/** Compact Projects page overview — metrics open as dropdowns with queue actions inside. */
export default function ProjectsOverviewPanel({
  role,
  currentUserId,
  projects,
  proposedProjects,
  projectsAwaitingCustomer,
  pendingChangeRequests,
  pendingMilestones,
  technicianItems = [],
  counts,
}: {
  role: "manager" | "technician" | string;
  currentUserId: string;
  projects: ProjectSummary[];
  proposedProjects: PendingProject[];
  projectsAwaitingCustomer: PendingProject[];
  pendingChangeRequests: PendingChangeRequest[];
  pendingMilestones: PendingMilestone[];
  technicianItems?: TechnicianAttentionItem[];
  counts: {
    total: number;
    inProgress: number;
    awaitingApproval: number;
    openOutOfScope: number;
  };
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const managerPendingCrs = pendingChangeRequests.filter((r) => needsManagerAdditionalWorkDecision(r));
  const inProgressProjects = projects.filter((p) => p.status === "in_progress");
  const isManager = role === "manager";

  async function decideChangeRequest(requestId: string, decision: "approved" | "rejected") {
    setError(null);
    setLoading(`cr-${requestId}-${decision}`);
    const supabase = createClient();
    const now = new Date().toISOString();
    const request = pendingChangeRequests.find((r) => r.id === requestId);
    const { error: updateError } = await supabase
      .from("additional_work_requests")
      .update({
        approval_status: decision,
        reviewed_by: currentUserId,
        reviewed_at: now,
        review_notes: notes.trim() || null,
      })
      .eq("id", requestId);

    if (!updateError && decision === "approved" && request?.project_id) {
      const nextState = {
        approval_status: decision,
        customer_approval_status: request.customer_approval_status ?? "pending",
        project_id: request.project_id,
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

  async function decideMilestone(milestoneId: string, decision: "approved" | "rejected") {
    setError(null);
    setLoading(`ms-${milestoneId}-${decision}`);
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
    const { error: updateError } = await supabase.from("project_milestones").update(patch).eq("id", milestoneId);
    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  async function sendForCustomerApproval(projectId: string) {
    setError(null);
    setLoading(`send-${projectId}`);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        status: "awaiting_customer_approval",
        customer_approval_status: "pending",
      })
      .eq("id", projectId);
    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  return (
    <DashboardSection
      title={isManager ? "Projects overview" : "My projects overview"}
      description={
        isManager
          ? "Open a metric for the approval queue — send to customer, waiting, out-of-scope, and milestones."
          : "Open a metric for assigned work and items that need follow-up."
      }
    >
      {error ? <div className="alert alert-error mb-3 text-sm">{error}</div> : null}

      <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricAccordion
          label="Projects"
          value={String(counts.total)}
          hint={isManager ? "All projects" : "Assigned to you"}
        >
          {projects.length === 0 ? (
            <p className="text-sm opacity-70">No projects yet.</p>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <ProjectLinkRow
                  key={p.id}
                  href={`/projects?selected=${p.id}`}
                  title={p.name}
                  detail={p.customer_name}
                  trailing={<span className="text-xs opacity-60">{p.status.replace(/_/g, " ")}</span>}
                />
              ))}
            </div>
          )}
        </DashboardMetricAccordion>

        <DashboardMetricAccordion
          label="In Progress"
          value={String(counts.inProgress)}
          hint="Active delivery"
        >
          {inProgressProjects.length === 0 ? (
            <p className="text-sm opacity-70">No projects in progress.</p>
          ) : (
            <div className="space-y-2">
              {inProgressProjects.map((p) => (
                <ProjectLinkRow
                  key={p.id}
                  href={`/projects?selected=${p.id}`}
                  title={p.name}
                  detail={p.customer_name}
                />
              ))}
            </div>
          )}
        </DashboardMetricAccordion>

        <DashboardMetricAccordion
          label="Awaiting Approval"
          value={String(counts.awaitingApproval)}
          hint="Approval pending"
          tone={counts.awaitingApproval > 0 ? "warning" : "default"}
        >
          {isManager ? (
            <div className="space-y-3">
              {proposedProjects.length === 0 && projectsAwaitingCustomer.length === 0 ? (
                <p className="text-sm opacity-70">Nothing waiting on customer approval.</p>
              ) : null}

              {proposedProjects.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide opacity-60">Send to customer</p>
                  {proposedProjects.map((p) => (
                    <ProjectLinkRow
                      key={p.id}
                      href={`/projects?selected=${p.id}`}
                      title={p.name}
                      detail={p.customer_name}
                      trailing={
                        <button
                          type="button"
                          className="btn btn-outline btn-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            void sendForCustomerApproval(p.id);
                          }}
                          disabled={loading !== null}
                        >
                          {loading === `send-${p.id}` ? "Sending…" : "Send for Customer Approval"}
                        </button>
                      }
                    />
                  ))}
                </div>
              ) : null}

              {projectsAwaitingCustomer.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide opacity-60">Waiting on customer</p>
                  {projectsAwaitingCustomer.map((p) => (
                    <ProjectLinkRow
                      key={p.id}
                      href={`/projects?selected=${p.id}`}
                      title={p.name}
                      detail={p.customer_name}
                      trailing={<StatusBadge status="pending" />}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              {technicianItems.filter((i) => i.tone !== "warning").length === 0 ? (
                <p className="text-sm opacity-70">No open milestones needing attention.</p>
              ) : (
                technicianItems
                  .filter((i) => i.tone !== "warning")
                  .map((item) => (
                    <ProjectLinkRow key={item.id} href={item.href} title={item.title} detail={item.detail} />
                  ))
              )}
            </div>
          )}
        </DashboardMetricAccordion>

        <DashboardMetricAccordion
          label="Open Out-of-Scope"
          value={String(counts.openOutOfScope)}
          hint={isManager ? "Pending manager approval" : "Pending approval"}
          tone={counts.openOutOfScope > 0 ? "warning" : "success"}
        >
          {isManager ? (
            <div className="space-y-3">
              {managerPendingCrs.length === 0 && pendingMilestones.length === 0 ? (
                <p className="text-sm opacity-70">No out-of-scope or milestone approvals waiting.</p>
              ) : null}

              {managerPendingCrs.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide opacity-60">Change requests</p>
                  <p className="text-xs opacity-70">Customer approval is also required before billing.</p>
                  <textarea
                    className="textarea textarea-bordered textarea-sm w-full"
                    rows={1}
                    placeholder="Optional review notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {managerPendingCrs.map((r) => (
                    <div key={r.id} className="rounded-box border border-warning/40 bg-base-200/40 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{r.title}</p>
                          <Link
                            href={r.project_id ? `/projects?selected=${r.project_id}` : "/projects"}
                            className="link link-hover text-xs opacity-70"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.project_name}
                          </Link>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <span className="badge badge-warning badge-sm">Manager: pending</span>
                            <span className="badge badge-outline badge-sm">
                              Customer: {r.customer_approval_status ?? "pending"}
                            </span>
                          </div>
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
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn btn-success btn-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              void decideChangeRequest(r.id, "approved");
                            }}
                            disabled={loading !== null}
                          >
                            {loading === `cr-${r.id}-approved` ? "…" : "Approve"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-error btn-outline btn-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              void decideChangeRequest(r.id, "rejected");
                            }}
                            disabled={loading !== null}
                          >
                            {loading === `cr-${r.id}-rejected` ? "…" : "Reject"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {pendingMilestones.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide opacity-60">Milestone approvals</p>
                  {pendingMilestones.map((m) => (
                    <ProjectLinkRow
                      key={m.id}
                      href={`/projects?selected=${m.project_id}`}
                      title={m.name}
                      detail={m.project_name}
                      trailing={
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn btn-success btn-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              void decideMilestone(m.id, "approved");
                            }}
                            disabled={loading !== null}
                          >
                            {loading === `ms-${m.id}-approved` ? "…" : "Approve"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-error btn-outline btn-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              void decideMilestone(m.id, "rejected");
                            }}
                            disabled={loading !== null}
                          >
                            {loading === `ms-${m.id}-rejected` ? "…" : "Reject"}
                          </button>
                        </div>
                      }
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              {technicianItems.filter((i) => i.tone === "warning").length === 0 ? (
                <p className="text-sm opacity-70">No pending out-of-scope flags on your projects.</p>
              ) : (
                technicianItems
                  .filter((i) => i.tone === "warning")
                  .map((item) => (
                    <ProjectLinkRow key={item.id} href={item.href} title={item.title} detail={item.detail} />
                  ))
              )}
            </div>
          )}
        </DashboardMetricAccordion>
      </div>
    </DashboardSection>
  );
}
