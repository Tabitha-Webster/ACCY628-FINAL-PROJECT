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
  data = [],
  year,
  compact = false,
}: {
  data?: SupportStatusSlice[];
  year: number;
  compact?: boolean;
}) {
  const rows = Array.isArray(data) ? data : [];
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const chartData = rows.map((row) => ({
    ...row,
    label: statusLabel(row.status),
  }));

  return (
    <div
      className={`rounded-box flex h-full flex-col border border-base-300 bg-base-100 shadow-sm ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className={compact ? "mb-1" : "mb-2"}>
        <p className={`font-semibold ${compact ? "text-xs" : "text-sm"}`}>Support Requests ({year})</p>
        {!compact ? (
          <p className="text-xs opacity-60">Total requests by status for the year</p>
        ) : null}
      </div>

      {total === 0 ? (
        <div className="flex flex-1 items-center justify-center py-6 text-sm opacity-60">
          No support requests yet this year.
        </div>
      ) : (
        <div
          className={`grid flex-1 items-center gap-2 ${
            compact ? "grid-cols-[minmax(0,1fr)_auto]" : "sm:grid-cols-[1fr_auto] sm:items-center gap-3"
          }`}
        >
          <div
            className={`relative mx-auto w-full ${
              compact ? "h-36 max-w-[11rem]" : "h-56 max-w-[16rem]"
            }`}
          >
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
              <p className={`font-semibold tabular-nums ${compact ? "text-xl" : "text-2xl"}`}>{total}</p>
              <p className="text-[10px] uppercase tracking-wide opacity-60">Total</p>
            </div>
          </div>

          <ul className={`text-xs ${compact ? "space-y-1" : "space-y-1.5 text-sm"}`}>
            {chartData.map((row, index) => (
              <li key={row.status} className="flex items-center gap-2">
                <span
                  className="inline-block size-2 shrink-0 rounded-full"
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
