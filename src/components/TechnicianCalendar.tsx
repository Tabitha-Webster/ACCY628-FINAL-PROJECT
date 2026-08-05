"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addDays,
  format,
  startOfWeek,
  isSameDay,
  parseISO,
  differenceInMinutes,
} from "date-fns";
import { StatusBadge } from "@/components/ui";
import { TicketSlaAlerts, SlaConditionBadge } from "@/components/SlaBadges";
import { evaluateTicketSla } from "@/lib/sla";
import { formatDateTime } from "@/lib/format";
import {
  eventEndIso,
  findOverloadedDays,
  findPastDeadlineSchedules,
  findScheduleConflicts,
  findUnscheduledCritical,
} from "@/lib/technicianSchedule";

export type CalendarTicket = {
  id: string;
  ticket_number: string;
  title: string;
  customer_name: string;
  contract_label: string | null;
  priority: string;
  status: string;
  submitted_at: string;
  target_response_at: string | null;
  target_resolution_at: string | null;
  actual_response_at: string | null;
  completed_at: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  service_mode: string | null;
  service_location: string | null;
  schedule_notes: string | null;
};

type Props = {
  tickets: CalendarTicket[];
  timezoneLabel: string;
};

type ViewMode = "week" | "day";

function modeLabel(mode: string | null) {
  if (mode === "onsite") return "Onsite";
  if (mode === "remote") return "Remote";
  return "Mode not set";
}

export function TechnicianCalendar({ tickets, timezoneLabel }: Props) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [view, setView] = useState<ViewMode>("week");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const days =
    view === "week"
      ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
      : [anchor];

  const scheduled = useMemo(
    () =>
      tickets.filter(
        (t): t is CalendarTicket & { scheduled_start_at: string } => Boolean(t.scheduled_start_at)
      ),
    [tickets]
  );

  const conflictPairs = useMemo(() => findScheduleConflicts(scheduled), [scheduled]);
  const pastDeadline = useMemo(() => findPastDeadlineSchedules(scheduled), [scheduled]);
  const overloaded = useMemo(() => findOverloadedDays(scheduled, 5), [scheduled]);
  const unscheduledCritical = useMemo(() => findUnscheduledCritical(tickets), [tickets]);

  const conflictIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of conflictPairs) {
      set.add(c.aId);
      set.add(c.bId);
    }
    return set;
  }, [conflictPairs]);

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  function eventsForDay(day: Date) {
    return scheduled
      .filter((t) => isSameDay(parseISO(t.scheduled_start_at), day))
      .sort(
        (a, b) =>
          new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime()
      );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">
            {view === "week" ? "Week view" : "Day agenda"} · {format(anchor, "MMM d, yyyy")}
          </p>
          <p className="text-xs opacity-60">Timezone: {timezoneLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setAnchor((d) => addDays(d, view === "week" ? -7 : -1))}
          >
            Previous
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAnchor(new Date())}>
            Today
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setAnchor((d) => addDays(d, view === "week" ? 7 : 1))}
          >
            Next
          </button>
          <button
            type="button"
            className={`btn btn-sm ${view === "week" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setView("week")}
          >
            Week
          </button>
          <button
            type="button"
            className={`btn btn-sm ${view === "day" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setView("day")}
          >
            Day
          </button>
        </div>
      </div>

      {(conflictPairs.length > 0 ||
        pastDeadline.length > 0 ||
        overloaded.length > 0 ||
        unscheduledCritical.length > 0) && (
        <div className="space-y-2">
          {conflictPairs.length > 0 ? (
            <div className="alert alert-warning text-sm" role="status">
              <span>
                ⚠ Overlapping assignments:{" "}
                {conflictPairs
                  .slice(0, 4)
                  .map((c) => `${c.aNumber} ↔ ${c.bNumber}`)
                  .join("; ")}
                {conflictPairs.length > 4 ? "…" : ""}
              </span>
            </div>
          ) : null}
          {pastDeadline.length > 0 ? (
            <div className="alert alert-error text-sm" role="alert">
              <span>
                ⚠ Scheduled after resolution deadline:{" "}
                {pastDeadline.map((t) => t.ticket_number).join(", ")}
              </span>
            </div>
          ) : null}
          {overloaded.length > 0 ? (
            <div className="alert alert-warning text-sm" role="status">
              <span>
                ⚠ Heavy schedule day(s):{" "}
                {overloaded.map((d) => `${d.day} (${d.count} visits)`).join(", ")}
              </span>
            </div>
          ) : null}
          {unscheduledCritical.length > 0 ? (
            <div className="alert alert-error text-sm" role="alert">
              <span>
                ⚠ Critical tickets not scheduled yet:{" "}
                {unscheduledCritical.map((t) => t.ticket_number).join(", ")}
              </span>
            </div>
          ) : null}
        </div>
      )}

      <div className={`grid gap-3 ${view === "week" ? "lg:grid-cols-7" : "grid-cols-1"}`}>
        {days.map((day) => {
          const events = eventsForDay(day);
          return (
            <div
              key={day.toISOString()}
              className="min-h-40 rounded-box border border-base-300 bg-base-100 p-2"
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">
                {format(day, view === "week" ? "EEE d" : "EEEE, MMM d")}
              </p>
              {events.length === 0 ? (
                <p className="text-xs opacity-50">No scheduled work</p>
              ) : (
                <ul className="space-y-2">
                  {events.map((t) => {
                    const sla = evaluateTicketSla(t);
                    const start = parseISO(t.scheduled_start_at);
                    const end = parseISO(eventEndIso(t));
                    const mins = Math.max(30, differenceInMinutes(end, start));
                    const critical = t.priority === "critical";
                    const border =
                      critical || sla.overdue
                        ? "border-error/50 bg-error/5"
                        : conflictIds.has(t.id)
                          ? "border-warning/50 bg-warning/5"
                          : "border-base-300";
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          className={`w-full rounded-box border p-2 text-left ${border}`}
                          onClick={() => setSelectedId(t.id)}
                        >
                          <p className="text-[11px] font-semibold tabular-nums">
                            {format(start, "h:mm a")}
                            {t.scheduled_end_at ? ` – ${format(end, "h:mm a")}` : ""}
                            <span className="ml-1 font-normal opacity-60">({mins}m)</span>
                          </p>
                          <p className="mt-0.5 text-xs font-medium">{t.customer_name}</p>
                          <p className="text-[11px] opacity-80">
                            {t.ticket_number} — {t.title}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {critical ? (
                              <span className="badge badge-error badge-xs">⚠ Critical</span>
                            ) : (
                              <StatusBadge status={t.priority} />
                            )}
                            <StatusBadge status={t.status} />
                            <span className="badge badge-ghost badge-xs">{modeLabel(t.service_mode)}</span>
                            {sla.overdue ? (
                              <span className="badge badge-error badge-xs">Overdue</span>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {scheduled.length === 0 ? (
        <p className="text-sm opacity-70">
          No visit times are scheduled on your tickets yet. Ask a manager to set start/end times when
          assigning work.
        </p>
      ) : null}

      {selected ? (
        <div className="rounded-box border border-primary/30 bg-base-100 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">
                {selected.ticket_number} · {selected.title}
              </p>
              <p className="text-xs opacity-70">{selected.customer_name}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>
          <TicketSlaAlerts ticket={selected} />
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="opacity-60">Priority / Status</dt>
              <dd className="flex flex-wrap gap-1">
                <StatusBadge status={selected.priority} />
                <StatusBadge status={selected.status} />
                <SlaConditionBadge condition={evaluateTicketSla(selected).overall} />
              </dd>
            </div>
            <div>
              <dt className="opacity-60">Contract</dt>
              <dd>{selected.contract_label ?? "—"}</dd>
            </div>
            <div>
              <dt className="opacity-60">Scheduled</dt>
              <dd>
                {selected.scheduled_start_at
                  ? `${formatDateTime(selected.scheduled_start_at)}${
                      selected.scheduled_end_at ? ` – ${formatDateTime(selected.scheduled_end_at)}` : ""
                    }`
                  : "Not scheduled"}
              </dd>
            </div>
            <div>
              <dt className="opacity-60">Location</dt>
              <dd>
                {modeLabel(selected.service_mode)}
                {selected.service_location ? ` · ${selected.service_location}` : ""}
              </dd>
            </div>
            <div>
              <dt className="opacity-60">Response deadline</dt>
              <dd>{formatDateTime(selected.target_response_at)}</dd>
            </div>
            <div>
              <dt className="opacity-60">Resolution deadline</dt>
              <dd>{formatDateTime(selected.target_resolution_at)}</dd>
            </div>
            {selected.schedule_notes ? (
              <div className="sm:col-span-2">
                <dt className="opacity-60">Schedule notes</dt>
                <dd className="whitespace-pre-wrap">{selected.schedule_notes}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/tickets/${selected.id}`} className="btn btn-primary btn-sm">
              Open Ticket
            </Link>
            <Link href={`/time-costs?ticket=${selected.id}`} className="btn btn-outline btn-sm">
              Record Time and Cost
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
