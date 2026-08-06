"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Hourglass,
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
import { CONTRACT_STATUS_LABELS } from "@/lib/contracts";
import type { ContractStatus } from "@/lib/types";

export type ContractsMetricTone = "sky" | "violet" | "amber" | "rose" | "emerald";

export type ContractsMetricTile = {
  label: string;
  value: string;
  tone: ContractsMetricTone;
  hint?: string;
  href?: string;
};

export type ContractsStatusCounts = Record<ContractStatus, number>;

const TONE_STYLES: Record<
  ContractsMetricTone,
  { card: string; icon: string; value: string }
> = {
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

const STATUS_COLORS: Record<string, string> = {
  Active: "#22c55e",
  Draft: "#94a3b8",
  "Pending Approval": "#f59e0b",
  Suspended: "#a855f7",
  Completed: "#ef4444",
  Cancelled: "#64748b",
  Renewed: "#38bdf8",
};

function MetricIcon({ tone }: { tone: ContractsMetricTone }) {
  const cls = "h-4 w-4";
  if (tone === "emerald") return <CheckCircle2 className={cls} />;
  if (tone === "amber") return <Hourglass className={cls} />;
  if (tone === "rose") return <AlertTriangle className={cls} />;
  if (tone === "violet") return <ClipboardList className={cls} />;
  return <FileText className={cls} />;
}

function StatusMixChart({ counts }: { counts: ContractsStatusCounts }) {
  const data = (
    Object.entries(counts) as [ContractStatus, number][]
  )
    .map(([status, count]) => ({
      name: CONTRACT_STATUS_LABELS[status] ?? status.replace(/_/g, " "),
      count,
      status,
    }))
    .filter((d) => d.count > 0);

  const total = data.reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="flex h-full min-h-[11rem] flex-col rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm">
      <p className="mb-0.5 text-xs font-semibold">Status mix</p>
      <p className="mb-2 text-[10px] opacity-60">How agreements are distributed</p>
      {total === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm opacity-60">
          No contracts yet
        </div>
      ) : (
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
              <XAxis type="number" hide domain={[0, Math.ceil(max * 1.15) || 1]} />
              <YAxis
                type="category"
                dataKey="name"
                width={96}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                formatter={(value) => [value ?? 0, "Contracts"]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={14}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#94a3b8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function ContractsManageVisuals({
  title,
  subtitle,
  metrics,
  statusCounts,
  headerActions,
  children,
}: {
  title: string;
  subtitle?: string;
  metrics: ContractsMetricTile[];
  statusCounts: ContractsStatusCounts;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
          {subtitle ? <p className="text-sm opacity-70">{subtitle}</p> : null}
        </div>
        {headerActions}
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-7">
          {metrics.map((metric) => {
            const tone = TONE_STYLES[metric.tone] ?? TONE_STYLES.sky;
            const inner = (
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
            if (metric.href) {
              return (
                <Link
                  key={metric.label}
                  href={metric.href}
                  className={`rounded-2xl border p-3 shadow-sm transition hover:brightness-[0.98] ${tone.card}`}
                >
                  {inner}
                </Link>
              );
            }
            return (
              <div key={metric.label} className={`rounded-2xl border p-3 shadow-sm ${tone.card}`}>
                {inner}
              </div>
            );
          })}
        </div>
        <div className="lg:col-span-5">
          <StatusMixChart counts={statusCounts} />
        </div>
      </div>

      {children}
    </div>
  );
}
