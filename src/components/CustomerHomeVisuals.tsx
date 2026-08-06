"use client";

import Link from "next/link";
import {
  AlertTriangle,
  FileText,
  FolderKanban,
  Receipt,
} from "lucide-react";
import { CustomerSupportStatusChart, type SupportStatusSlice } from "@/components/CustomerSupportStatusChart";
import { formatCurrency, statusLabel } from "@/lib/format";

export type CustomerMetricTile = {
  label: string;
  value: string;
  href?: string;
  tone: "sky" | "violet" | "amber" | "rose" | "emerald";
  hint?: string;
};

export type ContractUsageRow = {
  id: string;
  name: string;
  used: number;
  included: number;
  remaining: number;
  pct: number;
  status: "normal" | "warning" | "over_limit";
};

export type RequestChip = {
  id: string;
  ticketNumber: string;
  title: string;
  priority: string;
  status: string;
};

export type InvoicePaymentSummary = {
  total: number;
  paid: number;
  remaining: number;
  invoiceCount: number;
};

const TONE_STYLES: Record<
  CustomerMetricTile["tone"],
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

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-rose-500",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-sky-400",
};

function usageBarColor(status: ContractUsageRow["status"]) {
  if (status === "over_limit") return "bg-rose-500";
  if (status === "warning") return "bg-amber-400";
  return "bg-emerald-500";
}

function MetricIcon({ tone }: { tone: CustomerMetricTile["tone"] }) {
  const cls = "h-4 w-4";
  if (tone === "sky") return <FileText className={cls} />;
  if (tone === "violet") return <FolderKanban className={cls} />;
  if (tone === "rose") return <AlertTriangle className={cls} />;
  return <Receipt className={cls} />;
}

export function CustomerHomeVisuals({
  fullName,
  invoiceBalance,
  year,
  metrics = [],
  supportStatusSlices = [],
  contracts = [],
  requests = [],
  invoicePayment = { total: 0, paid: 0, remaining: 0, invoiceCount: 0 },
}: {
  fullName: string;
  invoiceBalance: number;
  year: number;
  metrics?: CustomerMetricTile[];
  supportStatusSlices?: SupportStatusSlice[];
  contracts?: ContractUsageRow[];
  requests?: RequestChip[];
  invoicePayment?: InvoicePaymentSummary;
}) {
  const metricTiles = metrics ?? [];
  const statusSlices = supportStatusSlices ?? [];
  const contractRows = contracts ?? [];
  const requestRows = requests ?? [];
  const payment = invoicePayment ?? { total: 0, paid: 0, remaining: 0, invoiceCount: 0 };
  const paidPct =
    payment.total > 0
      ? Math.min(100, Math.max(0, (payment.paid / payment.total) * 100))
      : 0;

  return (
    <div className="flex min-h-0 flex-col gap-3 lg:h-[calc(100vh-7.5rem)]">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Customer Home</h1>
          <p className="text-sm opacity-70">Welcome back, {fullName}.</p>
        </div>
        <Link
          href="/my-invoices"
          className={
            invoiceBalance > 0
              ? "relative block min-w-[11rem] overflow-hidden rounded-2xl border border-rose-400/50 bg-gradient-to-br from-rose-500 to-rose-600 px-3 py-2.5 text-right text-white shadow-md shadow-rose-500/25 transition hover:brightness-110"
              : "relative block min-w-[11rem] overflow-hidden rounded-2xl border border-emerald-400/50 bg-gradient-to-br from-emerald-500 to-emerald-600 px-3 py-2.5 text-right text-white shadow-md shadow-emerald-500/25 transition hover:brightness-110"
          }
        >
          <div className="pointer-events-none absolute -right-4 -top-4 size-16 rounded-full bg-white/15" />
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/90">
            Invoice Balance Due
          </p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">
            {formatCurrency(invoiceBalance)}
          </p>
          <p className="text-[10px] text-white/85">
            {invoiceBalance > 0 ? "Tap to review & pay" : "You are all caught up"}
          </p>
        </Link>
      </div>

      <div className="grid shrink-0 gap-3 lg:grid-cols-12">
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
              <Link key={metric.label} href={metric.href} className={`${classes} transition hover:brightness-[0.98]`}>
                {body}
              </Link>
            ) : (
              <div key={metric.label} className={classes}>
                {body}
              </div>
            );
          })}
        </div>

        <div className="min-h-[11rem] lg:col-span-5">
          <CustomerSupportStatusChart data={statusSlices} year={year} compact />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-3">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/80 to-base-100">
          <h2 className="shrink-0 border-b border-emerald-200/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
            Contract Hours
          </h2>
          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
            {contractRows.length === 0 ? (
              <p className="text-sm opacity-60">No active contracts.</p>
            ) : (
              contractRows.slice(0, 4).map((c) => {
                const width = Math.min(100, Math.max(4, c.pct));
                return (
                  <Link key={c.id} href="/my-contracts" className="block space-y-1.5 rounded-xl p-1 hover:bg-emerald-100/40">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="shrink-0 tabular-nums opacity-70">
                        {c.used.toFixed(0)}/{c.included.toFixed(0)}h
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-emerald-900/10">
                      <div
                        className={`h-full rounded-full transition-all ${usageBarColor(c.status)}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <p className="text-[10px] opacity-60">
                      {Math.max(c.remaining, 0).toFixed(1)} hours remaining
                    </p>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-b from-sky-50/80 to-base-100">
          <h2 className="shrink-0 border-b border-sky-200/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-sky-900/80">
            Open Requests
          </h2>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
            {requestRows.length === 0 ? (
              <p className="text-sm opacity-60">No open requests.</p>
            ) : (
              requestRows.slice(0, 5).map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  className="flex items-start gap-2 rounded-xl border border-sky-100 bg-white/80 px-2.5 py-2 shadow-sm transition hover:border-sky-300"
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
                    <span className="mt-0.5 inline-block rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                      {statusLabel(t.status)}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50/80 to-base-100">
          <h2 className="shrink-0 border-b border-violet-200/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-900/80">
            Payments &amp; Invoices
          </h2>
          <div className="flex min-h-0 flex-1 flex-col p-3">
            {payment.invoiceCount === 0 ? (
              <p className="m-auto text-sm opacity-60">No invoices yet.</p>
            ) : (
              <Link
                href="/my-invoices"
                className="flex min-h-0 flex-1 flex-col gap-2 rounded-xl outline-none transition hover:bg-violet-100/40 focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <div className="flex shrink-0 items-baseline justify-between gap-2 px-1">
                  <p className="text-xs font-semibold text-violet-950">
                    <span className="tabular-nums text-emerald-700">{formatCurrency(payment.paid)}</span>
                    <span className="mx-1 font-normal opacity-50">of</span>
                    <span className="tabular-nums">{formatCurrency(payment.total)}</span>
                    <span className="ml-1 font-normal opacity-50">paid</span>
                  </p>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-emerald-700">
                    {paidPct.toFixed(0)}%
                  </p>
                </div>

                {/* Fundraiser-style thermometer: empty track = full total, green = paid */}
                <div
                  className="relative min-h-[4.5rem] w-full flex-1 overflow-hidden rounded-xl border-2 border-violet-200 bg-white"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(paidPct)}
                  aria-label={`${paidPct.toFixed(0)} percent of invoice total paid`}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-emerald-500 transition-[width] duration-700 ease-out"
                    style={{ width: `${paidPct}%` }}
                  />
                  {/* Goal tick marks */}
                  <div className="pointer-events-none absolute inset-0 flex">
                    {[25, 50, 75].map((tick) => (
                      <div
                        key={tick}
                        className="absolute inset-y-0 border-l border-dashed border-violet-300/70"
                        style={{ left: `${tick}%` }}
                      />
                    ))}
                  </div>
                  <div className="relative z-10 flex h-full items-center justify-between px-3 text-[11px] font-semibold">
                    <span
                      className={`rounded px-1.5 py-0.5 tabular-nums ${
                        paidPct > 18
                          ? "bg-emerald-600/20 text-white"
                          : "bg-white/80 text-emerald-800"
                      }`}
                    >
                      Paid {formatCurrency(payment.paid)}
                    </span>
                    <span className="rounded bg-white/80 px-1.5 py-0.5 tabular-nums text-violet-900">
                      Total {formatCurrency(payment.total)}
                    </span>
                  </div>
                </div>

                <p className="shrink-0 px-1 text-[11px] opacity-60">
                  Remaining balance {formatCurrency(payment.remaining)} · tap to view invoices
                </p>
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
