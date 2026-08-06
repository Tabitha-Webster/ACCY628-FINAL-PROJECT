"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  differenceInMinutes,
} from "date-fns";
import { StatusBadge } from "@/components/ui";
import { TicketSlaAlerts, SlaConditionBadge } from "@/components/SlaBadges";
import { ServiceModeBadge } from "@/components/ServiceModeBadge";
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

type ViewMode = "month" | "week" | "day";

export function TechnicianCalendar({ tickets, timezoneLabel }: Props) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [view, setView] = useState<ViewMode>("month");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const days = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "week") {
      const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    }
    const monthStart = startOfMonth(anchor);
    const monthEnd = endOfMonth(anchor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [anchor, view]);

  const weekdayLabels = useMemo(() => {
    const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "EEE"));
  }, [anchor]);

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

  function goPrevious() {
    setAnchor((d) => {
      if (view === "month") return addMonths(d, -1);
      if (view === "week") return addDays(d, -7);
      return addDays(d, -1);
    });
  }

  function goNext() {
    setAnchor((d) => {
      if (view === "month") return addMonths(d, 1);
      if (view === "week") return addDays(d, 7);
      return addDays(d, 1);
    });
  }

  const titleLabel =
    view === "month"
      ? `Month view · ${format(anchor, "MMMM yyyy")}`
      : view === "week"
        ? `Week view · ${format(startOfWeek(anchor, { weekStartsOn: 1 }), "MMM d")} – ${format(
            endOfWeek(anchor, { weekStartsOn: 1 }),
            "MMM d, yyyy"
          )}`
        : `Day view · ${format(anchor, "EEEE, MMM d, yyyy")}`;

  function renderEventCard(t: CalendarTicket & { scheduled_start_at: string }, compact: boolean) {
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

    if (compact) {
      const tone =
        critical || sla.overdue
          ? "bg-error/15 text-error"
          : conflictIds.has(t.id)
            ? "bg-warning/15"
            : "bg-primary/10 text-primary";
      return (
        <button
          type="button"
          className={`w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium ${tone}`}
          title={`${format(start, "h:mm a")} · ${t.ticket_number} · ${t.title}`}
          onClick={() => setSelectedId(t.id)}
        >
          {format(start, "h:mma")} {t.ticket_number}
        </button>
      );
    }

    return (
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
          <ServiceModeBadge
            mode={t.service_mode}
            location={null}
            showLocation={false}
            size="xs"
          />
          {sla.overdue ? <span className="badge badge-error badge-xs">Overdue</span> : null}
        </div>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">{titleLabel}</p>
          <p className="text-xs opacity-60">Timezone: {timezoneLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={goPrevious}>
            Previous
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={goNext}>
            Next
          </button>
          <button
            type="button"
            className={`btn btn-sm ${view === "month" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setView("month")}
          >
            Month
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

      {view === "month" ? (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <div className="grid grid-cols-7 border-b border-base-300 bg-base-200/50">
            {weekdayLabels.map((label) => (
              <div
                key={label}
                className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide opacity-70"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const events = eventsForDay(day);
              const inMonth = isSameMonth(day, anchor);
              const today = isToday(day);
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-24 border-b border-r border-base-300 p-1.5 ${
                    inMonth ? "bg-base-100" : "bg-base-200/30"
                  } ${today ? "ring-1 ring-inset ring-primary/40" : ""}`}
                >
                  <button
                    type="button"
                    className={`mb-1 text-xs font-semibold tabular-nums hover:underline ${
                      inMonth ? "" : "opacity-40"
                    } ${today ? "text-primary" : "opacity-70"}`}
                    onClick={() => {
                      setAnchor(day);
                      setView("day");
                    }}
                    title="Open day"
                  >
                    {format(day, "d")}
                  </button>
                  {events.length === 0 ? null : (
                    <ul className="space-y-1">
                      {events.slice(0, 3).map((t) => (
                        <li key={t.id}>{renderEventCard(t, true)}</li>
                      ))}
                      {events.length > 3 ? (
                        <li className="text-[10px] opacity-60">+{events.length - 3} more</li>
                      ) : null}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={`grid gap-3 ${view === "week" ? "lg:grid-cols-7" : "grid-cols-1"}`}>
          {days.map((day) => {
            const events = eventsForDay(day);
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className={`min-h-40 rounded-box border bg-base-100 p-2 ${
                  today ? "border-primary/50 ring-1 ring-primary/30" : "border-base-300"
                }`}
              >
                <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${today ? "text-primary" : "opacity-70"}`}>
                  {format(day, view === "week" ? "EEE d" : "EEEE, MMM d")}
                  {today ? " · Today" : ""}
                </p>
                {events.length === 0 ? (
                  <p className="text-xs opacity-50">No scheduled work</p>
                ) : (
                  <ul className="space-y-2">
                    {events.map((t) => (
                      <li key={t.id}>{renderEventCard(t, false)}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

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
              <dt className="opacity-60">Job type / location</dt>
              <dd>
                <ServiceModeBadge mode={selected.service_mode} location={selected.service_location} />
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
          <div className="mt-3">
            <Link href={`/tickets/${selected.id}`} className="btn btn-primary btn-sm">
              Open ticket
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
