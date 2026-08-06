"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { statusLabel } from "@/lib/format";

export type SupportStatusSlice = {
  status: string;
  count: number;
};

const STATUS_COLORS: Record<string, string> = {
  new: "#38bdf8",
  assigned: "#6366f1",
  in_progress: "#f59e0b",
  waiting_on_customer: "#a855f7",
  waiting_on_approval: "#ec4899",
  resolved: "#22c55e",
  closed: "#64748b",
  canceled: "#94a3b8",
};

const FALLBACK_COLORS = ["#0ea5e9", "#8b5cf6", "#f97316", "#14b8a6", "#e11d48", "#84cc16"];

function colorForStatus(status: string, index: number) {
  return STATUS_COLORS[status] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export function CustomerSupportStatusChart({
  data,
  year,
}: {
  data: SupportStatusSlice[];
  year: number;
}) {
  const total = data.reduce((sum, row) => sum + row.count, 0);
  const chartData = data.map((row) => ({
    ...row,
    label: statusLabel(row.status),
  }));

  return (
    <div className="rounded-box flex h-full flex-col border border-base-300 bg-base-100 p-4 shadow-sm">
      <div className="mb-2">
        <p className="text-sm font-semibold">Support Requests ({year})</p>
        <p className="text-xs opacity-60">Total requests by status for the year</p>
      </div>

      {total === 0 ? (
        <div className="flex flex-1 items-center justify-center py-10 text-sm opacity-60">
          No support requests yet this year.
        </div>
      ) : (
        <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="relative mx-auto h-56 w-full max-w-[16rem]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius="58%"
                  outerRadius="88%"
                  paddingAngle={2}
                  stroke="#ffffff"
                  strokeWidth={2}
                  label={false}
                  legendType="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={entry.status} fill={colorForStatus(entry.status, index)} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [
                    `${Number(value ?? 0)} request${Number(value ?? 0) === 1 ? "" : "s"}`,
                    String(name ?? ""),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-semibold tabular-nums">{total}</p>
              <p className="text-[11px] uppercase tracking-wide opacity-60">Total</p>
            </div>
          </div>

          <ul className="space-y-1.5 text-sm">
            {chartData.map((row, index) => (
              <li key={row.status} className="flex items-center gap-2">
                <span
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorForStatus(row.status, index) }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
