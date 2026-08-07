"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, StatusBadge, Hours, DateText } from "@/components/ui";
import { TicketSlaAlerts } from "@/components/SlaBadges";
import { SlaCountdown } from "@/components/SlaCountdown";
import { TechnicianWorkPanel } from "@/components/TechnicianWorkPanel";
import { serviceModeLabel } from "@/components/ServiceModeBadge";
import {
  TechnicianHomeVisuals,
  type TechMetricFilter,
} from "@/components/TechnicianHomeVisuals";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, statusLabel } from "@/lib/format";
import {
  evaluateTechnicianTicketSla,
  localDateKey,
  localDateKeyFromIso,
  slaConditionLabel,
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
  defaultOpen = false,
}: {
  id: string;
  title: string;
  count: number;
  tone?: "default" | "warning" | "error" | "sky" | "violet" | "emerald";
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const shell =
    tone === "error"
      ? "border-rose-400/25 bg-rose-500/10"
      : tone === "warning"
        ? "border-amber-400/25 bg-amber-500/10"
        : tone === "sky"
          ? "border-sky-400/25 bg-sky-500/10"
          : tone === "violet"
            ? "border-violet-400/25 bg-violet-500/10"
            : tone === "emerald"
              ? "border-emerald-400/25 bg-emerald-500/10"
              : "border-base-300 bg-base-100/60";
  const headerBorder =
    tone === "error"
      ? "border-rose-400/20 text-base-content/80"
      : tone === "warning"
        ? "border-amber-400/20 text-base-content/80"
        : tone === "sky"
          ? "border-sky-400/20 text-base-content/80"
          : tone === "violet"
            ? "border-violet-400/20 text-base-content/80"
            : tone === "emerald"
              ? "border-emerald-400/20 text-base-content/80"
              : "border-base-300 text-base-content/80";
  return (
    <section id={id} className={`overflow-hidden rounded-2xl border shadow-sm ${shell}`}>
      <button
        type="button"
        className={`flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left ${headerBorder}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
        <span className="flex items-center gap-2">
          <span className="rounded-full border border-base-300 bg-base-100/50 px-2 py-0.5 text-[11px] font-semibold tabular-nums">
            {count}
          </span>
          <span className="text-[11px] opacity-60">{open ? "Hide" : "Show"}</span>
        </span>
      </button>
      {open ? <div className="p-3">{children}</div> : null}
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
  const live = evaluateTechnicianTicketSla(ticket);
  const isCritical = ticket.priority === "critical";
  const isOverdue = live.overdue;
  const isOpen = OPEN_STATUSES.has(ticket.status);
  const awFriendly = friendlyAwStatus(aw?.approval_status ?? null);

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-3 text-neutral-900 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/tickets/${ticket.id}`} className="link link-hover font-semibold">
              {ticket.ticket_number}
            </Link>
            <StatusBadge status={ticket.status} className="badge-sm" />
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs opacity-70">
            <span className={isCritical ? "font-medium text-error" : undefined}>
              {isCritical ? "⚠ Critical" : statusLabel(ticket.priority)}
            </span>
            <span aria-hidden className="opacity-40">
              ·
            </span>
            <span>
              {serviceModeLabel(ticket.service_mode)}
              {ticket.service_location?.trim() ? ` · ${ticket.service_location.trim()}` : ""}
            </span>
            <span aria-hidden className="opacity-40">
              ·
            </span>
            <span
              className={
                live.overall === "missed" || isOverdue
                  ? "text-error"
                  : live.overall === "at_risk"
                    ? "text-warning"
                    : undefined
              }
            >
              {slaConditionLabel(live.overall)}
            </span>
            {ticket.hours_warning && ticket.hours_warning !== "normal" ? (
              <>
                <span aria-hidden className="opacity-40">
                  ·
                </span>
                <span className="text-warning">{statusLabel(ticket.hours_warning)}</span>
              </>
            ) : null}
          </p>
          {(isCritical || isOverdue || live.overall === "at_risk") && (
            <div className="mt-2">
              <TicketSlaAlerts ticket={ticket} forTechnician />
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
  const [activeWorkId, setActiveWorkId] = useState<string | null>(null);
  const [workFocus, setWorkFocus] = useState<WorkFocus>(null);
  const [filter, setFilter] = useState<QueueFilter>("all_sections");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function onMetricClick(next: TechMetricFilter) {
    if (next === "hours_today") {
      document.getElementById("time-pending")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setFilter(next);
    requestAnimationFrame(() => {
      document.getElementById("filtered-queue")?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (next === "all_sections") {
        document.getElementById("today")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

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
          const live = evaluateTechnicianTicketSla(t);
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

  const slaCounts = useMemo(() => {
    let overdueCount = 0;
    let atRisk = 0;
    let onTrack = 0;
    for (const t of openTickets) {
      if (t.overdue || t.sla === "missed") overdueCount += 1;
      else if (t.sla === "at_risk") atRisk += 1;
      else onTrack += 1;
    }
    return { overdue: overdueCount, atRisk, onTrack };
  }, [openTickets]);

  const homeMetrics = [
    {
      label: "Open",
      value: String(summary.openAssigned),
      tone: "sky" as const,
      filter: "open" as const,
      hint: "Assigned to you",
    },
    {
      label: "Due today",
      value: String(summary.dueToday),
      tone: "amber" as const,
      filter: "due_today" as const,
      hint: "Response or resolution",
    },
    {
      label: "Overdue",
      value: String(summary.overdue),
      tone: "rose" as const,
      filter: "overdue" as const,
      hint: "Missed SLA deadline",
    },
    {
      label: "Critical / High",
      value: String(summary.criticalHigh),
      tone: "violet" as const,
      filter: "critical_high" as const,
    },
    {
      label: "Hours today",
      value: summary.hoursToday.toFixed(1),
      tone: "emerald" as const,
      filter: "hours_today" as const,
      hint: "Time logged today",
    },
  ];

  return (
    <TechnicianHomeVisuals
      fullName={technicianName}
      metrics={homeMetrics}
      activeFilter={filter}
      onMetricClick={onMetricClick}
      sla={slaCounts}
      calendarTickets={tickets}
      timezoneLabel={timezoneLabel}
      contractWarnings={contractWarnings}
    >
      {actionError ? (
        <div className="alert alert-error text-sm" role="alert">
          {actionError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
            filter === "awaiting_approval"
              ? "border-amber-400/40 bg-amber-500/15 text-base-content"
              : "border-base-300 bg-base-100/50 opacity-80 hover:opacity-100"
          }`}
          onClick={() => onMetricClick("awaiting_approval")}
        >
          Awaiting approval ({summary.awaitingApproval})
        </button>
        <button
          type="button"
          className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
            filter === "completed_today"
              ? "border-emerald-400/40 bg-emerald-500/15 text-base-content"
              : "border-base-300 bg-base-100/50 opacity-80 hover:opacity-100"
          }`}
          onClick={() => onMetricClick("completed_today")}
        >
          Completed today ({summary.completedToday})
        </button>
        <button
          type="button"
          className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
            filter === "all_sections"
              ? "border-violet-400/40 bg-violet-500/15 text-base-content"
              : "border-base-300 bg-base-100/50 opacity-80 hover:opacity-100"
          }`}
          onClick={() => onMetricClick("all_sections")}
        >
          Browse all sections
        </button>
      </div>

      {!showSections ? (
        <Section
          key={filter}
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
          defaultOpen
          tone={
            filter === "overdue" || filter === "critical_high"
              ? "error"
              : filter === "due_today" || filter === "awaiting_approval"
                ? "warning"
                : "sky"
          }
        >
          <TicketList
            tickets={filteredQueue}
            emptyTitle="Nothing in this filter"
            emptyDescription="Try another summary tile or browse all sections."
            {...listProps}
          />
        </Section>
      ) : (
        <>
          <Section
            id="today"
            title="Tickets due today"
            count={dueToday.length}
            tone={dueToday.length ? "warning" : "default"}
          >
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

          <Section
            id="overdue"
            title="Overdue tickets"
            count={overdue.length}
            tone={overdue.length ? "error" : "default"}
          >
            <TicketList
              tickets={overdue}
              emptyTitle="No overdue tickets"
              emptyDescription="All of your assigned SLA deadlines are still on track."
              {...listProps}
            />
          </Section>

          <Section
            id="waiting-customer"
            title="Tickets waiting on customer information"
            count={waitingCustomer.length}
            tone="violet"
          >
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

          <Section id="open" title="All open assigned tickets" count={openTickets.length} tone="sky" defaultOpen>
            <TicketList
              tickets={openTickets}
              emptyTitle="No open assigned tickets"
              emptyDescription="When a manager assigns work to you, it will show up here."
              {...listProps}
            />
          </Section>

          <Section
            id="completed"
            title="Recently completed tickets"
            count={recentlyCompleted.length}
            tone="emerald"
            defaultOpen={false}
          >
            <TicketList tickets={recentlyCompleted} emptyTitle="No recently completed tickets" {...listProps} />
          </Section>
        </>
      )}

      <Section
        id="time-pending"
        title="Time entries not yet submitted"
        count={pendingTimeEntries.length}
        tone={pendingTimeEntries.length ? "warning" : "emerald"}
      >
        <p className="mb-3 text-xs opacity-70">
          Hours recorded today (all entries): <Hours value={summary.hoursToday} />
        </p>
        {pendingTimeEntries.length === 0 ? (
          <EmptyState
            title="No unsubmitted time entries"
            description="Draft or pending time entries will appear here."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100/40">
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
        tone={pendingAdditionalWork.length ? "warning" : "violet"}
      >
        {pendingAdditionalWork.length === 0 ? (
          <EmptyState title="No pending additional-work requests" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100/40">
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
    </TechnicianHomeVisuals>
  );
}
