import Link from "next/link";
import { ContractRenewalCalendar } from "@/components/ContractRenewalCalendar";
import { EmptyState, StatCard, StatusBadge } from "@/components/ui";
import { formatCurrency, formatDate, statusLabel } from "@/lib/format";
import type { CalendarEvent, ContractReportMetrics } from "@/lib/contracts";

type Props = {
  metrics: ContractReportMetrics;
  calendarEvents?: CalendarEvent[];
  showTables?: boolean;
  title?: string | null;
  linkToFullReport?: boolean;
};

export function ContractMetricsWidgets({
  metrics,
  calendarEvents = [],
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
              Open Contracts Dashboard →
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Monthly recurring revenue"
          value={formatCurrency(metrics.monthlyRecurringRevenue)}
          hint={`≈ ${formatCurrency(metrics.annualContractValue)} ACV`}
        />
        <StatCard
          label="At risk this quarter"
          value={String(metrics.expiringContracts + metrics.renewalsDue)}
          tone={
            metrics.expiringContracts > 0 || metrics.renewalsDue > 0 ? "warning" : "default"
          }
          hint={`${metrics.expiringContracts} expiring · ${metrics.renewalsDue} renewals (90 days)`}
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
          label="Hours pressure"
          value={String(metrics.contractsOverHours)}
          tone={
            metrics.contractsOverHours > 0
              ? "error"
              : metrics.contractsNearHours > 0 ||
                  (metrics.supportHoursUtilizationPct != null &&
                    metrics.supportHoursUtilizationPct >= 80)
                ? "warning"
                : "success"
          }
          hint={
            metrics.supportHoursUtilizationPct == null
              ? `${metrics.contractsNearHours} near limit`
              : `${metrics.supportHoursUtilizationPct.toFixed(0)}% utilized · ${metrics.contractsNearHours} near limit`
          }
        />
      </div>

      {showTables ? (
        <div className="space-y-3">
          <ContractRenewalCalendar events={calendarEvents} />

          <ExpandableReportTable
            title="Expiring contracts"
            titleBadgeClass="badge-error"
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
            titleBadgeClass="badge-warning"
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
            headers={["Contract", "Hours used / included this month", "Utilization %"]}
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
  titleBadgeClass,
  count,
  empty,
  headers,
  rows,
}: {
  title: string;
  titleBadgeClass?: string;
  count: number;
  empty: string;
  headers: string[];
  rows: React.ReactNode[];
}) {
  return (
    <div className="collapse collapse-arrow rounded-box border border-base-300 bg-base-100">
      <input type="checkbox" aria-label={`Expand ${title}`} />
      <div className="collapse-title min-h-0 py-3 text-sm font-semibold">
        {titleBadgeClass ? (
          <span
            className={`badge h-auto max-w-full whitespace-normal px-2.5 py-1 text-left text-[0.75rem] font-semibold leading-snug ${titleBadgeClass}`}
          >
            {title}
          </span>
        ) : (
          title
        )}
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
