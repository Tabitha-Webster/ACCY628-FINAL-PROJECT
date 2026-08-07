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
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { reminderKindLabel, type CalendarEvent } from "@/lib/contracts";

type Props = {
  events: CalendarEvent[];
  /** Large layout for Renewal & Expiration; default is compact dashboard style. */
  variant?: "default" | "large";
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

function eventDotClass(event: CalendarEvent) {
  if (event.kind === "expiration") return "bg-error";
  if (event.kind === "renewal") return "bg-warning";
  if (event.reminderKind === "renewal_60") return "bg-info";
  if (event.reminderKind === "renewal_30" || event.reminderKind === "expiration_warning") {
    return "bg-warning";
  }
  return "bg-base-content/40";
}

function eventTypeLabel(event: CalendarEvent) {
  if (event.kind === "reminder" && event.reminderKind) {
    return reminderKindLabel(event.reminderKind as never);
  }
  if (event.kind === "expiration") return "Expiration";
  return "Renewal";
}

function renewHref(contractId: string) {
  return `/contracts/${contractId}#renewal-expiration`;
}

export function ContractRenewalCalendar({ events, variant = "default" }: Props) {
  const large = variant === "large";
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
  const chipLimit = large ? 3 : 2;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            className={
              large
                ? "text-base font-semibold tracking-tight"
                : "text-sm font-semibold uppercase tracking-wide opacity-60"
            }
          >
            Renewal &amp; expiration calendar
          </h2>
          <p className={`opacity-70 ${large ? "mt-1 text-sm" : "text-sm"}`}>
            Click a contract chip or use Renew contract to open that agreement&apos;s renewal
            panel. End dates, renewal decisions, and 90 / 60 / 30-day reminders are shown here.
          </p>
        </div>
        <span className="badge badge-sm badge-ghost">{events.length} events</span>
      </div>

      <div className={large ? "grid gap-4 xl:grid-cols-[1.75fr_1fr]" : "grid gap-4 lg:grid-cols-[1.4fr_1fr]"}>
        <div
          className={`rounded-box border border-base-300 bg-base-100 space-y-3 ${
            large ? "p-5 shadow-sm" : "p-4"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className={`btn btn-ghost btn-square ${large ? "btn-md" : "btn-sm"}`}
              onClick={() => setAnchor((d) => addMonths(d, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft className={large ? "h-5 w-5" : "h-4 w-4"} />
            </button>
            <h3 className={large ? "text-xl font-semibold tracking-tight" : "text-base font-semibold"}>
              {format(anchor, "MMMM yyyy")}
            </h3>
            <button
              type="button"
              className={`btn btn-ghost btn-square ${large ? "btn-md" : "btn-sm"}`}
              onClick={() => setAnchor((d) => addMonths(d, 1))}
              aria-label="Next month"
            >
              <ChevronRight className={large ? "h-5 w-5" : "h-4 w-4"} />
            </button>
          </div>

          <div
            className={`grid grid-cols-7 gap-1 text-center font-medium opacity-60 ${
              large ? "text-sm" : "text-xs"
            }`}
          >
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className={`grid grid-cols-7 ${large ? "gap-1.5" : "gap-1"}`}>
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, anchor);
              const selected =
                selectedDate === key || (!selectedDate && isSameDay(day, new Date()));
              const today = isToday(day);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={`rounded-lg border p-1.5 text-left transition-colors ${
                    large ? "min-h-[6.75rem] sm:min-h-[7.5rem]" : "min-h-[4.5rem]"
                  } ${
                    selected
                      ? "border-primary bg-primary/10"
                      : today
                        ? "border-primary/40 bg-base-200/40 hover:bg-base-200"
                        : "border-base-300 hover:bg-base-200"
                  } ${inMonth ? "" : "opacity-40"}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`font-semibold tabular-nums ${
                        large ? "text-sm" : "text-xs"
                      } ${today ? "text-primary" : ""}`}
                    >
                      {format(day, "d")}
                    </span>
                    {dayEvents.length > 0 ? (
                      <span className="flex gap-0.5">
                        {dayEvents.slice(0, 3).map((event) => (
                          <span
                            key={event.id}
                            className={`size-1.5 rounded-full ${eventDotClass(event)}`}
                          />
                        ))}
                      </span>
                    ) : null}
                  </div>
                  <div className={`mt-1 space-y-0.5 ${large ? "mt-1.5" : ""}`}>
                    {dayEvents.slice(0, chipLimit).map((event) => (
                      <Link
                        key={event.id}
                        href={renewHref(event.contractId)}
                        onClick={(e) => e.stopPropagation()}
                        className={`badge badge-xs h-auto max-w-full truncate whitespace-nowrap px-1 hover:brightness-95 ${eventTone(event)}`}
                        title={`Open renewal for ${event.contractNumber}`}
                      >
                        {event.contractNumber}
                      </Link>
                    ))}
                    {dayEvents.length > chipLimit ? (
                      <div className={`opacity-50 ${large ? "text-xs" : "text-[0.65rem]"}`}>
                        +{dayEvents.length - chipLimit} more
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className={`flex flex-wrap gap-2 ${large ? "text-sm" : "text-xs"}`}>
            <span className="badge badge-error badge-sm">Expiration / end date</span>
            <span className="badge badge-warning badge-sm">Renewal decision</span>
            <span className="badge badge-info badge-sm">60-day reminder</span>
            <span className="badge badge-ghost badge-sm">90-day reminder</span>
          </div>
        </div>

        <div
          className={`rounded-box border border-base-300 bg-base-100 space-y-3 ${
            large ? "p-5 shadow-sm" : "p-4"
          }`}
        >
          <h3 className={large ? "text-base font-semibold" : "text-sm font-semibold"}>
            {format(new Date(`${selectedKey}T12:00:00`), "EEEE, MMM d, yyyy")}
          </h3>
          {selectedEvents.length === 0 ? (
            <p className="text-sm opacity-60">
              No renewals, expirations, or reminders on this day.
            </p>
          ) : (
            <ul className={`space-y-2 ${large ? "max-h-[28rem] overflow-y-auto pr-1" : ""}`}>
              {selectedEvents.map((event) => (
                <li key={event.id} className="rounded-lg border border-base-300 p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge badge-sm ${eventTone(event)}`}>
                      {eventTypeLabel(event)}
                    </span>
                    <Link
                      href={renewHref(event.contractId)}
                      className="link link-hover font-medium text-sm"
                    >
                      {event.contractNumber}
                    </Link>
                  </div>
                  <p className="text-sm">{event.label}</p>
                  {event.customerName ? (
                    <p className="text-xs opacity-60">{event.customerName}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link
                      href={renewHref(event.contractId)}
                      className={`btn btn-primary ${large ? "btn-sm" : "btn-xs"}`}
                    >
                      Renew contract
                    </Link>
                    <Link
                      href={`/contracts/${event.contractId}`}
                      className={`btn btn-ghost ${large ? "btn-sm" : "btn-xs"}`}
                    >
                      View details
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
