"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ExternalLink } from "lucide-react";
import { EmptyState, StatusBadge } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ControlFailure } from "@/lib/control-failures";

type Props = {
  failures: ControlFailure[];
  /** Soft-cap notices when exception scans could not load every matching row. */
  truncationNotes?: string[];
};

type DayPoint = {
  dateKey: string;
  dateLabel: string;
  critical: number;
  warning: number;
  total: number;
};

const CRITICAL_FILL = "#ef4444";
const WARNING_FILL = "#eab308";

function toDateKey(iso: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function detectedLabel(iso: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatDate(iso);
  return formatDateTime(iso);
}

function shortAxisLabel(dateKey: string) {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

/** Vertical bar chart of control failures by date; click a bar for when and why. */
export function ControlFailuresChart({ failures, truncationNotes = [] }: Props) {
  const [severity, setSeverity] = useState<"all" | ControlFailure["severity"]>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (severity === "all") return failures;
    return failures.filter((row) => row.severity === severity);
  }, [failures, severity]);

  const byDate = useMemo(() => {
    const map = new Map<string, ControlFailure[]>();
    for (const row of filtered) {
      const key = toDateKey(row.detectedAt);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
        return a.controlName.localeCompare(b.controlName);
      });
    }
    return map;
  }, [filtered]);

  const chartData = useMemo((): DayPoint[] => {
    return [...byDate.keys()]
      .sort()
      .map((dateKey) => {
        const rows = byDate.get(dateKey) ?? [];
        const critical = rows.filter((r) => r.severity === "critical").length;
        const warning = rows.filter((r) => r.severity === "warning").length;
        return {
          dateKey,
          dateLabel: shortAxisLabel(dateKey),
          critical,
          warning,
          total: rows.length,
        };
      });
  }, [byDate]);

  // Derive a valid selection from current filter data (no effect setState).
  const activeDate = selectedDate && byDate.has(selectedDate) ? selectedDate : null;
  const dayFailures = activeDate ? byDate.get(activeDate) ?? [] : [];
  const activeId =
    activeDate == null
      ? null
      : selectedId && dayFailures.some((row) => row.id === selectedId)
        ? selectedId
        : dayFailures.length === 1
          ? dayFailures[0].id
          : null;
  const selected = activeId ? dayFailures.find((row) => row.id === activeId) ?? null : null;

  function selectDay(dateKey: string | null) {
    if (!dateKey) {
      setSelectedDate(null);
      setSelectedId(null);
      return;
    }
    const rows = byDate.get(dateKey) ?? [];
    setSelectedDate(dateKey);
    setSelectedId(rows.length === 1 ? rows[0].id : null);
  }

  const criticalCount = failures.filter((f) => f.severity === "critical").length;
  const warningCount = failures.filter((f) => f.severity === "warning").length;
  const yMax = Math.max(1, ...chartData.map((d) => d.total));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Control exceptions
          </h2>
          <p className="mt-1 text-sm opacity-70">
            Failures by date detected. Click a bar to see which control failed, when, and the
            probable cause.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`btn btn-sm ${severity === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setSeverity("all");
              selectDay(null);
            }}
          >
            All ({failures.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${severity === "critical" ? "btn-error" : "btn-ghost"}`}
            onClick={() => {
              setSeverity("critical");
              selectDay(null);
            }}
          >
            Critical ({criticalCount})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${severity === "warning" ? "btn-warning" : "btn-ghost"}`}
            onClick={() => {
              setSeverity("warning");
              selectDay(null);
            }}
          >
            Warning ({warningCount})
          </button>
        </div>
      </div>

      {truncationNotes.length > 0 ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          Exception counts may be incomplete — scan capped for{" "}
          {truncationNotes.join("; ")}.
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title={failures.length === 0 ? "No control exceptions right now" : "No rows for this filter"}
          description={
            failures.length === 0
              ? "Active contracts, approvals, SLA, and billing checks look clean."
              : "Try All, Critical, or Warning."
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="rounded-box border border-base-300 bg-base-100 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-4 text-xs opacity-70">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: CRITICAL_FILL }}
                />
                Critical
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: WARNING_FILL }}
                />
                Warning
              </span>
              <span className="opacity-50">Bar height = failures that day</span>
            </div>
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                  <XAxis
                    dataKey="dateLabel"
                    fontSize={12}
                    tickLine={false}
                    interval="preserveStartEnd"
                    label={{
                      value: "Date detected",
                      position: "insideBottom",
                      offset: -4,
                      fontSize: 11,
                      fill: "currentColor",
                      opacity: 0.55,
                    }}
                  />
                  <YAxis
                    allowDecimals={false}
                    fontSize={12}
                    width={36}
                    domain={[0, yMax]}
                  />
                  <Tooltip
                    cursor={{ opacity: 0.08 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const point = payload[0]?.payload as DayPoint | undefined;
                      if (!point) return null;
                      return (
                        <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-xs shadow-md">
                          <p className="font-semibold">{formatDate(point.dateKey)}</p>
                          <p className="mt-1">
                            {point.total} failure{point.total === 1 ? "" : "s"}
                            {point.critical ? ` · ${point.critical} critical` : ""}
                            {point.warning ? ` · ${point.warning} warning` : ""}
                          </p>
                          <p className="mt-1 opacity-50">Click bar for details</p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="critical"
                    name="Critical"
                    stackId="failures"
                    fill={CRITICAL_FILL}
                    maxBarSize={56}
                    cursor="pointer"
                    onClick={(data) => {
                      const point = data as unknown as DayPoint;
                      if (!point?.dateKey) return;
                      selectDay(activeDate === point.dateKey ? null : point.dateKey);
                    }}
                  />
                  <Bar
                    dataKey="warning"
                    name="Warning"
                    stackId="failures"
                    fill={WARNING_FILL}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={56}
                    cursor="pointer"
                    onClick={(data) => {
                      const point = data as unknown as DayPoint;
                      if (!point?.dateKey) return;
                      selectDay(activeDate === point.dateKey ? null : point.dateKey);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {activeDate ? (
            <div className="space-y-3 rounded-box border border-base-300 bg-base-100 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-60">
                  Failures on {formatDate(activeDate)}
                </p>
                <p className="mt-1 text-sm opacity-70">
                  {dayFailures.length} control failure{dayFailures.length === 1 ? "" : "s"} — select
                  one for cause and fix link.
                </p>
              </div>

              <ul className="space-y-2">
                {dayFailures.map((row) => {
                  const isActive = activeId === row.id;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          isActive
                            ? "border-primary bg-primary/5"
                            : "border-base-300 bg-base-200/30 hover:bg-base-200/70"
                        }`}
                        onClick={() => setSelectedId(row.id)}
                      >
                        <StatusBadge
                          status={row.severity}
                          label={row.severity === "critical" ? "Critical" : "Warning"}
                          className="badge-sm mt-0.5 h-auto whitespace-normal px-2 py-1 text-[0.7rem] font-medium"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{row.controlName}</span>
                          <span className="mt-0.5 block text-xs opacity-70 line-clamp-2">
                            {row.summary}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {selected ? (
                <div className="space-y-3 border-t border-base-300 pt-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-base-300 bg-base-200/40 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">
                        When it failed
                      </p>
                      <p className="text-sm">{detectedLabel(selected.detectedAt)}</p>
                    </div>
                    <div className="rounded-lg border border-base-300 bg-base-200/40 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">
                        What failed
                      </p>
                      <p className="text-sm font-medium">{selected.summary}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-warning/25 bg-warning/5 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning">
                      Probable cause
                    </p>
                    <p className="text-sm leading-relaxed">{selected.probableCause}</p>
                  </div>
                  <div className="rounded-lg border border-base-300 bg-base-200/40 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">
                      Exception detail
                    </p>
                    <p className="text-sm leading-relaxed">{selected.detail}</p>
                  </div>
                  <Link href={selected.href} className="btn btn-primary btn-sm gap-1.5">
                    {selected.hrefLabel}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm opacity-60">Click a bar to inspect failures for that date.</p>
          )}
        </div>
      )}
    </section>
  );
}
