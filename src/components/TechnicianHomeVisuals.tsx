"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  Flame,
  Inbox,
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
import { TechnicianCalendar, type CalendarTicket } from "@/components/TechnicianCalendar";
import { Hours, StatusBadge } from "@/components/ui";

export type TechMetricTone = "sky" | "violet" | "amber" | "rose" | "emerald";

export type TechMetricFilter =
  | "open"
  | "due_today"
  | "critical_high"
  | "overdue"
  | "completed_today"
  | "awaiting_approval"
  | "all_sections"
  | "hours_today";

export type TechMetricTile = {
  label: string;
  value: string;
  tone: TechMetricTone;
  filter: TechMetricFilter;
  hint?: string;
};

export type TechSlaCounts = {
  overdue: number;
  atRisk: number;
  onTrack: number;
};

export type TechContractWarning = {
  contract_id: string;
  label: string;
  used: number;
  included: number;
  status: "warning" | "over_limit";
};

const TONE_STYLES: Record<TechMetricTone, { card: string; icon: string; value: string; active: string }> = {
  sky: {
    card: "border-sky-400/30 bg-sky-500/10 text-base-content",
    icon: "bg-sky-500/20 text-sky-300",
    value: "text-base-content",
    active: "ring-2 ring-sky-400/40",
  },
  violet: {
    card: "border-violet-400/30 bg-violet-500/10 text-base-content",
    icon: "bg-violet-500/20 text-violet-300",
    value: "text-base-content",
    active: "ring-2 ring-violet-400/40",
  },
  amber: {
    card: "border-amber-400/30 bg-amber-500/10 text-base-content",
    icon: "bg-amber-500/20 text-amber-300",
    value: "text-base-content",
    active: "ring-2 ring-amber-400/40",
  },
  rose: {
    card: "border-rose-400/30 bg-rose-500/10 text-base-content",
    icon: "bg-rose-500/20 text-rose-300",
    value: "text-base-content",
    active: "ring-2 ring-rose-400/40",
  },
  emerald: {
    card: "border-emerald-400/30 bg-emerald-500/10 text-base-content",
    icon: "bg-emerald-500/20 text-emerald-300",
    value: "text-base-content",
    active: "ring-2 ring-emerald-400/40",
  },
};

const SLA_COLORS = {
  Overdue: "#f43f5e",
  "At risk": "#f59e0b",
  "On track": "#10b981",
} as const;

function MetricIcon({ tone }: { tone: TechMetricTone }) {
  const cls = "h-4 w-4";
  if (tone === "sky") return <Inbox className={cls} />;
  if (tone === "amber") return <CalendarClock className={cls} />;
  if (tone === "rose") return <AlertTriangle className={cls} />;
  if (tone === "violet") return <Flame className={cls} />;
  return <Clock className={cls} />;
}

function SlaUrgencyChart({ sla }: { sla: TechSlaCounts }) {
  const data = [
    { name: "Overdue", count: sla.overdue },
    { name: "At risk", count: sla.atRisk },
    { name: "On track", count: sla.onTrack },
  ];
  const total = data.reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="flex h-full min-h-[11rem] flex-col rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm">
      <p className="mb-0.5 text-xs font-semibold">SLA urgency</p>
      <p className="mb-2 text-[10px] opacity-60">Open tickets by deadline condition</p>
      {total === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm opacity-60">No open tickets</div>
      ) : (
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
              <XAxis type="number" hide domain={[0, Math.ceil(max * 1.15) || 1]} />
              <YAxis
                type="category"
                dataKey="name"
                width={72}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                formatter={(value) => [value ?? 0, "Tickets"]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18}>
                {data.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={SLA_COLORS[entry.name as keyof typeof SLA_COLORS]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function TechnicianHomeVisuals({
  fullName,
  metrics,
  activeFilter,
  onMetricClick,
  sla,
  calendarTickets,
  timezoneLabel,
  contractWarnings = [],
  children,
}: {
  fullName: string;
  metrics: TechMetricTile[];
  activeFilter: string;
  onMetricClick: (filter: TechMetricFilter) => void;
  sla: TechSlaCounts;
  calendarTickets: CalendarTicket[];
  timezoneLabel: string;
  contractWarnings?: TechContractWarning[];
  children: React.ReactNode;
}) {
  const firstName = fullName.split(" ")[0] || fullName;

  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0 space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">My Assignments</h1>
        <p className="text-sm opacity-70">
          Hi {firstName} — tickets assigned to you. Critical and overdue items stay highlighted.
        </p>
      </div>

      {contractWarnings.length > 0 ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-base-content/80">
            Contract-hour warnings
          </p>
          <ul className="mt-1.5 space-y-1">
            {contractWarnings.map((w) => (
              <li
                key={w.contract_id}
                className="flex flex-wrap items-center gap-2 text-xs text-base-content/90"
              >
                <span className="font-medium">{w.label}</span>
                <span className="tabular-nums opacity-70">
                  <Hours value={w.used} /> / <Hours value={w.included} />
                </span>
                <StatusBadge status={w.status} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map((metric) => {
          const tone = TONE_STYLES[metric.tone] ?? TONE_STYLES.sky;
          const active = activeFilter === metric.filter;
          return (
            <button
              key={metric.label}
              type="button"
              onClick={() => onMetricClick(metric.filter)}
              className={`rounded-2xl border p-3 text-left shadow-sm transition hover:brightness-[0.98] ${tone.card} ${
                active ? tone.active : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                  {metric.label}
                </p>
                <span className={`rounded-lg p-1.5 ${tone.icon}`}>
                  <MetricIcon tone={metric.tone} />
                </span>
              </div>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${tone.value}`}>{metric.value}</p>
              {metric.hint ? <p className="mt-0.5 text-[10px] opacity-60">{metric.hint}</p> : null}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SlaUrgencyChart sla={sla} />
        </div>
        <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 p-3 shadow-sm lg:col-span-8">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-base-content/80">
              Schedule
            </h2>
            <Link href="/assignments" className="text-[11px] font-medium text-base-content/70 hover:underline">
              Workbench
            </Link>
          </div>
          <TechnicianCalendar tickets={calendarTickets} timezoneLabel={timezoneLabel} />
        </div>
      </div>

      {children}
    </div>
  );
}
