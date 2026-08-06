import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  Briefcase,
  DollarSign,
  Percent,
  UserCheck,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { HrAnalyticsCharts } from "@/components/HrAnalyticsCharts";
import { EmptyState, ErrorState, Money, StatusBadge } from "@/components/ui";
import {
  averageCostByDepartment,
  averageCostPerContractor,
  budgetUtilization,
  contractorRetentionRate,
  contractorsByDepartment,
  hiringTrends,
  positionStatusCounts,
} from "@/lib/hr-calculations";
import type { HrContractor, HrDepartment, HrPosition } from "@/lib/types";

const TONE = {
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
  emerald: {
    card: "border-emerald-300/60 bg-gradient-to-br from-emerald-50 to-emerald-100/80",
    icon: "bg-emerald-500/15 text-emerald-700",
    value: "text-emerald-900",
  },
  rose: {
    card: "border-rose-300/70 bg-gradient-to-br from-rose-50 to-rose-100/90",
    icon: "bg-rose-500/15 text-rose-700",
    value: "text-rose-900",
  },
} as const;

function MetricTile({
  label,
  value,
  tone,
  icon,
  hint,
}: {
  label: string;
  value: string;
  tone: keyof typeof TONE;
  icon: ReactNode;
  hint?: string;
}) {
  const styles = TONE[tone];
  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${styles.card}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
        <span className={`rounded-lg p-1.5 ${styles.icon}`}>{icon}</span>
      </div>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${styles.value}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] opacity-60">{hint}</p> : null}
    </div>
  );
}

function TintedPanel({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "sky" | "violet" | "amber" | "emerald";
  children: ReactNode;
}) {
  const shell =
    tone === "violet"
      ? "border-violet-200/80 from-violet-50/80"
      : tone === "amber"
        ? "border-amber-200/80 from-amber-50/80"
        : tone === "emerald"
          ? "border-emerald-200/80 from-emerald-50/80"
          : "border-sky-200/80 from-sky-50/80";
  const header =
    tone === "violet"
      ? "border-violet-200/70 text-violet-900/80"
      : tone === "amber"
        ? "border-amber-200/70 text-amber-900/80"
        : tone === "emerald"
          ? "border-emerald-200/70 text-emerald-900/80"
          : "border-sky-200/70 text-sky-900/80";
  return (
    <section className={`overflow-hidden rounded-2xl border bg-gradient-to-b to-base-100 shadow-sm ${shell}`}>
      <div className={`border-b px-3 py-2 ${header}`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export default async function HrAnalyticsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "hr" && profile.role !== "manager" && profile.role !== "billing") {
    redirect("/dashboard");
  }

  const variant = profile.role === "billing" ? "cost" : profile.role === "manager" ? "ops" : "full";
  const showOps = variant === "full" || variant === "ops";
  const showCost = variant === "full" || variant === "cost";

  const supabase = await createClient();

  const [
    { data: departments, error: deptError },
    { data: positions, error: posError },
    { data: contractors, error: contrError },
  ] = await Promise.all([
    supabase.from("hr_departments").select("*").order("name"),
    supabase.from("hr_positions").select("*"),
    supabase.from("hr_contractors").select("*"),
  ]);

  const error = deptError || posError || contrError;
  const pageTitle = variant === "cost" ? "HR Cost Analytics" : "HR Analytics";
  const pageDescription =
    variant === "cost"
      ? "Contractor cost and department budget utilization."
      : variant === "ops"
        ? "Contractor headcount, open roles, hiring trends, and retention."
        : "Contractor headcount by department, open vs filled roles, hiring trends, cost, budget utilization, and retention.";

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{pageTitle}</h1>
        <ErrorState message={error.message} />
      </div>
    );
  }

  const depts = (departments ?? []) as HrDepartment[];
  const pos = (positions ?? []) as HrPosition[];
  const contr = (contractors ?? []) as HrContractor[];

  if (depts.length === 0 && pos.length === 0 && contr.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{pageTitle}</h1>
        <p className="text-sm opacity-70">{pageDescription}</p>
        <EmptyState
          title="No HR data yet"
          description="Departments, positions, and contractors will appear here once seeded."
        />
      </div>
    );
  }

  const headcount = contractorsByDepartment(contr, depts);
  const statusCounts = positionStatusCounts(pos);
  const trends = hiringTrends(contr, 12);
  const avgCost = averageCostPerContractor(contr);
  const costByDept = averageCostByDepartment(contr, depts);
  const utilization = budgetUtilization(contr, depts);
  const retention = contractorRetentionRate(contr, 12);
  const activeCount = contr.filter((c) => c.status === "active").length;
  const totalBudget = depts.reduce((acc, d) => acc + Number(d.annual_budget ?? 0), 0);
  const activeCost = contr
    .filter((c) => c.status === "active")
    .reduce((acc, c) => acc + Number(c.annual_cost ?? 0), 0);

  const metrics: {
    label: string;
    value: string;
    tone: keyof typeof TONE;
    icon: ReactNode;
    hint?: string;
  }[] = [];

  if (showOps) {
    metrics.push(
      {
        label: "Active contractors",
        value: String(activeCount),
        tone: "sky",
        icon: <Users className="h-4 w-4" />,
        hint: `${depts.length} departments`,
      },
      {
        label: "Open positions",
        value: String(statusCounts.open),
        tone: statusCounts.open > 0 ? "amber" : "emerald",
        icon: <Briefcase className="h-4 w-4" />,
        hint: `${statusCounts.filled} filled · ${statusCounts.closed} closed`,
      },
      {
        label: "Filled positions",
        value: String(statusCounts.filled),
        tone: "violet",
        icon: <UserCheck className="h-4 w-4" />,
        hint: `${statusCounts.open + statusCounts.filled + statusCounts.closed} total roles`,
      },
      {
        label: "Retention (12 mo)",
        value: retention != null ? `${(retention * 100).toFixed(1)}%` : "—",
        tone: retention != null && retention < 0.7 ? "rose" : "emerald",
        icon: <Percent className="h-4 w-4" />,
        hint: "Still active among recent hires",
      }
    );
  }
  if (showCost) {
    metrics.push(
      {
        label: "Cost per contractor",
        value: avgCost != null ? `$${Math.round(avgCost).toLocaleString("en-US")}` : "—",
        tone: "emerald",
        icon: <DollarSign className="h-4 w-4" />,
        hint: "Average annual cost (active)",
      },
      {
        label: "Budget utilization",
        value: utilization != null ? `${(utilization * 100).toFixed(1)}%` : "—",
        tone: utilization != null && utilization > 0.9 ? "amber" : "sky",
        icon: <Percent className="h-4 w-4" />,
        hint: `${activeCost.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        })} of ${totalBudget.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        })}`,
      }
    );
    if (variant === "cost") {
      metrics.push({
        label: "Active contractors",
        value: String(activeCount),
        tone: "violet",
        icon: <Users className="h-4 w-4" />,
        hint: "Used for cost averages",
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0 space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{pageTitle}</h1>
        <p className="text-sm opacity-70">{pageDescription}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {metrics.map((m) => (
          <MetricTile key={m.label} {...m} />
        ))}
      </div>

      <HrAnalyticsCharts
        variant={variant}
        headcountByDept={headcount.map((h) => ({
          departmentName: h.departmentName,
          activeCount: h.activeCount,
        }))}
        hiringTrends={trends.map((t) => ({ label: t.label, hires: t.hires }))}
        costByDept={costByDept.map((c) => ({
          departmentName: c.departmentName,
          avgAnnualCost: c.avgAnnualCost,
        }))}
      />

      {showOps && showCost ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <TintedPanel title="Headcount by department" tone="sky">
            <ul className="space-y-2">
              {headcount.map((row) => {
                const dept = depts.find((d) => d.id === row.departmentId);
                return (
                  <li
                    key={row.departmentId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-100 bg-white/85 px-3 py-2.5 shadow-sm"
                  >
                    <span className="text-sm font-semibold">{row.departmentName}</span>
                    <span className="text-[11px] opacity-70">
                      <span className="font-semibold tabular-nums text-sky-950">{row.activeCount}</span>
                      {" active · "}
                      <Money value={Number(dept?.annual_budget ?? 0)} /> budget
                    </span>
                  </li>
                );
              })}
            </ul>
          </TintedPanel>
          <TintedPanel title="Cost averages by department" tone="emerald">
            <ul className="space-y-2">
              {costByDept.map((row) => (
                <li
                  key={row.departmentId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-white/85 px-3 py-2.5 shadow-sm"
                >
                  <span className="text-sm font-semibold">{row.departmentName}</span>
                  <span className="text-[11px] opacity-70">
                    <span className="tabular-nums">{row.activeCount}</span> active · avg{" "}
                    <span className="font-semibold text-emerald-950">
                      <Money value={row.avgAnnualCost} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </TintedPanel>
        </div>
      ) : null}

      {showOps && !showCost ? (
        <TintedPanel title="Headcount by department" tone="sky">
          <ul className="space-y-2">
            {headcount.map((row) => (
              <li
                key={row.departmentId}
                className="flex items-center justify-between gap-2 rounded-xl border border-sky-100 bg-white/85 px-3 py-2.5 shadow-sm"
              >
                <span className="text-sm font-semibold">{row.departmentName}</span>
                <span className="font-semibold tabular-nums text-sky-950">{row.activeCount}</span>
              </li>
            ))}
          </ul>
        </TintedPanel>
      ) : null}

      {showCost && !showOps ? (
        <TintedPanel title="Cost averages by department" tone="emerald">
          <ul className="space-y-2">
            {costByDept.map((row) => {
              const dept = depts.find((d) => d.id === row.departmentId);
              return (
                <li
                  key={row.departmentId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-white/85 px-3 py-2.5 shadow-sm"
                >
                  <span className="text-sm font-semibold">{row.departmentName}</span>
                  <span className="text-[11px] opacity-70">
                    <span className="tabular-nums">{row.activeCount}</span> · avg{" "}
                    <Money value={row.avgAnnualCost} /> · budget{" "}
                    <Money value={Number(dept?.annual_budget ?? 0)} />
                  </span>
                </li>
              );
            })}
          </ul>
        </TintedPanel>
      ) : null}

      {showOps ? (
        <TintedPanel title="Open vs filled positions" tone="amber">
          <ul className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ["open", statusCounts.open],
                ["filled", statusCounts.filled],
                ["closed", statusCounts.closed],
              ] as const
            ).map(([status, count]) => (
              <li
                key={status}
                className="flex items-center justify-between gap-2 rounded-xl border border-amber-100 bg-white/85 px-3 py-2.5 shadow-sm"
              >
                <StatusBadge status={status} />
                <span className="text-lg font-semibold tabular-nums text-amber-950">{count}</span>
              </li>
            ))}
          </ul>
        </TintedPanel>
      ) : null}
    </div>
  );
}
