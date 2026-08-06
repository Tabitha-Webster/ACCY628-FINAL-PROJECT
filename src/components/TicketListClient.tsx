"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Flame,
  Inbox,
  Timer,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState, StatusBadge } from "@/components/ui";
import { TicketSlaAlerts } from "@/components/SlaBadges";
import { serviceModeLabel } from "@/components/ServiceModeBadge";
import { formatDateTime, statusLabel } from "@/lib/format";
import { evaluateTicketSla, slaConditionLabel, type SlaCondition } from "@/lib/sla";
import type { UserRole } from "@/lib/constants";

export type TicketListItem = {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  customer_id: string;
  customer_name: string;
  contract_id: string | null;
  contract_label: string | null;
  priority: string;
  service_category: string | null;
  status: string;
  assigned_technician_id: string | null;
  assigned_technician_name: string | null;
  submitted_at: string;
  target_response_at: string | null;
  target_resolution_at: string | null;
  actual_response_at: string | null;
  completed_at: string | null;
  service_mode: string | null;
  service_location: string | null;
};

type FilterOption = { id: string; name: string };

type Props = {
  tickets: TicketListItem[];
  role: UserRole;
  customers: FilterOption[];
  technicians: FilterOption[];
  categories: string[];
  initialPriority?: string;
  title?: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
};

const STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_approval",
  "resolved",
  "closed",
  "canceled",
] as const;

const PRIORITIES = ["low", "medium", "high", "critical"] as const;

const OPEN_STATUSES = new Set([
  "new",
  "assigned",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_approval",
]);

const TONE_STYLES = {
  sky: {
    card: "border-sky-400/30 bg-sky-500/10 text-base-content",
    icon: "bg-sky-500/20 text-sky-300",
    value: "text-base-content",
  },
  violet: {
    card: "border-violet-400/30 bg-violet-500/10 text-base-content",
    icon: "bg-violet-500/20 text-violet-300",
    value: "text-base-content",
  },
  amber: {
    card: "border-amber-400/30 bg-amber-500/10 text-base-content",
    icon: "bg-amber-500/20 text-amber-300",
    value: "text-base-content",
  },
  rose: {
    card: "border-rose-400/30 bg-rose-500/10 text-base-content",
    icon: "bg-rose-500/20 text-rose-300",
    value: "text-base-content",
  },
  emerald: {
    card: "border-emerald-400/30 bg-emerald-500/10 text-base-content",
    icon: "bg-emerald-500/20 text-emerald-300",
    value: "text-base-content",
  },
} as const;

const PRIORITY_COLORS = {
  Critical: "#f43f5e",
  High: "#f97316",
  Medium: "#f59e0b",
  Low: "#0ea5e9",
} as const;

function liveSla(ticket: TicketListItem) {
  return evaluateTicketSla(ticket);
}

export function TicketListClient({
  tickets,
  role,
  customers,
  technicians,
  categories,
  initialPriority = "",
  title = "Support Tickets",
  subtitle,
  headerAction,
}: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState(
    PRIORITIES.includes(initialPriority as (typeof PRIORITIES)[number]) ? initialPriority : ""
  );
  const [category, setCategory] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const showCustomerFilter = role !== "customer";
  const showTechnicianFilter = role === "manager" || role === "billing";

  const enriched = useMemo(
    () =>
      tickets.map((t) => {
        const sla = liveSla(t);
        return { ticket: t, sla };
      }),
    [tickets]
  );

  const metrics = useMemo(() => {
    const open = enriched.filter(({ ticket: t }) => OPEN_STATUSES.has(t.status));
    const critical = open.filter(({ ticket: t }) => t.priority === "critical").length;
    const overdue = open.filter(({ sla }) => sla.overdue || sla.overall === "missed").length;
    const atRisk = open.filter(
      ({ sla }) => !sla.overdue && sla.overall !== "missed" && sla.overall === "at_risk"
    ).length;
    return {
      open: open.length,
      critical,
      overdue,
      atRisk,
      priorityMix: [
        { name: "Critical", count: open.filter(({ ticket: t }) => t.priority === "critical").length },
        { name: "High", count: open.filter(({ ticket: t }) => t.priority === "high").length },
        { name: "Medium", count: open.filter(({ ticket: t }) => t.priority === "medium").length },
        { name: "Low", count: open.filter(({ ticket: t }) => t.priority === "low").length },
      ],
    };
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter(({ ticket: t, sla }) => {
      if (status && t.status !== status) return false;
      if (priority && t.priority !== priority) return false;
      if (category && (t.service_category ?? "") !== category) return false;
      if (customerId && t.customer_id !== customerId) return false;
      if (technicianId === "unassigned") {
        if (t.assigned_technician_id) return false;
      } else if (technicianId && t.assigned_technician_id !== technicianId) {
        return false;
      }
      if (overdueOnly && !sla.overdue) return false;
      if (q) {
        const haystack = [t.ticket_number, t.title, t.customer_name, t.description]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, search, status, priority, category, customerId, technicianId, overdueOnly]);

  function clearFilters() {
    setSearch("");
    setStatus("");
    setPriority("");
    setCategory("");
    setCustomerId("");
    setTechnicianId("");
    setOverdueOnly(false);
  }

  const mixMax = Math.max(1, ...metrics.priorityMix.map((d) => d.count));
  const metricTiles = [
    {
      label: "Open",
      value: String(metrics.open),
      tone: "sky" as const,
      icon: <Inbox className="h-4 w-4" />,
    },
    {
      label: "Critical",
      value: String(metrics.critical),
      tone: metrics.critical > 0 ? ("rose" as const) : ("emerald" as const),
      icon: <Flame className="h-4 w-4" />,
    },
    {
      label: "Overdue",
      value: String(metrics.overdue),
      tone: metrics.overdue > 0 ? ("rose" as const) : ("emerald" as const),
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    {
      label: "At risk",
      value: String(metrics.atRisk),
      tone: metrics.atRisk > 0 ? ("amber" as const) : ("emerald" as const),
      icon: <Timer className="h-4 w-4" />,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
          {subtitle ? <p className="text-sm opacity-70">{subtitle}</p> : null}
        </div>
        {headerAction}
      </div>

      {priority === "critical" ? (
        <div className="alert alert-error text-sm" role="alert">
          <span>Showing critical-priority tickets only. Treat these as highest urgency.</span>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-7">
          {metricTiles.map((m) => {
            const tone = TONE_STYLES[m.tone];
            return (
              <div key={m.label} className={`rounded-2xl border p-3 shadow-sm ${tone.card}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{m.label}</p>
                  <span className={`rounded-lg p-1.5 ${tone.icon}`}>{m.icon}</span>
                </div>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${tone.value}`}>{m.value}</p>
              </div>
            );
          })}
        </div>
        <div className="flex min-h-[11rem] flex-col rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm lg:col-span-5">
          <p className="mb-0.5 text-xs font-semibold">Open by priority</p>
          <p className="mb-2 text-[10px] opacity-60">Critical through low among open tickets</p>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={metrics.priorityMix}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
              >
                <XAxis type="number" hide domain={[0, Math.ceil(mixMax * 1.15) || 1]} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={64}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  formatter={(value) => [value ?? 0, "Tickets"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={16}>
                  {metrics.priorityMix.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={PRIORITY_COLORS[entry.name as keyof typeof PRIORITY_COLORS]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-base-300 bg-base-100/50 p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
        <label className="form-control w-full sm:max-w-xs">
          <span className="label-text text-xs">Search</span>
          <input
            className="input input-bordered input-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ticket #, title, customer…"
          />
        </label>
        <label className="form-control w-full sm:w-40">
          <span className="label-text text-xs">Status</span>
          <select
            className="select select-bordered select-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="form-control w-full sm:w-36">
          <span className="label-text text-xs">Priority</span>
          <select
            className="select select-bordered select-sm"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">All</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="form-control w-full sm:w-44">
          <span className="label-text text-xs">Category</span>
          <select
            className="select select-bordered select-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {showCustomerFilter ? (
          <label className="form-control w-full sm:w-48">
            <span className="label-text text-xs">Customer</span>
            <select
              className="select select-bordered select-sm"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">All</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showTechnicianFilter ? (
          <label className="form-control w-full sm:w-48">
            <span className="label-text text-xs">Technician</span>
            <select
              className="select select-bordered select-sm"
              value={technicianId}
              onChange={(e) => setTechnicianId(e.target.value)}
            >
              <option value="">All</option>
              <option value="unassigned">Unassigned</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="label cursor-pointer justify-start gap-2">
          <input
            type="checkbox"
            className="checkbox checkbox-sm checkbox-error"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
          />
          <span className="label-text text-xs">Overdue only</span>
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
          Clear
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-base-300 bg-base-100/50 shadow-sm">
        <div className="border-b border-base-300 px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-base-content/80">
            Ticket queue ({filtered.length})
          </h2>
        </div>
        <div className="p-3">
          {filtered.length === 0 ? (
            <EmptyState
              title="No tickets match"
              description={
                tickets.length === 0
                  ? role === "technician"
                    ? "No tickets are currently assigned to you."
                    : "Support tickets from customers will appear here once submitted."
                  : "Try clearing filters or adjusting your search."
              }
            />
          ) : (
            <ul className="grid gap-2">
              {filtered.map(({ ticket: t, sla }) => {
                const isCritical = t.priority === "critical";
                const overall = sla.overall as SlaCondition;
                const border =
                  isCritical || sla.overdue
                    ? "border-rose-400/30 bg-rose-500/10"
                    : overall === "at_risk"
                      ? "border-amber-400/30 bg-amber-500/10"
                      : "border-base-300 bg-base-100/40";
                return (
                  <li key={t.id}>
                    <Link
                      href={`/tickets/${t.id}`}
                      className={`block rounded-xl border px-3 py-2.5 shadow-sm transition hover:border-primary/40 ${border}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {t.ticket_number}
                            <span className="font-medium opacity-80"> · {t.title}</span>
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] opacity-70">
                            <span className={isCritical ? "font-medium text-error" : undefined}>
                              {isCritical ? "⚠ Critical" : statusLabel(t.priority)}
                            </span>
                            <span aria-hidden className="opacity-40">
                              ·
                            </span>
                            <span>{serviceModeLabel(t.service_mode)}</span>
                            <span aria-hidden className="opacity-40">
                              ·
                            </span>
                            <span
                              className={
                                overall === "missed" || sla.overdue
                                  ? "text-error"
                                  : overall === "at_risk"
                                    ? "text-warning"
                                    : undefined
                              }
                            >
                              {slaConditionLabel(overall)}
                            </span>
                          </p>
                          <p className="truncate text-[11px] opacity-70">
                            {t.customer_name}
                            {t.contract_label ? ` · ${t.contract_label}` : ""}
                            {" · "}
                            {t.assigned_technician_name ?? "Unassigned"}
                          </p>
                        </div>
                        <StatusBadge status={t.status} className="badge-sm shrink-0" />
                      </div>
                      {(isCritical || sla.overdue || overall === "at_risk") && (
                        <div className="mt-2">
                          <TicketSlaAlerts ticket={t} />
                        </div>
                      )}
                      <dl className="mt-2 grid gap-1 text-[11px] opacity-70 sm:grid-cols-3">
                        <div>
                          <dt className="inline opacity-60">Submitted </dt>
                          <dd className="inline">{formatDateTime(t.submitted_at)}</dd>
                        </div>
                        <div>
                          <dt className="inline opacity-60">Response </dt>
                          <dd className="inline">{formatDateTime(t.target_response_at)}</dd>
                        </div>
                        <div>
                          <dt className="inline opacity-60">Resolution </dt>
                          <dd className="inline">{formatDateTime(t.target_resolution_at)}</dd>
                        </div>
                      </dl>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
