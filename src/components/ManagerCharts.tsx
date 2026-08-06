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

export type MonthlyFinancials = {
  month: string;
  revenue: number;
  cost: number;
  profit: number;
};

export type TicketsByStatus = {
  status: string;
  count: number;
};

const currencyTick = (value: number) =>
  `$${Intl.NumberFormat("en-US", { notation: "compact" }).format(value)}`;

export function ManagerCharts({
  monthlyFinancials,
  ticketsByStatus,
}: {
  monthlyFinancials: MonthlyFinancials[];
  ticketsByStatus: TicketsByStatus[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <p className="mb-2 text-sm font-semibold">Revenue, Cost &amp; Profit (last 6 months)</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyFinancials} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={currencyTick} width={56} />
              <Tooltip formatter={(value) => currencyTick(Number(Array.isArray(value) ? value[0] : value))} />
              <Legend />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2} />
              <Line type="monotone" dataKey="cost" name="Cost" stroke="#dc2626" strokeWidth={2} />
              <Line type="monotone" dataKey="profit" name="Profit" stroke="#16a34a" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <p className="mb-2 text-sm font-semibold">Open Tickets by Status</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ticketsByStatus} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="status" fontSize={12} />
              <YAxis fontSize={12} allowDecimals={false} width={32} />
              <Tooltip />
              <Bar dataKey="count" name="Tickets" fill="#0891b2" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
