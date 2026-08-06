"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FolderKanban,
  Loader,
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

export type ProjectsMetricTone = "sky" | "violet" | "amber" | "rose" | "emerald";

export type ProjectsMetricTile = {
  label: string;
  value: string;
  tone: ProjectsMetricTone;
  hint?: string;
};

export type ProjectsStatusCounts = {
  proposed: number;
  inProgress: number;
  awaiting: number;
  completed: number;
};

const TONE_STYLES: Record<
  ProjectsMetricTone,
  { card: string; icon: string; value: string }
> = {
  sky: {
    card: "border-sky-400/50 bg-gradient-to-br from-sky-100 to-sky-200/90 text-slate-900",
    icon: "bg-sky-600/20 text-sky-800",
    value: "text-slate-950",
  },
  violet: {
    card: "border-violet-400/50 bg-gradient-to-br from-violet-100 to-violet-200/90 text-slate-900",
    icon: "bg-violet-600/20 text-violet-800",
    value: "text-slate-950",
  },
  amber: {
    card: "border-amber-400/50 bg-gradient-to-br from-amber-100 to-amber-200/90 text-slate-900",
    icon: "bg-amber-600/20 text-amber-900",
    value: "text-slate-950",
  },
  rose: {
    card: "border-rose-400/50 bg-gradient-to-br from-rose-100 to-rose-200/90 text-slate-900",
    icon: "bg-rose-600/20 text-rose-800",
    value: "text-slate-950",
  },
  emerald: {
    card: "border-emerald-400/50 bg-gradient-to-br from-emerald-100 to-emerald-200/90 text-slate-900",
    icon: "bg-emerald-600/20 text-emerald-800",
    value: "text-slate-950",
  },
};

const STATUS_COLORS = {
  Proposed: "#8b5cf6",
  "In progress": "#0ea5e9",
  Awaiting: "#f59e0b",
  Completed: "#10b981",
} as const;

function MetricIcon({ tone }: { tone: ProjectsMetricTone }) {
  const cls = "h-4 w-4";
  if (tone === "sky") return <FolderKanban className={cls} />;
  if (tone === "amber") return <AlertTriangle className={cls} />;
  if (tone === "violet") return <Loader className={cls} />;
  return <CheckCircle2 className={cls} />;
}

function StatusMixChart({ counts }: { counts: ProjectsStatusCounts }) {
  const data = [
    { name: "Proposed", count: counts.proposed },
    { name: "In progress", count: counts.inProgress },
    { name: "Awaiting", count: counts.awaiting },
    { name: "Completed", count: counts.completed },
  ];
  const total = data.reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="flex h-full min-h-[11rem] flex-col rounded-2xl border border-base-300 bg-base-100 p-3 text-base-content shadow-sm">
      <p className="mb-0.5 text-xs font-semibold">Project status mix</p>
      <p className="mb-2 text-[10px] text-base-content/70">How delivery work is distributed</p>
      {total === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm opacity-60">No projects yet</div>
      ) : (
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
              <XAxis type="number" hide domain={[0, Math.ceil(max * 1.15) || 1]} />
              <YAxis
                type="category"
                dataKey="name"
                width={80}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                formatter={(value) => [value ?? 0, "Projects"]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={16}>
                {data.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={STATUS_COLORS[entry.name as keyof typeof STATUS_COLORS]}
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

export function ProjectsHomeVisuals({
  title = "Projects",
  subtitle,
  metrics,
  statusCounts,
  children,
}: {
  title?: string;
  subtitle?: string;
  metrics: ProjectsMetricTile[];
  statusCounts: ProjectsStatusCounts;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0 space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight text-base-content md:text-2xl">{title}</h1>
        {subtitle ? <p className="text-sm text-base-content/80">{subtitle}</p> : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-7">
          {metrics.map((metric) => {
            const tone = TONE_STYLES[metric.tone] ?? TONE_STYLES.sky;
            return (
              <div key={metric.label} className={`rounded-2xl border p-3 shadow-sm ${tone.card}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                    {metric.label}
                  </p>
                  <span className={`rounded-lg p-1.5 ${tone.icon}`}>
                    <MetricIcon tone={metric.tone} />
                  </span>
                </div>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${tone.value}`}>
                  {metric.value}
                </p>
                {metric.hint ? <p className="mt-0.5 text-[10px] text-slate-700/80">{metric.hint}</p> : null}
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
