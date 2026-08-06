"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MATCH_COLORS = {
  Strong: "#10b981",
  Medium: "#f59e0b",
  Weak: "#f43f5e",
} as const;

export function HrMatchStrengthChart({
  strong,
  medium,
  weak,
}: {
  strong: number;
  medium: number;
  weak: number;
}) {
  const data = [
    { name: "Strong", count: strong },
    { name: "Medium", count: medium },
    { name: "Weak", count: weak },
  ];
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = strong + medium + weak;

  return (
    <div className="flex h-full min-h-[11rem] flex-col rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm">
      <p className="mb-0.5 text-xs font-semibold">Match strength</p>
      <p className="mb-2 text-[10px] opacity-60">Applicants by fit vs open roles</p>
      {total === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm opacity-60">No applicants</div>
      ) : (
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
              <XAxis type="number" hide domain={[0, Math.ceil(max * 1.15) || 1]} />
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
                formatter={(value) => [value ?? 0, "Applicants"]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18}>
                {data.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={MATCH_COLORS[entry.name as keyof typeof MATCH_COLORS]}
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
