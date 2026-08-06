"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  ClipboardCheck,
  FileWarning,
  Receipt,
  Scale,
} from "lucide-react";
import { ExplainNumber, type MetricExplanation } from "@/components/ExplainNumber";
import { formatCurrency } from "@/lib/format";

export type BillingMetricTile = {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  tone: "sky" | "violet" | "amber" | "rose" | "emerald" | "slate";
  explanation?: MetricExplanation;
};

export type AgingBar = {
  bucket: string;
  total: number;
  count: number;
};

export type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  amount?: string;
  href: string;
  severity: "warning" | "error" | "info";
};

const TONE_STYLES: Record<
  BillingMetricTile["tone"],
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
  slate: {
    card: "border-slate-300/60 bg-gradient-to-br from-slate-50 to-slate-100/80",
    icon: "bg-slate-500/15 text-slate-700",
    value: "text-slate-900",
  },
};

const AGING_COLORS: Record<string, string> = {
  Current: "#22c55e",
  "1-30 Days": "#eab308",
  "31-60 Days": "#f97316",
  "61-90 Days": "#ef4444",
  ">90 Days": "#be123c",
};

function MetricIcon({ tone }: { tone: BillingMetricTile["tone"] }) {
  const cls = "h-4 w-4";
  if (tone === "amber") return <ClipboardCheck className={cls} />;
  if (tone === "rose") return <AlertTriangle className={cls} />;
  if (tone === "emerald") return <Banknote className={cls} />;
  if (tone === "violet") return <Scale className={cls} />;
  if (tone === "sky") return <Receipt className={cls} />;
  return <FileWarning className={cls} />;
}

export function BillingHomeVisuals({
  fullName,
  periodLabel,
  periodActions,
  statusBits,
  metrics,
  aging,
  attention,
  collection,
}: {
  fullName: string;
  periodLabel: string;
  periodActions: ReactNode;
  statusBits: string[];
  metrics: BillingMetricTile[];
  aging: AgingBar[];
  attention: AttentionItem[];
  collection: { billed: number; collected: number; outstanding: number };
}) {
  const agingMax = Math.max(...aging.map((row) => row.total), 1);
  const collectedPct =
    collection.billed > 0
      ? Math.min(100, Math.max(0, (collection.collected / collection.billed) * 100))
      : 0;

  return (
    <div className="flex min-h-0 flex-col gap-3 lg:h-[calc(100vh-7.5rem)]">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Billing Dashboard</h1>
          <p className="text-sm opacity-70">
            Welcome back, {fullName}. Showing {periodLabel}.
          </p>
        </div>
        <div className="shrink-0">{periodActions}</div>
      </div>

      {statusBits.length > 0 ? (
        <ul className="flex shrink-0 flex-wrap items-center gap-2">
          {statusBits.map((bit) => (
            <li
              key={bit}
              className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-950"
            >
              {bit}
            </li>
          ))}
        </ul>
      ) : (
        <p className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 w-fit">
          No billing exceptions in {periodLabel}
        </p>
      )}

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => {
          const tone = TONE_STYLES[metric.tone] ?? TONE_STYLES.slate;
          const classes = `rounded-2xl border p-3 shadow-sm ${tone.card}`;
          return (
            <div key={metric.label} className={classes}>
              <div className="flex items-start justify-between gap-2">
                {metric.href ? (
                  <Link
                    href={metric.href}
                    className="text-[10px] font-semibold uppercase tracking-wide opacity-70 link link-hover"
                  >
                    {metric.label}
                  </Link>
                ) : (
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                    {metric.label}
                  </p>
                )}
                <span className={`rounded-lg p-1.5 ${tone.icon}`}>
                  <MetricIcon tone={metric.tone} />
                </span>
              </div>
              {metric.href ? (
                <Link href={metric.href} className={`mt-1 block text-xl font-semibold tabular-nums ${tone.value}`}>
                  {metric.value}
                </Link>
              ) : (
                <p className={`mt-1 text-xl font-semibold tabular-nums ${tone.value}`}>{metric.value}</p>
              )}
              {metric.hint ? <p className="mt-0.5 text-[10px] opacity-60">{metric.hint}</p> : null}
              {metric.explanation ? <ExplainNumber explanation={metric.explanation} /> : null}
            </div>
          );
        })}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-3">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/70 to-base-100 lg:col-span-1">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-emerald-200/70 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
              AR Aging
            </h2>
            <Link href="/accounts-receivable" className="text-[11px] font-medium text-emerald-800 link link-hover">
              Open AR →
            </Link>
          </div>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-auto p-3">
            {aging.every((row) => row.total <= 0) ? (
              <p className="text-sm opacity-60">No open receivables in this period.</p>
            ) : (
              aging.map((row) => {
                const width = Math.max(row.total > 0 ? 6 : 0, (row.total / agingMax) * 100);
                const fill = AGING_COLORS[row.bucket] ?? "#64748b";
                return (
                  <div key={row.bucket} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium">{row.bucket}</span>
                      <span className="tabular-nums opacity-70">
                        {formatCurrency(row.total)} · {row.count}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-emerald-900/10">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${width}%`, backgroundColor: fill }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50/70 to-base-100">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-violet-200/70 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-violet-900/80">
              Collections thermometer
            </h2>
            <Link href="/payments" className="text-[11px] font-medium text-violet-800 link link-hover">
              Payments →
            </Link>
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 p-3">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
                  Collected of billed
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-violet-950">
                  {formatCurrency(collection.collected)}
                  <span className="mx-1 text-sm font-normal opacity-50">of</span>
                  <span className="text-sm font-medium opacity-70">
                    {formatCurrency(collection.billed)}
                  </span>
                </p>
              </div>
              <p className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-bold tabular-nums text-emerald-800">
                {collectedPct.toFixed(0)}%
              </p>
            </div>

            <div
              className="relative min-h-[4rem] w-full flex-1 overflow-hidden rounded-xl border-2 border-violet-200 bg-white"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(collectedPct)}
            >
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-emerald-500 transition-[width] duration-700 ease-out"
                style={{ width: `${collectedPct}%` }}
              />
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
                    collectedPct > 18 ? "bg-emerald-600/20 text-white" : "bg-white/80 text-emerald-800"
                  }`}
                >
                  Collected {formatCurrency(collection.collected)}
                </span>
                <span className="rounded bg-white/80 px-1.5 py-0.5 tabular-nums text-violet-900">
                  Outstanding {formatCurrency(collection.outstanding)}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50/70 to-base-100">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-200/70 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-950/80">
              Needs attention
            </h2>
            <Link href="/billing-review" className="text-[11px] font-medium text-amber-900 link link-hover">
              Overview →
            </Link>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
            {attention.length === 0 ? (
              <div className="flex h-full min-h-[6rem] flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300/70 bg-emerald-50/50 px-3 text-center">
                <p className="text-sm font-medium text-emerald-800">All clear</p>
                <p className="text-xs text-emerald-700/80">Nothing blocking billing right now</p>
              </div>
            ) : (
              attention.slice(0, 6).map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`block rounded-xl border px-2.5 py-2 shadow-sm transition hover:brightness-[0.98] ${
                    item.severity === "error"
                      ? "border-rose-200 bg-rose-50/80"
                      : item.severity === "warning"
                        ? "border-amber-200 bg-white/80"
                        : "border-sky-200 bg-sky-50/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{item.title}</p>
                      <p className="truncate text-[11px] opacity-70">{item.detail}</p>
                    </div>
                    {item.amount ? (
                      <span className="shrink-0 text-xs font-semibold tabular-nums">{item.amount}</span>
                    ) : null}
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
