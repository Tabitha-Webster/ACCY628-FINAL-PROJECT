"use client";

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";

export type ArAgingBucketTotal = {
  bucket: string;
  shortLabel: string;
  amount: number;
  count: number;
};

const BUCKET_COLORS: Record<string, string> = {
  Current: "#16a34a",
  "1–30": "#eab308",
  "31–60": "#f97316",
  "61–90": "#ef4444",
  "90+": "#b91c1c",
};

const compactCurrency = (value: number) =>
  `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;

export function ArAgingChart({ data }: { data: ArAgingBucketTotal[] }) {
  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
            <XAxis dataKey="shortLabel" fontSize={12} tickLine={false} />
            <YAxis fontSize={12} width={64} tickFormatter={compactCurrency} />
            <Tooltip
              cursor={{ opacity: 0.1 }}
              formatter={(value, _name, item) => {
                const count = Number(item?.payload?.count ?? 0);
                return [
                  `${formatCurrency(Number(value ?? 0))} · ${count} invoice${count === 1 ? "" : "s"}`,
                  "Outstanding",
                ];
              }}
              labelFormatter={(_label, payload) => String(payload?.[0]?.payload?.bucket ?? "")}
            />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={90}>
              {data.map((entry) => (
                <Cell key={entry.bucket} fill={BUCKET_COLORS[entry.shortLabel] ?? "#0891b2"} />
              ))}
              <LabelList
                dataKey="amount"
                position="top"
                fontSize={12}
                formatter={(value) => (Number(value ?? 0) > 0 ? compactCurrency(Number(value)) : "")}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
        {data.map((entry) => (
          <div key={entry.bucket} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: BUCKET_COLORS[entry.shortLabel] ?? "#0891b2" }}
            />
            <span className="min-w-0">
              <span className="font-medium">{entry.shortLabel}</span>
              <span className="opacity-60">
                {" "}
                · {entry.count} invoice{entry.count === 1 ? "" : "s"}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
