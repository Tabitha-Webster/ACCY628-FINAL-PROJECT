"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type HeadcountBar = {
  departmentName: string;
  activeCount: number;
};

export type HiringTrendBar = {
  label: string;
  hires: number;
};

export type CostByDeptBar = {
  departmentName: string;
  avgAnnualCost: number;
};

export type HrChartVariant = "full" | "ops" | "cost";

const currencyTick = (value: number) =>
  `$${Intl.NumberFormat("en-US", { notation: "compact" }).format(value)}`;

export function HrAnalyticsCharts({
  variant = "full",
  headcountByDept,
  hiringTrends,
  costByDept,
}: {
  variant?: HrChartVariant;
  headcountByDept: HeadcountBar[];
  hiringTrends: HiringTrendBar[];
  costByDept: CostByDeptBar[];
}) {
  const showOps = variant === "full" || variant === "ops";
  const showCost = variant === "full" || variant === "cost";

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {showOps ? (
        <>
          <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-b from-sky-50/70 to-base-100 p-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-900/80">
              Active contractors by department
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={headcountByDept} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis
                    dataKey="departmentName"
                    fontSize={11}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                    height={60}
                  />
                  <YAxis fontSize={12} allowDecimals={false} width={32} />
                  <Tooltip />
                  <Bar dataKey="activeCount" name="Active" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50/70 to-base-100 p-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-900/80">
              Hiring trends (last 12 months)
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hiringTrends} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={12} allowDecimals={false} width={28} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="hires" name="Hires" stroke="#8b5cf6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}

      {showCost ? (
        <div
          className={`rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/70 to-base-100 p-3 shadow-sm ${
            variant === "cost" ? "lg:col-span-2" : "lg:col-span-2"
          }`}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
            Avg annual cost per contractor by department
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costByDept} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="departmentName"
                  fontSize={11}
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                  height={60}
                />
                <YAxis fontSize={12} tickFormatter={currencyTick} width={56} />
                <Tooltip
                  formatter={(value) => currencyTick(Number(Array.isArray(value) ? value[0] : value))}
                />
                <Bar dataKey="avgAnnualCost" name="Avg cost" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
