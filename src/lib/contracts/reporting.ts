import type { Contract, ContractStatus, SupportTicket } from "@/lib/types";
import { daysUntilDate, isRenewableContract } from "./renewals";
import { CONTRACT_EXPIRY_WARNING_DAYS } from "./constants";
import { slaStatus, usagePercentage, usageStatus } from "@/lib/calculations";
import { billedMonthlyRecurringFee } from "./locationPricing";

export type ContractReportRow = Pick<
  Contract,
  | "id"
  | "contract_number"
  | "name"
  | "status"
  | "customer_id"
  | "start_date"
  | "end_date"
  | "renewal_type"
  | "monthly_recurring_fee"
  | "work_location"
  | "included_hours_per_month"
  | "billing_frequency"
>;

export type HoursUsageRow = {
  contractId: string;
  hoursUsed: number;
};

export type SlaTicketRow = Pick<
  SupportTicket,
  | "id"
  | "contract_id"
  | "target_response_at"
  | "target_resolution_at"
  | "actual_response_at"
  | "completed_at"
  | "status"
>;

export type ContractReportMetrics = {
  activeContracts: number;
  expiringContracts: number;
  renewalsDue: number;
  monthlyRecurringRevenue: number;
  annualContractValue: number;
  slaCompliancePct: number | null;
  slaMet: number;
  slaMissed: number;
  slaAtRisk: number;
  slaPending: number;
  supportHoursUtilizationPct: number | null;
  totalIncludedHours: number;
  totalUsedHours: number;
  contractsOverHours: number;
  contractsNearHours: number;
  byStatus: Record<ContractStatus, number>;
  expiringList: Array<ContractReportRow & { daysUntilEnd: number | null }>;
  renewalsList: Array<ContractReportRow & { daysUntilRenewal: number | null }>;
  utilizationList: Array<
    ContractReportRow & {
      hoursUsed: number;
      utilizationPct: number;
      usage: "normal" | "warning" | "over_limit";
    }
  >;
};

function emptyStatusCounts(): Record<ContractStatus, number> {
  return {
    draft: 0,
    pending_approval: 0,
    active: 0,
    on_hold: 0,
    expired: 0,
    canceled: 0,
    renewed: 0,
  };
}

function ticketOutcome(ticket: SlaTicketRow, now: Date) {
  const response = slaStatus(ticket.target_response_at, ticket.actual_response_at, now);
  const resolution = slaStatus(ticket.target_resolution_at, ticket.completed_at, now);
  if (response === "missed" || resolution === "missed") return "missed" as const;
  if (response === "at_risk" || resolution === "at_risk") return "at_risk" as const;
  if (response === "met" || resolution === "met") return "met" as const;
  return "pending" as const;
}

/**
 * Aggregate widgets for Contracts reporting / dashboards.
 * ACV = MRR × 12 for active (and on-hold) agreements.
 */
export function buildContractReportMetrics(input: {
  contracts: ContractReportRow[];
  hoursUsage?: HoursUsageRow[];
  tickets?: SlaTicketRow[];
  now?: Date;
  expiryWindowDays?: number;
}): ContractReportMetrics {
  const now = input.now ?? new Date();
  const windowDays = input.expiryWindowDays ?? CONTRACT_EXPIRY_WARNING_DAYS;
  const hoursByContract = new Map(
    (input.hoursUsage ?? []).map((row) => [row.contractId, row.hoursUsed])
  );

  const byStatus = emptyStatusCounts();
  for (const c of input.contracts) {
    if (c.status in byStatus) byStatus[c.status] += 1;
  }

  const activeLike = input.contracts.filter(
    (c) => c.status === "active" || c.status === "on_hold"
  );
  const activeContracts = input.contracts.filter((c) => c.status === "active").length;

  const monthlyRecurringRevenue = activeLike.reduce(
    (sum, c) => sum + billedMonthlyRecurringFee(c),
    0
  );
  const annualContractValue = monthlyRecurringRevenue * 12;

  const expiringList = activeLike
    .map((c) => {
      const daysUntilEnd = daysUntilDate(c.end_date, now);
      return { ...c, daysUntilEnd };
    })
    .filter(
      (c) =>
        c.daysUntilEnd != null && c.daysUntilEnd >= 0 && c.daysUntilEnd <= windowDays
    )
    .sort((a, b) => (a.daysUntilEnd ?? 0) - (b.daysUntilEnd ?? 0));

  const renewalsList = activeLike
    .filter((c) => isRenewableContract(c))
    .map((c) => {
      const daysUntilRenewal = daysUntilDate(c.end_date, now);
      return { ...c, daysUntilRenewal };
    })
    .filter(
      (c) =>
        c.daysUntilRenewal != null &&
        c.daysUntilRenewal >= 0 &&
        c.daysUntilRenewal <= windowDays
    )
    .sort((a, b) => (a.daysUntilRenewal ?? 0) - (b.daysUntilRenewal ?? 0));

  let slaMet = 0;
  let slaMissed = 0;
  let slaAtRisk = 0;
  let slaPending = 0;
  for (const ticket of input.tickets ?? []) {
    if (!ticket.contract_id) continue;
    const outcome = ticketOutcome(ticket, now);
    if (outcome === "met") slaMet += 1;
    else if (outcome === "missed") slaMissed += 1;
    else if (outcome === "at_risk") slaAtRisk += 1;
    else slaPending += 1;
  }
  const slaDecided = slaMet + slaMissed;
  const slaCompliancePct = slaDecided > 0 ? (slaMet / slaDecided) * 100 : null;

  const utilizationList = activeLike.map((c) => {
    const hoursUsed = hoursByContract.get(c.id) ?? 0;
    const included = Number(c.included_hours_per_month ?? 0);
    const utilizationPct = usagePercentage(hoursUsed, included);
    return {
      ...c,
      hoursUsed,
      utilizationPct,
      usage: usageStatus(utilizationPct),
    };
  });

  const totalIncludedHours = utilizationList.reduce(
    (sum, c) => sum + Number(c.included_hours_per_month ?? 0),
    0
  );
  const totalUsedHours = utilizationList.reduce((sum, c) => sum + c.hoursUsed, 0);
  const supportHoursUtilizationPct =
    totalIncludedHours > 0 ? (totalUsedHours / totalIncludedHours) * 100 : null;

  return {
    activeContracts,
    expiringContracts: expiringList.length,
    renewalsDue: renewalsList.length,
    monthlyRecurringRevenue,
    annualContractValue,
    slaCompliancePct,
    slaMet,
    slaMissed,
    slaAtRisk,
    slaPending,
    supportHoursUtilizationPct,
    totalIncludedHours,
    totalUsedHours,
    contractsOverHours: utilizationList.filter((c) => c.usage === "over_limit").length,
    contractsNearHours: utilizationList.filter((c) => c.usage === "warning").length,
    byStatus,
    expiringList,
    renewalsList,
    utilizationList: utilizationList
      .slice()
      .sort((a, b) => b.utilizationPct - a.utilizationPct),
  };
}
