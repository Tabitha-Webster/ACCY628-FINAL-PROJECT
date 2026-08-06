import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildContractReportMetrics,
  type ContractReportMetrics,
  type ContractReportRow,
  type SlaTicketRow,
} from "./reporting";

/**
 * Load contracts, current-month included hours, and SLA tickets for reporting widgets.
 */
export async function fetchContractReportMetrics(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<{ metrics: ContractReportMetrics; error: Error | null }> {
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

  const [contractsRes, hoursRes, ticketsRes] = await Promise.all([
    supabase
      .from("contracts")
      .select(
        "id, contract_number, name, status, customer_id, start_date, end_date, renewal_type, monthly_recurring_fee, work_location, included_hours_per_month, billing_frequency"
      )
      .order("name"),
    supabase
      .from("time_entries")
      .select("contract_id, hours_worked")
      .eq("classification", "included")
      .gte("work_date", monthStart)
      .lt("work_date", monthEnd),
    supabase
      .from("support_tickets")
      .select(
        "id, contract_id, target_response_at, target_resolution_at, actual_response_at, completed_at, status"
      )
      .not("contract_id", "is", null)
      .gte("submitted_at", monthStart),
  ]);

  const error = contractsRes.error ?? hoursRes.error ?? ticketsRes.error;
  if (error) {
    return { metrics: buildContractReportMetrics({ contracts: [] }), error: new Error(error.message) };
  }

  const hoursMap = new Map<string, number>();
  for (const row of hoursRes.data ?? []) {
    if (!row.contract_id) continue;
    hoursMap.set(
      row.contract_id,
      (hoursMap.get(row.contract_id) ?? 0) + Number(row.hours_worked ?? 0)
    );
  }

  const metrics = buildContractReportMetrics({
    contracts: (contractsRes.data ?? []) as ContractReportRow[],
    hoursUsage: Array.from(hoursMap.entries()).map(([contractId, hoursUsed]) => ({
      contractId,
      hoursUsed,
    })),
    tickets: (ticketsRes.data ?? []) as SlaTicketRow[],
    now,
  });

  return { metrics, error: null };
}
