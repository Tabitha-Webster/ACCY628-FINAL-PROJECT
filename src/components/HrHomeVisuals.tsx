"use client";

import Link from "next/link";
import {
  Briefcase,
  Percent,
  UserRoundSearch,
  Users,
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
import { StarRating } from "@/components/StarRating";

export type HrMetricTone = "sky" | "violet" | "amber" | "rose" | "emerald";

export type HrMetricTile = {
  label: string;
  value: string;
  href?: string;
  tone: HrMetricTone;
  hint?: string;
};

export type HrApplicantRow = {
  id: string;
  fullName: string;
  appliedFor: string;
  matchPercent: number;
  stars: number;
};

export type HrOpenRoleRow = {
  id: string;
  title: string;
  department: string;
};

export type HrPipelineCounts = {
  openRoles: number;
  applicants: number;
  strongMatches: number;
  activeContractors: number;
};

const TONE_STYLES: Record<HrMetricTone, { card: string; icon: string; value: string }> = {
  sky: {
    card: "border-sky-300/60 bg-gradient-to-br from-sky-50 to-sky-100/80",
    icon: "bg-sky-500/15 text-sky-700",
    value: "text-sky-900",
  },
  violet: {
    card: "border-violet-300/60 bg-gradient-to-br from-violet-50 to-violet-100/80",
    icon: "bg-violet-500/15 text-violet-700",
    value: "text-violet-900",
  },
  amber: {
    card: "border-amber-300/60 bg-gradient-to-br from-amber-50 to-amber-100/80",
    icon: "bg-amber-500/15 text-amber-800",
    value: "text-amber-950",
  },
  rose: {
    card: "border-rose-300/70 bg-gradient-to-br from-rose-50 to-rose-100/90",
    icon: "bg-rose-500/15 text-rose-700",
    value: "text-rose-900",
  },
  emerald: {
    card: "border-emerald-300/60 bg-gradient-to-br from-emerald-50 to-emerald-100/80",
    icon: "bg-emerald-500/15 text-emerald-700",
    value: "text-emerald-900",
  },
};

const PIPELINE_COLORS = {
  "Open roles": "#f59e0b",
  Applicants: "#8b5cf6",
  "Strong matches": "#10b981",
  "Active contractors": "#0ea5e9",
} as const;

function MetricIcon({ tone }: { tone: HrMetricTone }) {
  const cls = "h-4 w-4";
  if (tone === "sky") return <Users className={cls} />;
  if (tone === "amber") return <Briefcase className={cls} />;
  if (tone === "violet") return <UserRoundSearch className={cls} />;
  return <Percent className={cls} />;
}

function HiringPipelineChart({ pipeline }: { pipeline: HrPipelineCounts }) {
  const data = [
    { name: "Open roles", count: pipeline.openRoles },
    { name: "Applicants", count: pipeline.applicants },
    { name: "Strong matches", count: pipeline.strongMatches },
    { name: "Active contractors", count: pipeline.activeContractors },
  ];
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="flex h-full min-h-[11rem] flex-col rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm">
      <p className="mb-1 text-xs font-semibold">Hiring pipeline</p>
      <p className="mb-2 text-[10px] opacity-60">Roles, applicants, and workforce at a glance</p>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
          >
            <XAxis type="number" hide domain={[0, Math.ceil(max * 1.15) || 1]} />
            <YAxis
              type="category"
              dataKey="name"
              width={108}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              formatter={(value) => [value ?? 0, "Count"]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={16}>
              {data.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={PIPELINE_COLORS[entry.name as keyof typeof PIPELINE_COLORS]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function HrHomeVisuals({
  fullName,
  metrics = [],
  pipeline,
  applicants = [],
  openRoles = [],
}: {
  fullName: string;
  metrics?: HrMetricTile[];
  pipeline: HrPipelineCounts;
  applicants?: HrApplicantRow[];
  openRoles?: HrOpenRoleRow[];
}) {
  const metricTiles = metrics ?? [];
  const applicantRows = applicants ?? [];
  const roleRows = openRoles ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0 space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">HR Dashboard</h1>
        <p className="text-sm opacity-70">Welcome, {fullName}.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-7">
          {metricTiles.map((metric) => {
            const tone = TONE_STYLES[metric.tone] ?? TONE_STYLES.sky;
            const body = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                    {metric.label}
                  </p>
                  <span className={`rounded-lg p-1.5 ${tone.icon}`}>
                    <MetricIcon tone={metric.tone} />
                  </span>
                </div>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${tone.value}`}>
                  {metric.value}
                </p>
                {metric.hint ? <p className="mt-0.5 text-[10px] opacity-60">{metric.hint}</p> : null}
              </>
            );
            const classes = `rounded-2xl border p-3 shadow-sm ${tone.card}`;
            return metric.href ? (
              <Link
                key={metric.label}
                href={metric.href}
                className={`${classes} transition hover:brightness-[0.98]`}
              >
                {body}
              </Link>
            ) : (
              <div key={metric.label} className={classes}>
                {body}
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-5">
          <HiringPipelineChart pipeline={pipeline} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="flex flex-col overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50/80 to-base-100">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-violet-200/70 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-violet-900/80">
              Who to hire
            </h2>
            <Link
              href="/hr-applicants"
              className="text-[11px] font-medium text-violet-800/80 hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="space-y-2 p-3">
            {applicantRows.length === 0 ? (
              <p className="text-sm opacity-60">No applicants.</p>
            ) : (
              applicantRows.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-violet-100 bg-white/80 px-2.5 py-2 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{a.fullName}</p>
                    <p className="truncate text-[11px] opacity-70">{a.appliedFor}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-violet-900">
                      {a.matchPercent}%
                    </p>
                    <StarRating stars={a.stars} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="flex flex-col overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50/80 to-base-100">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-200/70 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">
              Open roles ({roleRows.length})
            </h2>
            <Link
              href="/hr-positions"
              className="text-[11px] font-medium text-amber-900/80 hover:underline"
            >
              Manage positions
            </Link>
          </div>
          <div className="space-y-2 p-3">
            {roleRows.length === 0 ? (
              <p className="text-sm opacity-60">No open roles right now.</p>
            ) : (
              roleRows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-amber-100 bg-white/80 px-2.5 py-2 shadow-sm"
                >
                  <p className="truncate text-xs font-semibold">{r.title}</p>
                  <p className="shrink-0 text-[11px] opacity-70">{r.department}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="HR shortcuts">
        {[
          { href: "/hr-applicants", label: "Applicants", primary: true },
          { href: "/hr-positions", label: "Positions" },
          { href: "/hr-analytics", label: "Analytics" },
          { href: "/admin/employees", label: "Employees" },
          { href: "/admin/hr", label: "HR Directory" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              item.primary
                ? "rounded-xl border border-violet-300/70 bg-gradient-to-br from-violet-500 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-violet-500/20 transition hover:brightness-110"
                : "rounded-xl border border-base-300 bg-base-100 px-3 py-1.5 text-xs font-medium opacity-80 transition hover:border-violet-300 hover:bg-violet-50/60 hover:opacity-100"
            }
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
