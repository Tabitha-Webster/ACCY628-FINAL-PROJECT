"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, StatusBadge, Hours, DateText } from "@/components/ui";
import { TicketSlaAlerts, SlaConditionBadge } from "@/components/SlaBadges";
import { formatDateTime, statusLabel } from "@/lib/format";
import { evaluateTicketSla } from "@/lib/sla";
import { TechnicianWorkPanel } from "@/components/TechnicianWorkPanel";

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
};

export type ContractHourWarning = {
  contract_id: string;
  label: string;
  used: number;
  included: number;
  status: "warning" | "over_limit";
};

type Props = {
  technicianId: string;
  technicianName: string;
  internalCostRate: number;
  tickets: WorkspaceTicket[];
  pendingTimeEntries: WorkspaceTimeEntry[];
  pendingAdditionalWork: WorkspaceAdditionalWork[];
  contractWarnings: ContractHourWarning[];
};

const OPEN_STATUSES = new Set([
  "new",
  "assigned",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_approval",
]);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function hoursUntil(iso: string | null) {
  if (!iso) return null;
  return (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60);
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

function TicketCard({
  ticket,
  technicianId,
  internalCostRate,
  showWork,
  onToggleWork,
}: {
  ticket: WorkspaceTicket;
  technicianId: string;
  internalCostRate: number;
  showWork: boolean;
  onToggleWork: (ticketId: string) => void;
}) {
  const live = evaluateTicketSla(ticket);
  const isCritical = ticket.priority === "critical";
  const isOverdue = live.overdue;
  const border =
    isCritical || isOverdue
      ? "border-error/50 bg-error/[0.03]"
      : ticket.priority === "high" || live.overall === "at_risk"
        ? "border-warning/40 bg-warning/[0.03]"
        : "border-base-300 bg-base-100";

  return (
    <article className={`rounded-box border p-4 ${border}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/tickets/${ticket.id}`} className="link link-hover font-semibold">
              {ticket.ticket_number}
            </Link>
            <PriorityChip priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
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
          <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            <div>
              <dt className="opacity-60">Response deadline</dt>
              <dd>{formatDateTime(ticket.target_response_at)}</dd>
            </div>
            <div>
              <dt className="opacity-60">Resolution deadline</dt>
              <dd>{formatDateTime(ticket.target_resolution_at)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="opacity-60">Contract hours</dt>
              <dd>
                {ticket.hours_included != null ? (
                  <>
                    <Hours value={ticket.hours_used ?? 0} /> / <Hours value={ticket.hours_included} />
                    {ticket.hours_warning && ticket.hours_warning !== "normal"
                      ? ` · ${statusLabel(ticket.hours_warning)}`
                      : " · OK"}
                  </>
                ) : (
                  "No linked contract hours"
                )}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Link href={`/tickets/${ticket.id}`} className="btn btn-primary btn-sm">
            Open ticket
          </Link>
          {OPEN_STATUSES.has(ticket.status) ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onToggleWork(ticket.id)}>
              {showWork ? "Hide work form" : "Update status and work"}
            </button>
          ) : null}
        </div>
      </div>

      {showWork ? (
        <div className="mt-4">
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
            billableApprovalStatus={null}
            currentUserId={technicianId}
            internalCostRate={internalCostRate}
            contractHourlyRate={ticket.additional_hourly_rate}
            recordedHours={0}
            hasTimeEntryDescriptions={false}
            compact
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
  onToggleWork,
}: {
  tickets: WorkspaceTicket[];
  emptyTitle: string;
  emptyDescription?: string;
  technicianId: string;
  internalCostRate: number;
  activeWorkId: string | null;
  onToggleWork: (ticketId: string) => void;
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
          onToggleWork={onToggleWork}
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
  contractWarnings,
}: Props) {
  const [activeWorkId, setActiveWorkId] = useState<string | null>(null);

  function onToggleWork(ticketId: string) {
    setActiveWorkId((current) => (current === ticketId ? null : ticketId));
  }

  const openTickets = useMemo(() => {
    return tickets
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
      });
  }, [tickets]);

  const today = todayKey();
  const todaysTickets = useMemo(() => {
    return openTickets.filter((t) => {
      const responseToday = t.target_response_at?.slice(0, 10) === today;
      const resolutionToday = t.target_resolution_at?.slice(0, 10) === today;
      const startedToday =
        t.status === "in_progress" || t.status === "assigned" || t.status === "new";
      return (
        responseToday ||
        resolutionToday ||
        (startedToday &&
          (t.overdue || t.sla === "at_risk" || t.priority === "critical" || t.priority === "high"))
      );
    });
  }, [openTickets, today]);

  // Prefer explicit "due today" when possible; fall back to urgent open work for empty mornings
  const todayAssigned = useMemo(() => {
    const dueToday = openTickets.filter(
      (t) =>
        t.target_response_at?.slice(0, 10) === today ||
        t.target_resolution_at?.slice(0, 10) === today
    );
    return dueToday.length > 0 ? dueToday : todaysTickets.slice(0, 8);
  }, [openTickets, today, todaysTickets]);

  const criticalHigh = openTickets.filter((t) => t.priority === "critical" || t.priority === "high");
  const responseApproaching = openTickets.filter((t) => {
    if (t.actual_response_at) return false;
    const h = hoursUntil(t.target_response_at);
    return h != null && h >= 0 && (t.sla === "at_risk" || h <= 4);
  });
  const resolutionApproaching = openTickets.filter((t) => {
    if (t.completed_at) return false;
    const h = hoursUntil(t.target_resolution_at);
    return h != null && h >= 0 && (t.sla === "at_risk" || h <= 4);
  });
  const overdue = openTickets.filter((t) => t.overdue);
  const waitingCustomer = openTickets.filter((t) => t.status === "waiting_on_customer");
  const waitingApproval = openTickets.filter((t) => t.status === "waiting_on_approval");
  const recentlyCompleted = tickets
    .filter((t) => t.status === "resolved" || t.status === "closed")
    .slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <p className="text-sm font-semibold">Technician work queue</p>
        <p className="mt-1 text-sm opacity-70">
          Hi {technicianName.split(" ")[0]} — these are tickets assigned to you. Critical and overdue
          items are highlighted so you can act quickly.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <a href="#today" className="btn btn-ghost btn-xs">
            Today ({todayAssigned.length})
          </a>
          <a href="#overdue" className="btn btn-ghost btn-xs">
            Overdue ({overdue.length})
          </a>
          <a href="#critical" className="btn btn-ghost btn-xs">
            Critical/High ({criticalHigh.length})
          </a>
          <a href="#open" className="btn btn-ghost btn-xs">
            All open ({openTickets.length})
          </a>
          <Link href="/time-costs" className="btn btn-outline btn-xs">
            Full time & cost form
          </Link>
        </div>
      </div>

      <Section id="today" title="Today's assigned tickets" count={todayAssigned.length} tone={todayAssigned.length ? "warning" : "default"}>
        <TicketList
          tickets={todayAssigned}
          emptyTitle="Nothing urgent for today"
          emptyDescription="No assigned tickets are due today. Check your open queue below."
          technicianId={technicianId}
          internalCostRate={internalCostRate}
          activeWorkId={activeWorkId}
          onToggleWork={onToggleWork}
          
        />
      </Section>

      <Section id="critical" title="Critical and High-priority tickets" count={criticalHigh.length} tone={criticalHigh.length ? "error" : "default"}>
        <TicketList
          tickets={criticalHigh}
          emptyTitle="No critical or high-priority tickets"
          technicianId={technicianId}
          internalCostRate={internalCostRate}
          activeWorkId={activeWorkId}
          onToggleWork={onToggleWork}
          
        />
      </Section>

      <Section id="overdue" title="Overdue tickets" count={overdue.length} tone={overdue.length ? "error" : "default"}>
        <TicketList
          tickets={overdue}
          emptyTitle="No overdue tickets"
          emptyDescription="All of your assigned SLA deadlines are still on track."
          technicianId={technicianId}
          internalCostRate={internalCostRate}
          activeWorkId={activeWorkId}
          onToggleWork={onToggleWork}
          
        />
      </Section>

      <Section
        id="response-due"
        title="Tickets approaching response deadlines"
        count={responseApproaching.length}
        tone={responseApproaching.length ? "warning" : "default"}
      >
        <TicketList
          tickets={responseApproaching}
          emptyTitle="No response deadlines approaching"
          technicianId={technicianId}
          internalCostRate={internalCostRate}
          activeWorkId={activeWorkId}
          onToggleWork={onToggleWork}
          
        />
      </Section>

      <Section
        id="resolution-due"
        title="Tickets approaching resolution deadlines"
        count={resolutionApproaching.length}
        tone={resolutionApproaching.length ? "warning" : "default"}
      >
        <TicketList
          tickets={resolutionApproaching}
          emptyTitle="No resolution deadlines approaching"
          technicianId={technicianId}
          internalCostRate={internalCostRate}
          activeWorkId={activeWorkId}
          onToggleWork={onToggleWork}
          
        />
      </Section>

      <Section id="waiting-customer" title="Tickets waiting on customer information" count={waitingCustomer.length}>
        <TicketList
          tickets={waitingCustomer}
          emptyTitle="Nothing waiting on customers"
          technicianId={technicianId}
          internalCostRate={internalCostRate}
          activeWorkId={activeWorkId}
          onToggleWork={onToggleWork}
          
        />
      </Section>

      <Section id="waiting-approval" title="Tickets waiting on approval" count={waitingApproval.length} tone={waitingApproval.length ? "warning" : "default"}>
        <TicketList
          tickets={waitingApproval}
          emptyTitle="No tickets waiting on approval"
          technicianId={technicianId}
          internalCostRate={internalCostRate}
          activeWorkId={activeWorkId}
          onToggleWork={onToggleWork}
          
        />
      </Section>

      <Section id="open" title="All open assigned tickets" count={openTickets.length} defaultOpen={false}>
        <TicketList
          tickets={openTickets}
          emptyTitle="No open assigned tickets"
          emptyDescription="When a manager assigns work to you, it will show up here."
          technicianId={technicianId}
          internalCostRate={internalCostRate}
          activeWorkId={activeWorkId}
          onToggleWork={onToggleWork}
          
        />
      </Section>

      <Section id="completed" title="Recently completed tickets" count={recentlyCompleted.length} defaultOpen={false}>
        <TicketList
          tickets={recentlyCompleted}
          emptyTitle="No recently completed tickets"
          technicianId={technicianId}
          internalCostRate={internalCostRate}
          activeWorkId={activeWorkId}
          onToggleWork={onToggleWork}
          
        />
      </Section>

      <Section
        id="time-pending"
        title="Time entries not yet submitted"
        count={pendingTimeEntries.length}
        tone={pendingTimeEntries.length ? "warning" : "default"}
      >
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
                  <th>Submitted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingAdditionalWork.map((w) => (
                  <tr key={w.id}>
                    <td>{w.title}</td>
                    <td>{w.customer_name}</td>
                    <td>{w.estimated_hours != null ? <Hours value={w.estimated_hours} /> : "—"}</td>
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
                ))}
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
    </div>
  );
}
