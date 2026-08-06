"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  FileText,
  Ticket,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CustomerSupportStatusChart, type SupportStatusSlice } from "@/components/CustomerSupportStatusChart";
import type { MonthlyFinancials } from "@/components/ManagerCharts";
import { formatCurrency, statusLabel } from "@/lib/format";

export type ExecutiveMetricTile = {
  label: string;
  value: string;
  href?: string;
  tone: "sky" | "violet" | "amber" | "rose" | "emerald";
  hint?: string;
};

export type AttentionTicket = {
  id: string;
  ticketNumber: string;
  title: string;
  customer: string;
  priority: string;
  sla: string;
};

export type HoursRiskRow = {
  id: string;
  name: string;
  customer: string;
  used: number;
  included: number;
  pct: number;
};

export type ApprovalChip = {
  id: string;
  label: string;
  detail: string;
  href: string;
};

const TONE_STYLES: Record<
  ExecutiveMetricTile["tone"],
  { card: string; icon: string; value: string }
> = {
  sky: {
    card: "border-sky-300/60 bg-gradient-to-br from-sky-50 to-sky-100/80 dark:from-sky-950/50 dark:to-sky-900/30 dark:border-sky-700/50",
    icon: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    value: "text-sky-900 dark:text-sky-100",
  },
  violet: {
    card: "border-violet-300/60 bg-gradient-to-br from-violet-50 to-violet-100/80 dark:from-violet-950/50 dark:to-violet-900/30 dark:border-violet-700/50",
    icon: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    value: "text-violet-900 dark:text-violet-100",
  },
  amber: {
    card: "border-amber-300/60 bg-gradient-to-br from-amber-50 to-amber-100/80 dark:from-amber-950/40 dark:to-amber-900/25 dark:border-amber-700/50",
    icon: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    value: "text-amber-950 dark:text-amber-100",
  },
  rose: {
    card: "border-rose-300/70 bg-gradient-to-br from-rose-50 to-rose-100/90 dark:from-rose-950/50 dark:to-rose-900/30 dark:border-rose-700/50",
    icon: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    value: "text-rose-900 dark:text-rose-100",
  },
  emerald: {
    card: "border-emerald-300/60 bg-gradient-to-br from-emerald-50 to-emerald-100/80 dark:from-emerald-950/50 dark:to-emerald-900/30 dark:border-emerald-700/50",
    icon: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    value: "text-emerald-900 dark:text-emerald-100",
  },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-rose-500",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-sky-400",
};

function MetricIcon({ tone }: { tone: ExecutiveMetricTile["tone"] }) {
  const cls = "h-4 w-4";
  if (tone === "sky") return <Building2 className={cls} />;
  if (tone === "violet") return <FileText className={cls} />;
  if (tone === "rose") return <Ticket className={cls} />;
  if (tone === "amber") return <AlertTriangle className={cls} />;
  return <TrendingUp className={cls} />;
}

const currencyTick = (value: number) =>
  `$${Intl.NumberFormat("en-US", { notation: "compact" }).format(value)}`;

/** One-viewport executive home styled like Customer Home. */
export function ExecutiveDashboardVisuals({
  fullName,
  overdueBalance,
  year,
  metrics,
  ticketStatusSlices,
  monthlyFinancials,
  attentionTickets,
  hoursAtRisk,
  approvals,
  pendingApprovalsTotal,
}: {
  fullName: string;
  overdueBalance: number;
  year: number;
  metrics: ExecutiveMetricTile[];
  ticketStatusSlices: SupportStatusSlice[];
  monthlyFinancials: MonthlyFinancials[];
  attentionTickets: AttentionTicket[];
  hoursAtRisk: HoursRiskRow[];
  approvals: ApprovalChip[];
  pendingApprovalsTotal: number;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-hidden lg:h-[calc(100vh-7.5rem)]">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Manager Dashboard</h1>
          <p className="text-sm opacity-70">Welcome back, {fullName}.</p>
        </div>
        <Link
          href="/accounts-receivable"
          className={
            overdueBalance > 0
              ? "relative block min-w-[10.5rem] max-w-[13rem] overflow-hidden rounded-2xl border border-rose-400/50 bg-gradient-to-br from-rose-500 to-rose-600 px-3 py-2.5 text-right text-white shadow-md shadow-rose-500/25 transition hover:brightness-110"
              : "relative block min-w-[10.5rem] max-w-[13rem] overflow-hidden rounded-2xl border border-emerald-400/50 bg-gradient-to-br from-emerald-500 to-emerald-600 px-3 py-2.5 text-right text-white shadow-md shadow-emerald-500/25 transition hover:brightness-110"
          }
        >
          <div className="pointer-events-none absolute -right-4 -top-4 size-16 rounded-full bg-white/15" />
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/90">
            Overdue Balance
          </p>
          <p className="mt-0.5 truncate text-xl font-semibold tabular-nums leading-none" title={formatCurrency(overdueBalance)}>
            {formatCurrency(overdueBalance)}
          </p>
          <p className="mt-1 text-[10px] leading-snug text-white/85">
            {overdueBalance > 0 ? "Tap to review AR" : "Collections look clean"}
          </p>
        </Link>
      </div>

      <div className="grid shrink-0 gap-3 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-7">
          {metrics.map((metric) => {
            const tone = TONE_STYLES[metric.tone] ?? TONE_STYLES.sky;
            const body = (
              <>
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[10px] font-semibold uppercase leading-tight tracking-wide opacity-70 line-clamp-2">
                    {metric.label}
                  </p>
                  <span className={`shrink-0 rounded-lg p-1.5 ${tone.icon}`}>
                    <MetricIcon tone={metric.tone} />
                  </span>
                </div>
                <p
                  className={`mt-1 min-w-0 truncate text-lg font-semibold tabular-nums leading-tight sm:text-xl ${tone.value}`}
                  title={metric.value}
                >
                  {metric.value}
                </p>
                {metric.hint ? (
                  <p className="mt-0.5 min-w-0 text-[10px] leading-snug opacity-60 line-clamp-2" title={metric.hint}>
                    {metric.hint}
                  </p>
                ) : null}
              </>
            );
            const classes = `flex min-h-[5.75rem] min-w-0 flex-col overflow-hidden rounded-2xl border p-3 shadow-sm ${tone.card}`;
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

        <div className="min-h-[10.5rem] lg:col-span-5">
          <CustomerSupportStatusChart data={ticketStatusSlices} year={year} compact />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-3">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50/80 to-base-100 dark:border-violet-800/50 dark:from-violet-950/40">
          <h2 className="shrink-0 border-b border-violet-200/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-900/80 dark:border-violet-800/60 dark:text-violet-200">
            Revenue, Cost &amp; Profit
          </h2>
          <div className="min-h-0 flex-1 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyFinancials} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={10} tickLine={false} />
                <YAxis fontSize={10} width={40} tickFormatter={currencyTick} tickLine={false} />
                <Tooltip
                  formatter={(value) =>
                    currencyTick(Number(Array.isArray(value) ? value[0] : value))
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cost" name="Cost" stroke="#dc2626" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="#16a34a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-b from-sky-50/80 to-base-100 dark:border-sky-800/50 dark:from-sky-950/40">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sky-200/70 px-3 py-2 dark:border-sky-800/60">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-sky-900/80 dark:text-sky-200">
              Tickets Needing Attention
            </h2>
            <Link href="/tickets" className="text-[10px] font-medium text-sky-700 hover:underline dark:text-sky-300">
              View all
            </Link>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-hidden p-3">
            {attentionTickets.length === 0 ? (
              <p className="text-sm opacity-60">No critical, at-risk, or missed-SLA tickets.</p>
            ) : (
              attentionTickets.slice(0, 5).map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  className="flex items-start gap-2 rounded-xl border border-sky-100 bg-white/80 px-2.5 py-2 shadow-sm transition hover:border-sky-300 dark:border-sky-900 dark:bg-base-200/60"
                >
                  <span
                    className={`mt-1 size-2.5 shrink-0 rounded-full ${
                      PRIORITY_COLORS[t.priority] ?? "bg-slate-400"
                    }`}
                    title={statusLabel(t.priority)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{t.ticketNumber}</span>
                    <span className="block truncate text-[11px] opacity-70">{t.title}</span>
                    <span className="mt-0.5 flex min-w-0 flex-wrap gap-1">
                      <span className="max-w-full truncate rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-sky-800 dark:bg-sky-900/60 dark:text-sky-200">
                        {t.customer}
                      </span>
                      <span className="shrink-0 rounded-full bg-base-200 px-1.5 py-0.5 text-[10px] font-medium leading-tight">
                        {statusLabel(t.sla)}
                      </span>
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/80 to-base-100 dark:border-emerald-800/50 dark:from-emerald-950/40">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-emerald-200/70 px-3 py-2 dark:border-emerald-800/60">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/80 dark:text-emerald-200">
              Approvals &amp; Hours
            </h2>
            <Link
              href="/projects"
              className="text-[10px] font-medium text-emerald-700 hover:underline dark:text-emerald-300"
            >
              {pendingApprovalsTotal} pending
            </Link>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-3">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
                Waiting on approval
              </p>
              {approvals.length === 0 ? (
                <p className="text-xs opacity-60">Nothing in the approval queue.</p>
              ) : (
                approvals.slice(0, 3).map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block rounded-xl border border-emerald-100 bg-white/80 px-2.5 py-1.5 shadow-sm transition hover:border-emerald-300 dark:border-emerald-900 dark:bg-base-200/60"
                  >
                    <span className="block truncate text-xs font-semibold">{item.label}</span>
                    <span className="block truncate text-[11px] opacity-70">{item.detail}</span>
                  </Link>
                ))
              )}
            </div>

            <div className="space-y-1.5 border-t border-emerald-200/60 pt-2 dark:border-emerald-800/50">
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
                Over included hours
              </p>
              {hoursAtRisk.length === 0 ? (
                <p className="text-xs opacity-60">All contracts within included hours.</p>
              ) : (
                hoursAtRisk.slice(0, 3).map((c) => (
                  <Link
                    key={c.id}
                    href={`/contracts/${c.id}`}
                    className="block space-y-1 rounded-xl p-1 hover:bg-emerald-100/40 dark:hover:bg-emerald-900/30"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="shrink-0 tabular-nums opacity-70">
                        {c.used.toFixed(0)}/{c.included.toFixed(0)}h
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-emerald-900/10 dark:bg-emerald-100/10">
                      <div
                        className="h-full rounded-full bg-rose-500"
                        style={{ width: `${Math.min(100, Math.max(8, c.pct))}%` }}
                      />
                    </div>
                    <p className="text-[10px] opacity-60">{c.customer}</p>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
