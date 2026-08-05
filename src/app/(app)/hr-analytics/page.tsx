import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { HrAnalyticsCharts } from "@/components/HrAnalyticsCharts";
import {
  DataTable,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/ui";
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
      <div className="space-y-6">
        <PageHeader title={pageTitle} description={pageDescription} />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const depts = (departments ?? []) as HrDepartment[];
  const pos = (positions ?? []) as HrPosition[];
  const contr = (contractors ?? []) as HrContractor[];

  if (depts.length === 0 && pos.length === 0 && contr.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={pageTitle} description={pageDescription} />
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

  return (
    <div className="space-y-6">
      <PageHeader title={pageTitle} description={pageDescription} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {showOps ? (
          <>
            <StatCard
              label="Active contractors"
              value={String(activeCount)}
              hint={`${depts.length} departments`}
            />
            <StatCard
              label="Open positions"
              value={String(statusCounts.open)}
              hint={`${statusCounts.filled} filled · ${statusCounts.closed} closed`}
              tone={statusCounts.open > 0 ? "warning" : "default"}
            />
            <StatCard
              label="Filled positions"
              value={String(statusCounts.filled)}
              hint={`${statusCounts.open + statusCounts.filled + statusCounts.closed} total roles`}
            />
            <StatCard
              label="Retention (12 mo)"
              value={retention != null ? `${(retention * 100).toFixed(1)}%` : "—"}
              hint="Still active among hires in last 12 months"
              tone={retention != null && retention < 0.7 ? "warning" : "success"}
            />
          </>
        ) : null}
        {showCost ? (
          <>
            <StatCard
              label="Cost per contractor"
              value={avgCost != null ? `$${Math.round(avgCost).toLocaleString("en-US")}` : "—"}
              hint="Average annual cost (active)"
            />
            <StatCard
              label="Budget utilization"
              value={utilization != null ? `${(utilization * 100).toFixed(1)}%` : "—"}
              hint={`${activeCost.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              })} of ${totalBudget.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              })}`}
              tone={utilization != null && utilization > 0.9 ? "warning" : "default"}
            />
            {variant === "cost" ? (
              <StatCard
                label="Active contractors"
                value={String(activeCount)}
                hint="Used for cost averages"
              />
            ) : null}
          </>
        ) : null}
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
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h2 className="mb-2 text-lg font-semibold">Headcount by department</h2>
            <DataTable headers={["Department", "Active contractors", "Annual budget"]}>
              {headcount.map((row) => {
                const dept = depts.find((d) => d.id === row.departmentId);
                return (
                  <tr key={row.departmentId}>
                    <td>{row.departmentName}</td>
                    <td className="tabular-nums">{row.activeCount}</td>
                    <td>
                      <Money value={Number(dept?.annual_budget ?? 0)} />
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </div>
          <div>
            <h2 className="mb-2 text-lg font-semibold">Cost averages by department</h2>
            <DataTable headers={["Department", "Active", "Avg annual cost"]}>
              {costByDept.map((row) => (
                <tr key={row.departmentId}>
                  <td>{row.departmentName}</td>
                  <td className="tabular-nums">{row.activeCount}</td>
                  <td>
                    <Money value={row.avgAnnualCost} />
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        </div>
      ) : null}

      {showOps && !showCost ? (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Headcount by department</h2>
          <DataTable headers={["Department", "Active contractors"]}>
            {headcount.map((row) => (
              <tr key={row.departmentId}>
                <td>{row.departmentName}</td>
                <td className="tabular-nums">{row.activeCount}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : null}

      {showCost && !showOps ? (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Cost averages by department</h2>
          <DataTable headers={["Department", "Active", "Avg annual cost", "Department budget"]}>
            {costByDept.map((row) => {
              const dept = depts.find((d) => d.id === row.departmentId);
              return (
                <tr key={row.departmentId}>
                  <td>{row.departmentName}</td>
                  <td className="tabular-nums">{row.activeCount}</td>
                  <td>
                    <Money value={row.avgAnnualCost} />
                  </td>
                  <td>
                    <Money value={Number(dept?.annual_budget ?? 0)} />
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      ) : null}

      {showOps ? (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Open vs filled positions</h2>
          <DataTable headers={["Status", "Count"]}>
            <tr>
              <td>
                <StatusBadge status="open" />
              </td>
              <td className="tabular-nums">{statusCounts.open}</td>
            </tr>
            <tr>
              <td>
                <StatusBadge status="filled" />
              </td>
              <td className="tabular-nums">{statusCounts.filled}</td>
            </tr>
            <tr>
              <td>
                <StatusBadge status="closed" />
              </td>
              <td className="tabular-nums">{statusCounts.closed}</td>
            </tr>
          </DataTable>
          <p className="mt-2 text-xs opacity-60">
            Retention is the share of contractors hired in the last 12 months who are still active.
          </p>
        </div>
      ) : null}
    </div>
  );
}
