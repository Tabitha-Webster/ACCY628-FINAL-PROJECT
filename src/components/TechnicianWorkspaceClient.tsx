"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, StatusBadge, Hours, DateText, StatCard } from "@/components/ui";
import { TicketSlaAlerts, SlaConditionBadge } from "@/components/SlaBadges";
import { SlaCountdown } from "@/components/SlaCountdown";
import { TechnicianWorkPanel } from "@/components/TechnicianWorkPanel";
import { TechnicianCalendar } from "@/components/TechnicianCalendar";
import { ServiceModeBadge } from "@/components/ServiceModeBadge";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, statusLabel } from "@/lib/format";
import {
  evaluateTicketSla,
  localDateKey,
  localDateKeyFromIso,
  technicianUrgencyRank,
  earliestRelevantDeadlineMs,
} from "@/lib/sla";
import { ticketUpdateForStatusChange, type WorkScope } from "@/lib/technicianWork";

export type WorkspaceTicket = {
  id: string;
  ticket_number: string;
  title: string;
  customer_id: string;
  customer_name: string;
  contract_id: string | null;
  contract_label: string | null;
  priority: string;
  status: string;
  target_response_at: string | null;
  target_resolution_at: string | null;
  actual_response_at: string | null;
  completed_at: string | null;
  technician_notes: string | null;
  customer_resolution_summary: string | null;
  classification: string | null;
  billable_approval_status: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  service_mode: string | null;
  service_location: string | null;
  schedule_notes: string | null;
  hours_warning: "normal" | "warning" | "over_limit" | null;
  hours_used: number | null;
  hours_included: number | null;
  additional_hourly_rate: number | null;
  submitted_at: string;
  sla: "met" | "at_risk" | "missed" | "not_yet_due" | "not_defined";
  response_sla: "met" | "at_risk" | "missed" | "not_yet_due" | "not_defined";
  resolution_sla: "met" | "at_risk" | "missed" | "not_yet_due" | "not_defined";
  overdue: boolean;
};

export type WorkspaceTimeEntry = {
  id: string;
  work_date: string;
  hours_worked: number;
  description: string;
  approval_status: string;
  support_ticket_id: string | null;
  ticket_label: string | null;
};

export type WorkspaceAdditionalWork = {
  id: string;
  title: string;
  customer_name: string;
  approval_status: string;
  created_at: string;
  estimated_hours: number | null;
  support_ticket_id: string | null;
  review_notes: string | null;
};

export type ContractHourWarning = {
  contract_id: string;
  label: string;
  used: number;
  included: number;
  status: "warning" | "over_limit";
};

export type WorkspaceSummary = {
  openAssigned: number;
  dueToday: number;
  criticalHigh: number;
  overdue: number;
  completedToday: number;
  hoursToday: number;
  awaitingApproval: number;
};

type WorkFocus = "status" | "notes" | "time" | "scope" | "complete" | null;
type QueueFilter =
  | "open"
  | "due_today"
  | "critical_high"
  | "overdue"
  | "completed_today"
  | "awaiting_approval"
  | "all_sections";

type Props = {
  technicianId: string;
  technicianName: string;
  internalCostRate: number;
  tickets: WorkspaceTicket[];
  pendingTimeEntries: WorkspaceTimeEntry[];
  pendingAdditionalWork: WorkspaceAdditionalWork[];
  allAdditionalWork: WorkspaceAdditionalWork[];
  contractWarnings: ContractHourWarning[];
  summary: WorkspaceSummary;
  completedTodayIds: string[];
  timezoneLabel: string;
};

const OPEN_STATUSES = new Set([
  "new",
  "assigned",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_approval",
]);

function PriorityChip({ priority }: { priority: string }) {
  if (priority === "critical") {
    return (
      <span className="inline-flex items-center gap-1 rounded-box border border-error/40 bg-error/10 px-2 py-0.5 text-xs font-semibold text-error">
        ⚠ Critical
      </span>
    );
  }
  return <StatusBadge status={priority} />;
}

function friendlyAwStatus(status: string | null | undefined): {
  key: string;
  label: string;
} {
  if (!status) return { key: "not_submitted", label: "Not Submitted" };
  if (status === "pending") return { key: "pending", label: "Pending Approval" };
  if (status === "approved") return { key: "approved", label: "Approved" };
  if (status === "rejected") return { key: "rejected", label: "Rejected" };
  if (status === "more_information_required" || status === "needs_info")
    return { key: "more_information_required", label: "More Information Required" };
  return { key: status, label: statusLabel(status) };
}

function isDueToday(ticket: WorkspaceTicket, today: string) {
  const responseDue =
    localDateKeyFromIso(ticket.target_response_at) === today && !ticket.actual_response_at;
  const resolutionDue =
    localDateKeyFromIso(ticket.target_resolution_at) === today &&
    !ticket.completed_at &&
    ticket.status !== "resolved" &&
    ticket.status !== "closed";
  return responseDue || resolutionDue;
}

function sortByUrgency(tickets: WorkspaceTicket[]) {
  const now = new Date();
  return [...tickets].sort((a, b) => {
    const ra = technicianUrgencyRank(a, now);
    const rb = technicianUrgencyRank(b, now);
    if (ra !== rb) return ra - rb;
    return earliestRelevantDeadlineMs(a) - earliestRelevantDeadlineMs(b);
  });
}

function Section({
  id,
  title,
  count,
  tone,
  children,
  defaultOpen = true,
}: {
  id: string;
  title: string;
  count: number;
  tone?: "default" | "warning" | "error";
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toneClass =
    tone === "error" ? "border-error/40" : tone === "warning" ? "border-warning/40" : "border-base-300";
  return (
    <section id={id} className={`rounded-box border ${toneClass} bg-base-100`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold">{title}</span>
        <span className="flex items-center gap-2">
          <span
            className={`badge ${
              tone === "error" ? "badge-error" : tone === "warning" ? "badge-warning" : "badge-ghost"
            }`}
          >
            {count}
          </span>
          <span className="text-xs opacity-60">{open ? "Hide" : "Show"}</span>
        </span>
      </button>
      {open ? <div className="border-t border-base-300 p-4">{children}</div> : null}
    </section>
  );
}

function TicketCard({
  ticket,
  technicianId,
  internalCostRate,
  showWork,
  workFocus,
  onToggleWork,
  aw,
  onStartWork,
  starting,
}: {
  ticket: WorkspaceTicket;
  technicianId: string;
  internalCostRate: number;
  showWork: boolean;
  workFocus: WorkFocus;
  onToggleWork: (ticketId: string, focus?: WorkFocus) => void;
  aw: WorkspaceAdditionalWork | null;
  onStartWork: (ticket: WorkspaceTicket) => void;
  starting: boolean;
}) {
  const live = evaluateTicketSla(ticket);
  const isCritical = ticket.priority === "critical";
  const isOverdue = live.overdue;
  const isOpen = OPEN_STATUSES.has(ticket.status);
  const awFriendly = friendlyAwStatus(aw?.approval_status ?? null);
  const border =
    isCritical || isOverdue
      ? "border-error/50 bg-error/[0.03]"
      : ticket.priority === "high" || live.overall === "at_risk"
        ? "border-warning/40 bg-warning/[0.03]"
        : "border-base-300 bg-base-100";

  return (
    <article className={`rounded-box border p-4 ${border}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/tickets/${ticket.id}`} className="link link-hover font-semibold">
              {ticket.ticket_number}
            </Link>
            <PriorityChip priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
            <ServiceModeBadge mode={ticket.service_mode} location={ticket.service_location} />
            <SlaConditionBadge condition={live.overall} />
            {ticket.hours_warning && ticket.hours_warning !== "normal" ? (
              <StatusBadge status={ticket.hours_warning} />
            ) : null}
          </div>
          {(isCritical || isOverdue || live.overall === "at_risk") && (
            <div className="mt-2">
              <TicketSlaAlerts ticket={ticket} />
            </div>
          )}
          <p className="mt-1 text-sm font-medium">{ticket.title}</p>
          <p className="mt-1 text-xs opacity-70">{ticket.customer_name}</p>

          {isOpen ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <SlaCountdown
                label="Response time"
                submittedAt={ticket.submitted_at}
                targetAt={ticket.target_response_at}
                satisfiedAt={ticket.actual_response_at}
                kind="response"
              />
              <SlaCountdown
                label="Resolution time"
                submittedAt={ticket.submitted_at}
                targetAt={ticket.target_resolution_at}
                satisfiedAt={ticket.completed_at}
                status={ticket.status}
                kind="resolution"
              />
            </div>
          ) : (
            <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
              <div>
                <dt className="opacity-60">Response deadline</dt>
                <dd>{formatDateTime(ticket.target_response_at)}</dd>
              </div>
              <div>
                <dt className="opacity-60">Resolution deadline</dt>
                <dd>{formatDateTime(ticket.target_resolution_at)}</dd>
              </div>
            </dl>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="opacity-60">Additional work:</span>
            <StatusBadge status={awFriendly.key} />
            <span className="opacity-70">{awFriendly.label}</span>
            {aw && (aw.approval_status === "pending" || awFriendly.key === "more_information_required") ? (
              <Link href="/additional-work" className="link link-hover">
                Open request
              </Link>
            ) : null}
            {aw?.approval_status === "approved" ? (
              <span className="opacity-60">Still needs completion rules before billing.</span>
            ) : null}
            {aw?.approval_status === "rejected" ? (
              <span className="opacity-60">Excluded from Ready to Bill.</span>
            ) : null}
          </div>

          {ticket.contract_label ? (
            <p className="mt-2 text-xs opacity-60">
              Contract: {ticket.contract_label}
              {ticket.hours_included != null ? (
                <>
                  {" "}
                  · <Hours value={ticket.hours_used ?? 0} /> / <Hours value={ticket.hours_included} /> hrs
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:min-w-[11rem]">
          <Link href={`/tickets/${ticket.id}`} className="btn btn-primary btn-sm">
            Open Ticket
          </Link>
          {isOpen && ticket.status === "assigned" ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={starting}
              onClick={() => onStartWork(ticket)}
            >
              {starting ? "Starting…" : "Start Work"}
            </button>
          ) : null}
          {isOpen ? (
            <>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => onToggleWork(ticket.id, "status")}
              >
                Update Status
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => onToggleWork(ticket.id, "notes")}
              >
                Add Work Note
              </button>
              <Link
                href={`/time-costs?ticket=${ticket.id}`}
                className="btn btn-outline btn-sm"
              >
                Record Time and Cost
              </Link>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => onToggleWork(ticket.id, "scope")}
              >
                Flag Out-of-Scope Work
              </button>
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={() => onToggleWork(ticket.id, "complete")}
              >
                Mark Work Complete
              </button>
            </>
          ) : null}
        </div>
      </div>

      {showWork ? (
        <div className="mt-4" id={`work-panel-${ticket.id}`}>
          <TechnicianWorkPanel
            ticketId={ticket.id}
            customerId={ticket.customer_id}
            contractId={ticket.contract_id}
            status={ticket.status}
            priority={ticket.priority}
            assignedTechnicianId={technicianId}
            actualResponseAt={ticket.actual_response_at}
            technicianNotes={ticket.technician_notes}
            completionNotes={null}
            customerResolutionSummary={ticket.customer_resolution_summary}
            classification={ticket.classification}
            billableApprovalStatus={ticket.billable_approval_status}
            currentUserId={technicianId}
            internalCostRate={internalCostRate}
            contractHourlyRate={ticket.additional_hourly_rate}
            recordedHours={0}
            hasTimeEntryDescriptions={false}
            compact
            initialFocus={workFocus}
            serviceMode={ticket.service_mode}
            serviceLocation={ticket.service_location}
          />
        </div>
      ) : null}
    </article>
  );
}

function TicketList({
  tickets,
  emptyTitle,
  emptyDescription,
  technicianId,
  internalCostRate,
  activeWorkId,
  workFocus,
  onToggleWork,
  awByTicket,
  onStartWork,
  startingId,
}: {
  tickets: WorkspaceTicket[];
  emptyTitle: string;
  emptyDescription?: string;
  technicianId: string;
  internalCostRate: number;
  activeWorkId: string | null;
  workFocus: WorkFocus;
  onToggleWork: (ticketId: string, focus?: WorkFocus) => void;
  awByTicket: Map<string, WorkspaceAdditionalWork>;
  onStartWork: (ticket: WorkspaceTicket) => void;
  startingId: string | null;
}) {
  if (tickets.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="grid gap-3">
      {tickets.map((ticket) => (
        <TicketCard
          key={ticket.id}
          ticket={ticket}
          technicianId={technicianId}
          internalCostRate={internalCostRate}
          showWork={activeWorkId === ticket.id}
          workFocus={activeWorkId === ticket.id ? workFocus : null}
          onToggleWork={onToggleWork}
          aw={awByTicket.get(ticket.id) ?? null}
          onStartWork={onStartWork}
          starting={startingId === ticket.id}
        />
      ))}
    </div>
  );
}

export function TechnicianWorkspaceClient({
  technicianId,
  technicianName,
  internalCostRate,
  tickets,
  pendingTimeEntries,
  pendingAdditionalWork,
  allAdditionalWork,
  contractWarnings,
  summary,
  completedTodayIds,
  timezoneLabel,
}: Props) {
  const router = useRouter();
  const [workspaceView, setWorkspaceView] = useState<"list" | "calendar">("list");
  const [activeWorkId, setActiveWorkId] = useState<string | null>(null);
  const [workFocus, setWorkFocus] = useState<WorkFocus>(null);
  const [filter, setFilter] = useState<QueueFilter>("open");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function onToggleWork(ticketId: string, focus: WorkFocus = "status") {
    setActiveWorkId((current) => {
      if (current === ticketId && workFocus === focus) {
        setWorkFocus(null);
        return null;
      }
      setWorkFocus(focus);
      return ticketId;
    });
    requestAnimationFrame(() => {
      document.getElementById(`work-panel-${ticketId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  async function onStartWork(ticket: WorkspaceTicket) {
    setActionError(null);
    setStartingId(ticket.id);
    const supabase = createClient();
    const patch = ticketUpdateForStatusChange({
      nextStatus: "in_progress",
      currentActualResponseAt: ticket.actual_response_at,
      scope: (ticket.classification === "out_of_scope" ? "out_of_scope" : "included") as WorkScope,
    });
    // Start Work should move to in_progress without forcing OOS waiting status
    const startPatch = {
      status: "in_progress",
      ...(patch.actual_response_at ? { actual_response_at: patch.actual_response_at } : {}),
    };
    const { error } = await supabase
      .from("support_tickets")
      .update(startPatch)
      .eq("id", ticket.id)
      .eq("assigned_technician_id", technicianId);
    setStartingId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    router.refresh();
  }

  const today = localDateKey();

  const awByTicket = useMemo(() => {
    const map = new Map<string, WorkspaceAdditionalWork>();
    const rows = Array.isArray(allAdditionalWork) ? allAdditionalWork : [];
    for (const row of rows) {
      if (!row.support_ticket_id) continue;
      const existing = map.get(row.support_ticket_id);
      if (!existing || new Date(row.created_at).getTime() > new Date(existing.created_at).getTime()) {
        map.set(row.support_ticket_id, row);
      }
    }
    return map;
  }, [allAdditionalWork]);

  const openTickets = useMemo(() => {
    return sortByUrgency(
      tickets
        .filter((t) => OPEN_STATUSES.has(t.status))
        .map((t) => {
          const live = evaluateTicketSla(t);
          return {
            ...t,
            sla: live.overall,
            response_sla: live.response,
            resolution_sla: live.resolution,
            overdue: live.overdue,
          };
        })
    );
  }, [tickets]);

  const dueToday = useMemo(
    () => sortByUrgency(openTickets.filter((t) => isDueToday(t, today))),
    [openTickets, today]
  );
  const criticalHigh = useMemo(
    () => sortByUrgency(openTickets.filter((t) => t.priority === "critical" || t.priority === "high")),
    [openTickets]
  );
  const overdue = useMemo(
    () => sortByUrgency(openTickets.filter((t) => t.overdue)),
    [openTickets]
  );
  const waitingCustomer = openTickets.filter((t) => t.status === "waiting_on_customer");
  const waitingApproval = openTickets.filter((t) => t.status === "waiting_on_approval");
  const recentlyCompleted = tickets
    .filter((t) => t.status === "resolved" || t.status === "closed")
    .slice(0, 8);
  const completedToday = tickets.filter((t) => completedTodayIds.includes(t.id));

  const filteredQueue = useMemo(() => {
    switch (filter) {
      case "due_today":
        return dueToday;
      case "critical_high":
        return criticalHigh;
      case "overdue":
        return overdue;
      case "completed_today":
        return completedToday;
      case "awaiting_approval":
        return openTickets.filter((t) => awByTicket.get(t.id)?.approval_status === "pending");
      case "open":
      default:
        return openTickets;
    }
  }, [filter, dueToday, criticalHigh, overdue, completedToday, openTickets, awByTicket]);

  const showSections = filter === "all_sections";

  const listProps = {
    technicianId,
    internalCostRate,
    activeWorkId,
    workFocus,
    onToggleWork,
    awByTicket,
    onStartWork,
    startingId,
  };

  return (
    <div className="space-y-4">
      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Technician work queue</p>
            <p className="mt-1 text-sm opacity-70">
              Hi {technicianName.split(" ")[0]} — tickets assigned to you only. Critical and overdue items
              stay highlighted so you can act quickly.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className={`btn btn-sm ${workspaceView === "list" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setWorkspaceView("list")}
            >
              List View
            </button>
            <button
              type="button"
              className={`btn btn-sm ${workspaceView === "calendar" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setWorkspaceView("calendar")}
            >
              Calendar View
            </button>
          </div>
        </div>
        {actionError ? (
          <div className="alert alert-error mt-3 text-sm" role="alert">
            {actionError}
          </div>
        ) : null}
      </div>

      {workspaceView === "calendar" ? (
        <section className="rounded-box border border-base-300 bg-base-100 p-4">
          <TechnicianCalendar tickets={tickets} timezoneLabel={timezoneLabel} />
        </section>
      ) : null}

      {workspaceView === "list" ? (
        <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open assigned tickets"
          value={String(summary.openAssigned)}
          hint="Not resolved, closed, or canceled"
          tone={summary.openAssigned ? "info" : "default"}
          onClick={() => setFilter("open")}
        />
        <StatCard
          label="Tickets due today"
          value={String(summary.dueToday)}
          hint="Incomplete response or resolution deadline today"
          tone={summary.dueToday ? "warning" : "default"}
          onClick={() => setFilter("due_today")}
        />
        <StatCard
          label="Critical or High priority"
          value={String(summary.criticalHigh)}
          tone={summary.criticalHigh ? "error" : "default"}
          onClick={() => setFilter("critical_high")}
        />
        <StatCard
          label="Overdue tickets"
          value={String(summary.overdue)}
          hint="Missed response or resolution deadline"
          tone={summary.overdue ? "error" : "default"}
          onClick={() => setFilter("overdue")}
        />
        <StatCard
          label="Tickets completed today"
          value={String(summary.completedToday)}
          tone={summary.completedToday ? "success" : "default"}
          onClick={() => setFilter("completed_today")}
        />
        <StatCard
          label="Hours recorded today"
          value={summary.hoursToday.toFixed(1)}
          hint="Your time entries for today"
          href="#time-pending"
        />
        <StatCard
          label="Awaiting approval"
          value={String(summary.awaitingApproval)}
          hint="Your additional-work requests still pending"
          tone={summary.awaitingApproval ? "warning" : "default"}
          onClick={() => setFilter("awaiting_approval")}
        />
        <StatCard
          label="Browse all sections"
          value="→"
          hint="Today, overdue, waiting, completed lists"
          onClick={() => setFilter("all_sections")}
        />
      </div>

      {!showSections ? (
        <Section
          id="filtered-queue"
          title={
            filter === "due_today"
              ? "Tickets due today"
              : filter === "critical_high"
                ? "Critical and High-priority tickets"
                : filter === "overdue"
                  ? "Overdue tickets"
                  : filter === "completed_today"
                    ? "Tickets completed today"
                    : filter === "awaiting_approval"
                      ? "Tickets with pending additional-work approval"
                      : "Open assigned tickets (urgency order)"
          }
          count={filteredQueue.length}
          tone={
            filter === "overdue" || filter === "critical_high"
              ? "error"
              : filter === "due_today" || filter === "awaiting_approval"
                ? "warning"
                : "default"
          }
        >
          <TicketList
            tickets={filteredQueue}
            emptyTitle="Nothing in this filter"
            emptyDescription="Try another summary card or browse all sections."
            {...listProps}
          />
        </Section>
      ) : (
        <>
          <Section id="today" title="Tickets due today" count={dueToday.length} tone={dueToday.length ? "warning" : "default"}>
            <TicketList
              tickets={dueToday}
              emptyTitle="Nothing due today"
              emptyDescription="No assigned tickets have an incomplete SLA deadline on today's date."
              {...listProps}
            />
          </Section>

          <Section
            id="critical"
            title="Critical and High-priority tickets"
            count={criticalHigh.length}
            tone={criticalHigh.length ? "error" : "default"}
          >
            <TicketList
              tickets={criticalHigh}
              emptyTitle="No critical or high-priority tickets"
              {...listProps}
            />
          </Section>

          <Section id="overdue" title="Overdue tickets" count={overdue.length} tone={overdue.length ? "error" : "default"}>
            <TicketList
              tickets={overdue}
              emptyTitle="No overdue tickets"
              emptyDescription="All of your assigned SLA deadlines are still on track."
              {...listProps}
            />
          </Section>

          <Section id="waiting-customer" title="Tickets waiting on customer information" count={waitingCustomer.length}>
            <TicketList tickets={waitingCustomer} emptyTitle="Nothing waiting on customers" {...listProps} />
          </Section>

          <Section
            id="waiting-approval"
            title="Tickets waiting on approval"
            count={waitingApproval.length}
            tone={waitingApproval.length ? "warning" : "default"}
          >
            <TicketList tickets={waitingApproval} emptyTitle="No tickets waiting on approval" {...listProps} />
          </Section>

          <Section id="open" title="All open assigned tickets" count={openTickets.length} defaultOpen>
            <TicketList
              tickets={openTickets}
              emptyTitle="No open assigned tickets"
              emptyDescription="When a manager assigns work to you, it will show up here."
              {...listProps}
            />
          </Section>

          <Section id="completed" title="Recently completed tickets" count={recentlyCompleted.length} defaultOpen={false}>
            <TicketList tickets={recentlyCompleted} emptyTitle="No recently completed tickets" {...listProps} />
          </Section>
        </>
      )}

      <Section
        id="time-pending"
        title="Time entries not yet submitted"
        count={pendingTimeEntries.length}
        tone={pendingTimeEntries.length ? "warning" : "default"}
      >
        <p className="mb-3 text-xs opacity-70">
          Hours recorded today (all entries): <Hours value={summary.hoursToday} />
        </p>
        {pendingTimeEntries.length === 0 ? (
          <EmptyState title="No unsubmitted time entries" description="Draft or pending time entries will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ticket</th>
                  <th>Hours</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {pendingTimeEntries.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <DateText value={e.work_date} />
                    </td>
                    <td>
                      {e.support_ticket_id ? (
                        <Link className="link link-hover" href={`/tickets/${e.support_ticket_id}`}>
                          {e.ticket_label ?? "Ticket"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Hours value={e.hours_worked} />
                    </td>
                    <td>
                      <StatusBadge status={e.approval_status} />
                    </td>
                    <td className="max-w-xs truncate opacity-70">{e.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3">
          <Link href="/time-costs" className="btn btn-outline btn-sm">
            Review / submit time
          </Link>
        </div>
      </Section>

      <Section
        id="additional-work"
        title="Additional-work requests awaiting approval"
        count={pendingAdditionalWork.length}
        tone={pendingAdditionalWork.length ? "warning" : "default"}
      >
        {pendingAdditionalWork.length === 0 ? (
          <EmptyState title="No pending additional-work requests" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Customer</th>
                  <th>Est. hours</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingAdditionalWork.map((w) => {
                  const friendly = friendlyAwStatus(w.approval_status);
                  return (
                    <tr key={w.id}>
                      <td>{w.title}</td>
                      <td>{w.customer_name}</td>
                      <td>{w.estimated_hours != null ? <Hours value={w.estimated_hours} /> : "—"}</td>
                      <td>
                        <StatusBadge status={friendly.key} />
                      </td>
                      <td>
                        <DateText value={w.created_at} />
                      </td>
                      <td>
                        {w.support_ticket_id ? (
                          <Link className="btn btn-ghost btn-xs" href={`/tickets/${w.support_ticket_id}`}>
                            Open ticket
                          </Link>
                        ) : (
                          <Link className="btn btn-ghost btn-xs" href="/additional-work">
                            View list
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        id="hour-warnings"
        title="Contract-hour warnings"
        count={contractWarnings.length}
        tone={contractWarnings.length ? "warning" : "default"}
      >
        {contractWarnings.length === 0 ? (
          <EmptyState
            title="No contract-hour warnings"
            description="Included-hour usage on your assigned contracts is within normal limits this month."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Used / Included</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contractWarnings.map((w) => (
                  <tr key={w.contract_id}>
                    <td>{w.label}</td>
                    <td>
                      <Hours value={w.used} /> / <Hours value={w.included} />
                    </td>
                    <td>
                      <StatusBadge status={w.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
        </>
      ) : null}
    </div>
  );
}
