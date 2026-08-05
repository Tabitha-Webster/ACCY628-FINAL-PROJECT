import Link from "next/link";
import { EmptyState, StatCard, StatusBadge } from "@/components/ui";
import { formatCurrency, formatDate, statusLabel } from "@/lib/format";
import type { ContractReportMetrics } from "@/lib/contracts";

type Props = {
  metrics: ContractReportMetrics;
  showTables?: boolean;
  title?: string | null;
  linkToFullReport?: boolean;
};

export function ContractMetricsWidgets({
  metrics,
  showTables = true,
  title = "Contracts reporting",
  linkToFullReport = true,
}: Props) {
  return (
    <div className="space-y-6">
      {title ? (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">{title}</h2>
          {linkToFullReport ? (
            <Link href="/contracts/reports" className="link link-hover text-sm">
              Open full report →
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Active contracts" value={String(metrics.activeContracts)} />
        <StatCard
          label="Expiring contracts"
          value={String(metrics.expiringContracts)}
          tone={metrics.expiringContracts > 0 ? "warning" : "default"}
          hint="Within 90 days"
        />
        <StatCard
          label="Renewals due"
          value={String(metrics.renewalsDue)}
          tone={metrics.renewalsDue > 0 ? "warning" : "default"}
          hint="Within 90 days"
        />
        <StatCard
          label="Monthly recurring revenue"
          value={formatCurrency(metrics.monthlyRecurringRevenue)}
        />
        <StatCard
          label="Annual contract value"
          value={formatCurrency(metrics.annualContractValue)}
          hint="MRR × 12"
        />
        <StatCard
          label="SLA compliance"
          value={
            metrics.slaCompliancePct == null ? "—" : `${metrics.slaCompliancePct.toFixed(0)}%`
          }
          tone={
            metrics.slaCompliancePct == null
              ? "default"
              : metrics.slaCompliancePct >= 90
                ? "success"
                : metrics.slaCompliancePct >= 75
                  ? "warning"
                  : "error"
          }
          hint={`${metrics.slaMet} met · ${metrics.slaMissed} missed · ${metrics.slaAtRisk} at risk`}
        />
        <StatCard
          label="Support hours utilization"
          value={
            metrics.supportHoursUtilizationPct == null
              ? "—"
              : `${metrics.supportHoursUtilizationPct.toFixed(0)}%`
          }
          tone={
            metrics.contractsOverHours > 0
              ? "warning"
              : metrics.supportHoursUtilizationPct != null &&
                  metrics.supportHoursUtilizationPct >= 80
                ? "warning"
                : "default"
          }
          hint={`${metrics.totalUsedHours.toFixed(1)} / ${metrics.totalIncludedHours.toFixed(1)} hrs`}
        />
        <StatCard
          label="Over hours"
          value={String(metrics.contractsOverHours)}
          tone={metrics.contractsOverHours > 0 ? "error" : "success"}
          hint={`${metrics.contractsNearHours} near limit`}
        />
      </div>

      {showTables ? (
        <div className="space-y-3">
          <ExpandableReportTable
            title="Expiring contracts"
            count={metrics.expiringContracts}
            empty="No contracts expiring in the next 90 days."
            headers={["Contract", "End", "Days"]}
            rows={metrics.expiringList.slice(0, 8).map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/contracts/${row.id}`} className="link link-hover font-medium">
                    {row.contract_number}
                  </Link>
                  <div className="text-xs opacity-60">{row.name}</div>
                </td>
                <td className="text-xs whitespace-nowrap">{formatDate(row.end_date)}</td>
                <td className="text-xs tabular-nums">{row.daysUntilEnd ?? "—"}</td>
              </tr>
            ))}
          />

          <ExpandableReportTable
            title="Renewals due"
            count={metrics.renewalsDue}
            empty="No renewals due in the next 90 days."
            headers={["Contract", "Renewal", "Type"]}
            rows={metrics.renewalsList.slice(0, 8).map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/contracts/${row.id}`} className="link link-hover font-medium">
                    {row.contract_number}
                  </Link>
                </td>
                <td className="text-xs whitespace-nowrap">
                  {formatDate(row.end_date)}
                  <div className="opacity-60">{row.daysUntilRenewal}d</div>
                </td>
                <td className="text-xs">{statusLabel(String(row.renewal_type ?? "none"))}</td>
              </tr>
            ))}
          />

          <ExpandableReportTable
            title="Support hours utilization"
            count={metrics.utilizationList.length}
            empty="No active contracts with hour pools."
            headers={["Contract", "Used", "Util."]}
            rows={metrics.utilizationList.slice(0, 8).map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/contracts/${row.id}`} className="link link-hover font-medium">
                    {row.contract_number}
                  </Link>
                </td>
                <td className="text-xs">
                  {row.hoursUsed.toFixed(1)} / {Number(row.included_hours_per_month).toFixed(1)}
                </td>
                <td>
                  <StatusBadge status={row.usage} label={`${row.utilizationPct.toFixed(0)}%`} />
                </td>
              </tr>
            ))}
          />
        </div>
      ) : null}
    </div>
  );
}

function ExpandableReportTable({
  title,
  count,
  empty,
  headers,
  rows,
}: {
  title: string;
  count: number;
  empty: string;
  headers: string[];
  rows: React.ReactNode[];
}) {
  return (
    <div className="collapse collapse-arrow rounded-box border border-base-300 bg-base-100">
      <input type="checkbox" aria-label={`Expand ${title}`} />
      <div className="collapse-title min-h-0 py-3 text-sm font-semibold">
        {title}
        <span className="ml-2 font-normal opacity-50">({count})</span>
      </div>
      <div className="collapse-content px-4 pb-4">
        {rows.length === 0 ? (
          <EmptyState title={empty} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>{rows}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
