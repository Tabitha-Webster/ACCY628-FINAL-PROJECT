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
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DollarSign,
  ShieldCheck,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency, formatDate, statusLabel } from "@/lib/format";
import { reminderKindLabel, type CalendarEvent, type ContractReportMetrics } from "@/lib/contracts";

type MetricTone = "sky" | "violet" | "amber" | "rose" | "emerald";

const TONE_STYLES: Record<MetricTone, { card: string; icon: string; value: string }> = {
  sky: {
    card: "border-sky-300/60 bg-gradient-to-br from-sky-50 to-sky-100/80 dark:from-sky-950/50 dark:to-sky-900/30 dark:border-sky-700/50",
    icon: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    value: "text-sky-900 dark:text-sky-100",
  },
  violet: {
    card: "border-violet-300/60 bg-gradient-to-br from-violet-50 to-violet-100/80 dark:from-violet-950/50 dark:to-violet-900/30 dark:border-violet-700/50",
    icon: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    value: "text-violet-900 dark:text-violet-100",
  },
  amber: {
    card: "border-amber-300/60 bg-gradient-to-br from-amber-50 to-amber-100/80 dark:from-amber-950/40 dark:to-amber-900/25 dark:border-amber-700/50",
    icon: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    value: "text-amber-950 dark:text-amber-100",
  },
  rose: {
    card: "border-rose-300/70 bg-gradient-to-br from-rose-50 to-rose-100/90 dark:from-rose-950/50 dark:to-rose-900/30 dark:border-rose-700/50",
    icon: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    value: "text-rose-900 dark:text-rose-100",
  },
  emerald: {
    card: "border-emerald-300/60 bg-gradient-to-br from-emerald-50 to-emerald-100/80 dark:from-emerald-950/50 dark:to-emerald-900/30 dark:border-emerald-700/50",
    icon: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    value: "text-emerald-900 dark:text-emerald-100",
  },
};

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  draft: "#94a3b8",
  pending_approval: "#f59e0b",
  on_hold: "#a855f7",
  expired: "#ef4444",
  canceled: "#64748b",
  renewed: "#38bdf8",
};

function usageBarColor(usage: "normal" | "warning" | "over_limit") {
  if (usage === "over_limit") return "bg-rose-500";
  if (usage === "warning") return "bg-amber-400";
  return "bg-emerald-500";
}

function eventDotClass(event: CalendarEvent) {
  if (event.kind === "expiration") return "bg-rose-500";
  if (event.kind === "renewal") return "bg-amber-400";
  return "bg-sky-400";
}

function eventTypeLabel(event: CalendarEvent) {
  if (event.kind === "reminder" && event.reminderKind) {
    return reminderKindLabel(event.reminderKind as never);
  }
  if (event.kind === "expiration") return "Expiration";
  return "Renewal";
}

type ActionLink = { href: string; label: string };

/** One-viewport Contracts Dashboard styled like Customer Home / Executive. */
export function ContractsDashboardVisuals({
  metrics,
  calendarEvents,
  actions = [],
}: {
  metrics: ContractReportMetrics;
  calendarEvents: CalendarEvent[];
  actions?: ActionLink[];
}) {
  const atRisk = metrics.expiringContracts + metrics.renewalsDue;
  const statusSlices = Object.entries(metrics.byStatus)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({ status, count, label: statusLabel(status) }));
  const statusTotal = statusSlices.reduce((sum, row) => sum + row.count, 0);

  const metricTiles: Array<{
    label: string;
    value: string;
    href?: string;
    tone: MetricTone;
    hint?: string;
    icon: "dollar" | "alert" | "shield" | "clock";
  }> = [
    {
      label: "MRR",
      value: formatCurrency(metrics.monthlyRecurringRevenue),
      href: "/contracts?status=active",
      tone: "sky",
      hint: `≈ ${formatCurrency(metrics.annualContractValue)} ACV`,
      icon: "dollar",
    },
    {
      label: "At risk",
      value: String(atRisk),
      href: "/contracts/renewals",
      tone: atRisk > 0 ? "amber" : "emerald",
      hint: `${metrics.expiringContracts} expiring · ${metrics.renewalsDue} renewals`,
      icon: "alert",
    },
    {
      label: "Delivery",
      value: metrics.slaCompliancePct == null ? "—" : `${metrics.slaCompliancePct.toFixed(0)}%`,
      href: "/operations",
      tone:
        metrics.slaCompliancePct == null
          ? "violet"
          : metrics.slaCompliancePct >= 90
            ? "emerald"
            : metrics.slaCompliancePct >= 75
              ? "amber"
              : "rose",
      hint: "Ticket & project completion",
      icon: "shield",
    },
    {
      label: "Over hours",
      value: String(metrics.contractsOverHours),
      href: "/contracts",
      tone:
        metrics.contractsOverHours > 0
          ? "rose"
          : metrics.contractsNearHours > 0
            ? "amber"
            : "emerald",
      hint:
        metrics.supportHoursUtilizationPct == null
          ? `${metrics.contractsNearHours} near limit`
          : `${metrics.supportHoursUtilizationPct.toFixed(0)}% used · ${metrics.contractsNearHours} near`,
      icon: "clock",
    },
  ];

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-hidden lg:h-[calc(100vh-7.5rem)]">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Contracts Dashboard</h1>
          <div className="flex flex-wrap gap-1.5">
            {actions.map((action) => (
              <Link key={action.href + action.label} href={action.href} className="btn btn-ghost btn-xs">
                {action.label}
              </Link>
            ))}
          </div>
        </div>
        <Link
          href="/contracts/renewals"
          className={
            atRisk > 0
              ? "relative block min-w-[10.5rem] max-w-[13rem] overflow-hidden rounded-2xl border border-amber-400/50 bg-gradient-to-br from-amber-500 to-amber-600 px-3 py-2.5 text-right text-white shadow-md shadow-amber-500/25 transition hover:brightness-110"
              : "relative block min-w-[10.5rem] max-w-[13rem] overflow-hidden rounded-2xl border border-emerald-400/50 bg-gradient-to-br from-emerald-500 to-emerald-600 px-3 py-2.5 text-right text-white shadow-md shadow-emerald-500/25 transition hover:brightness-110"
          }
        >
          <div className="pointer-events-none absolute -right-4 -top-4 size-16 rounded-full bg-white/15" />
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/90">
            Renewals &amp; expirations
          </p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums leading-none">{atRisk}</p>
          <p className="mt-1 text-[10px] leading-snug text-white/85">
            {atRisk > 0 ? "Tap to review queue" : "Nothing due in 90 days"}
          </p>
        </Link>
      </div>

      <div className="grid shrink-0 gap-3 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-7">
          {metricTiles.map((metric) => {
            const tone = TONE_STYLES[metric.tone];
            const Icon =
              metric.icon === "dollar"
                ? DollarSign
                : metric.icon === "alert"
                  ? AlertTriangle
                  : metric.icon === "shield"
                    ? ShieldCheck
                    : Clock3;
            const body = (
              <>
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[10px] font-semibold uppercase leading-tight tracking-wide opacity-70 line-clamp-2">
                    {metric.label}
                  </p>
                  <span className={`shrink-0 rounded-lg p-1.5 ${tone.icon}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </div>
                <p
                  className={`mt-1 min-w-0 truncate text-lg font-semibold tabular-nums leading-tight sm:text-xl ${tone.value}`}
                  title={metric.value}
                >
                  {metric.value}
                </p>
                {metric.hint ? (
                  <p className="mt-0.5 min-w-0 text-[10px] leading-snug opacity-60 line-clamp-2" title={metric.hint}>
                    {metric.hint}
                  </p>
                ) : null}
              </>
            );
            const classes = `flex min-h-[5.75rem] min-w-0 flex-col overflow-hidden rounded-2xl border p-3 shadow-sm ${tone.card}`;
            return metric.href ? (
              <Link key={metric.label} href={metric.href} className={`${classes} transition hover:brightness-[0.98]`}>
                {body}
              </Link>
            ) : (
              <div key={metric.label} className={classes}>
                {body}
              </div>
            );
          })}
        </div>

        <div className="min-h-[10.5rem] rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm lg:col-span-5">
          <p className="mb-1 text-xs font-semibold">Contracts by status</p>
          {statusTotal === 0 ? (
            <div className="flex h-36 items-center justify-center text-sm opacity-60">No contracts yet.</div>
          ) : (
            <div className="grid h-[9.5rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <div className="relative mx-auto h-36 w-full max-w-[11rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusSlices}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius="58%"
                      outerRadius="88%"
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {statusSlices.map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [
                        `${Number(value ?? 0)} contract${Number(value ?? 0) === 1 ? "" : "s"}`,
                        String(name ?? ""),
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-lg font-semibold tabular-nums">{statusTotal}</p>
                  <p className="text-[10px] opacity-60">Total</p>
                </div>
              </div>
              <ul className="max-h-36 min-w-0 space-y-1 overflow-hidden pr-1 text-[10px]">
                {statusSlices.map((row) => (
                  <li key={row.status} className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[row.status] ?? "#94a3b8" }}
                    />
                    <Link
                      href={`/contracts?status=${row.status}`}
                      className="min-w-0 flex-1 truncate leading-tight hover:underline"
                      title={row.label}
                    >
                      {row.label}
                    </Link>
                    <span className="shrink-0 tabular-nums opacity-70">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-3">
        <CompactRenewalCalendar events={calendarEvents} />

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-rose-200/80 bg-gradient-to-b from-rose-50/80 to-base-100 dark:border-rose-800/50 dark:from-rose-950/40">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-rose-200/70 px-3 py-2 dark:border-rose-800/60">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-rose-900/80 dark:text-rose-200">
              Expiring &amp; renewals
            </h2>
            <Link href="/contracts/renewals" className="text-[10px] font-medium text-rose-700 hover:underline dark:text-rose-300">
              Open queue
            </Link>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-3">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
                Expiring ({metrics.expiringContracts})
              </p>
              {metrics.expiringList.length === 0 ? (
                <p className="text-xs opacity-60">None in the next 90 days.</p>
              ) : (
                metrics.expiringList.slice(0, 3).map((row) => (
                  <Link
                    key={`exp-${row.id}`}
                    href={`/contracts/${row.id}`}
                    className="block rounded-xl border border-rose-100 bg-white/80 px-2.5 py-1.5 shadow-sm transition hover:border-rose-300 dark:border-rose-900 dark:bg-base-200/60"
                  >
                    <span className="block truncate text-xs font-semibold">{row.contract_number}</span>
                    <span className="block truncate text-[11px] opacity-70">{row.name}</span>
                    <span className="text-[10px] opacity-60">
                      {formatDate(row.end_date)}
                      {row.daysUntilEnd != null ? ` · ${row.daysUntilEnd}d` : ""}
                    </span>
                  </Link>
                ))
              )}
            </div>
            <div className="space-y-1.5 border-t border-rose-200/60 pt-2 dark:border-rose-800/50">
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
                Renewals due ({metrics.renewalsDue})
              </p>
              {metrics.renewalsList.length === 0 ? (
                <p className="text-xs opacity-60">No renewals due soon.</p>
              ) : (
                metrics.renewalsList.slice(0, 3).map((row) => (
                  <Link
                    key={`ren-${row.id}`}
                    href={`/contracts/${row.id}`}
                    className="block rounded-xl border border-amber-100 bg-white/80 px-2.5 py-1.5 shadow-sm transition hover:border-amber-300 dark:border-amber-900 dark:bg-base-200/60"
                  >
                    <span className="block truncate text-xs font-semibold">{row.contract_number}</span>
                    <span className="text-[10px] opacity-60">
                      {formatDate(row.end_date)}
                      {row.daysUntilRenewal != null ? ` · ${row.daysUntilRenewal}d` : ""} ·{" "}
                      {statusLabel(String(row.renewal_type ?? "none"))}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/80 to-base-100 dark:border-emerald-800/50 dark:from-emerald-950/40">
          <h2 className="shrink-0 border-b border-emerald-200/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-900/80 dark:border-emerald-800/60 dark:text-emerald-200">
            Support hours this month
          </h2>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden p-3">
            {metrics.utilizationList.length === 0 ? (
              <p className="text-sm opacity-60">No active contracts with hour pools.</p>
            ) : (
              metrics.utilizationList.slice(0, 5).map((row) => {
                const width = Math.min(100, Math.max(4, row.utilizationPct));
                return (
                  <Link
                    key={row.id}
                    href={`/contracts/${row.id}`}
                    className="block space-y-1 rounded-xl p-1 hover:bg-emerald-100/40 dark:hover:bg-emerald-900/30"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium">{row.contract_number}</span>
                      <span className="shrink-0 tabular-nums opacity-70">
                        {row.hoursUsed.toFixed(0)}/{Number(row.included_hours_per_month).toFixed(0)}h
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-emerald-900/10 dark:bg-emerald-100/10">
                      <div
                        className={`h-full rounded-full ${usageBarColor(row.usage)}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <p className="text-[10px] opacity-60">{row.utilizationPct.toFixed(0)}% utilized</p>
                  </Link>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function CompactRenewalCalendar({ events }: { events: CalendarEvent[] }) {
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
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50/80 to-base-100 dark:border-violet-800/50 dark:from-violet-950/40">
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-violet-200/70 px-2 py-1.5 dark:border-violet-800/60">
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          onClick={() => setAnchor((d) => addMonths(d, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-violet-900/80 dark:text-violet-200">
          {format(anchor, "MMM yyyy")}
        </h2>
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          onClick={() => setAnchor((d) => addMonths(d, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-2">
        <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-medium opacity-60">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={`${d}-${i}`} className="py-0.5">
              {d}
            </div>
          ))}
        </div>
        <div className="mt-0.5 grid grid-cols-7 gap-0.5">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(key) ?? [];
            const inMonth = isSameMonth(day, anchor);
            const selected = selectedDate === key || (!selectedDate && isSameDay(day, new Date()));
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDate(key)}
                className={`flex min-h-[1.65rem] flex-col items-center rounded-md border px-0.5 py-0.5 text-[10px] leading-none transition-colors ${
                  selected
                    ? "border-primary bg-primary/15"
                    : "border-transparent hover:bg-violet-100/70 dark:hover:bg-violet-900/40"
                } ${inMonth ? "" : "opacity-35"}`}
              >
                <span className="font-semibold tabular-nums">{format(day, "d")}</span>
                {dayEvents.length > 0 ? (
                  <span className="mt-0.5 flex gap-0.5">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span key={event.id} className={`size-1 rounded-full ${eventDotClass(event)}`} />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-2 max-h-[4.5rem] space-y-1 overflow-hidden border-t border-violet-200/60 pt-2 dark:border-violet-800/50">
          {selectedEvents.length === 0 ? (
            <p className="text-[11px] opacity-60">No events on {format(new Date(`${selectedKey}T12:00:00`), "MMM d")}.</p>
          ) : (
            selectedEvents.slice(0, 3).map((event) => (
              <Link
                key={event.id}
                href={`/contracts/${event.contractId}`}
                className="block truncate text-[11px] hover:underline"
              >
                <span className="font-semibold">{event.contractNumber}</span>
                <span className="opacity-60"> · {eventTypeLabel(event)}</span>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
