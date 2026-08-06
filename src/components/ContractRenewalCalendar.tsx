"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { reminderKindLabel, type CalendarEvent } from "@/lib/contracts";

type Props = {
  events: CalendarEvent[];
};

function eventTone(event: CalendarEvent) {
  if (event.kind === "expiration") return "badge-error";
  if (event.kind === "renewal") return "badge-warning";
  if (event.reminderKind === "renewal_90") return "badge-ghost";
  if (event.reminderKind === "renewal_60") return "badge-info";
  if (event.reminderKind === "renewal_30" || event.reminderKind === "expiration_warning") {
    return "badge-warning";
  }
  return "badge-neutral";
}

function eventTypeLabel(event: CalendarEvent) {
  if (event.kind === "reminder" && event.reminderKind) {
    return reminderKindLabel(event.reminderKind as never);
  }
  if (event.kind === "expiration") return "Expiration";
  return "Renewal";
}

export function ContractRenewalCalendar({ events }: Props) {
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = event.date.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const selectedKey = selectedDate ?? format(new Date(), "yyyy-MM-dd");
  const selectedEvents = eventsByDay.get(selectedKey) ?? [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Renewal calendar
          </h2>
          <p className="text-sm opacity-70">
            End dates, renewal decisions, and open 90 / 60 / 30-day reminders.
          </p>
        </div>
        <span className="badge badge-sm badge-ghost">{events.length} events</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-box border border-base-300 bg-base-100 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              onClick={() => setAnchor((d) => addMonths(d, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h3 className="text-base font-semibold">{format(anchor, "MMMM yyyy")}</h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              onClick={() => setAnchor((d) => addMonths(d, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium opacity-60">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, anchor);
              const selected =
                selectedDate === key || (!selectedDate && isSameDay(day, new Date()));
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={`min-h-[4.5rem] rounded-lg border p-1 text-left transition-colors ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-base-300 hover:bg-base-200"
                  } ${inMonth ? "" : "opacity-40"}`}
                >
                  <div className="text-xs font-semibold tabular-nums">{format(day, "d")}</div>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        className={`badge badge-xs h-auto max-w-full truncate whitespace-nowrap px-1 ${eventTone(event)}`}
                        title={event.label}
                      >
                        {event.contractNumber}
                      </div>
                    ))}
                    {dayEvents.length > 2 ? (
                      <div className="text-[0.65rem] opacity-50">+{dayEvents.length - 2} more</div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="badge badge-error badge-sm">Expiration</span>
            <span className="badge badge-warning badge-sm">Renewal</span>
            <span className="badge badge-info badge-sm">60-day reminder</span>
            <span className="badge badge-ghost badge-sm">90-day reminder</span>
          </div>
        </div>

        <div className="rounded-box border border-base-300 bg-base-100 p-4 space-y-3">
          <h3 className="text-sm font-semibold">
            {format(new Date(`${selectedKey}T12:00:00`), "EEEE, MMM d, yyyy")}
          </h3>
          {selectedEvents.length === 0 ? (
            <p className="text-sm opacity-60">
              No renewals, expirations, or reminders on this day.
            </p>
          ) : (
            <ul className="space-y-2">
              {selectedEvents.map((event) => (
                <li key={event.id} className="rounded-lg border border-base-300 p-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge badge-sm ${eventTone(event)}`}>
                      {eventTypeLabel(event)}
                    </span>
                    <Link
                      href={`/contracts/${event.contractId}`}
                      className="link link-hover font-medium text-sm"
                    >
                      {event.contractNumber}
                    </Link>
                  </div>
                  <p className="text-sm">{event.label}</p>
                  {event.customerName ? (
                    <p className="text-xs opacity-60">{event.customerName}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
