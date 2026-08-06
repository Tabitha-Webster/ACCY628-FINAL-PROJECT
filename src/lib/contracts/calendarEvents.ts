import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEvent } from "./calendarTypes";
import { getContractRenewalDate } from "./dates";
import { listContracts, listOpenRenewalReminders, unwrapCustomer, type ContractListRow } from "./queries";
import { isRenewableContract, reminderKindLabel, syncRemindersForContracts } from "./renewals";

/** Build renewal / expiration / reminder events for the Contracts Dashboard calendar table. */
export async function fetchContractCalendarEvents(supabase: SupabaseClient): Promise<{
  events: CalendarEvent[];
  error: { message: string } | null;
}> {
  const { data, error } = await listContracts(supabase);
  const contracts = (data ?? []) as ContractListRow[];

  if (error) {
    return { events: [], error: { message: error.message } };
  }

  if (contracts.length > 0) {
    await syncRemindersForContracts(
      supabase,
      contracts.map((c) => ({
        id: c.id,
        status: c.status,
        start_date: c.start_date,
        end_date: c.end_date,
        renewal_type: c.renewal_type,
      }))
    );
  }

  const remindersRes = await listOpenRenewalReminders(supabase);
  if (remindersRes.error) {
    return { events: [], error: { message: remindersRes.error.message } };
  }

  const events: CalendarEvent[] = [];

  for (const row of contracts) {
    if (row.status !== "active") continue;
    const customer = unwrapCustomer(row);
    if (row.end_date) {
      events.push({
        id: `exp-${row.id}`,
        date: row.end_date,
        kind: "expiration",
        label: `${row.name} ends`,
        contractId: row.id,
        contractNumber: row.contract_number,
        customerName: customer?.name ?? null,
      });
    }
    const renewalDate = getContractRenewalDate(row);
    if (renewalDate && isRenewableContract(row)) {
      events.push({
        id: `ren-${row.id}`,
        date: renewalDate,
        kind: "renewal",
        label: `${row.name} renewal decision (${row.renewal_type})`,
        contractId: row.id,
        contractNumber: row.contract_number,
        customerName: customer?.name ?? null,
      });
    }
  }

  for (const reminder of remindersRes.data ?? []) {
    const contractJoin = reminder.contracts as
      | {
          id: string;
          contract_number: string;
          name: string;
          customers: { id: string; name: string } | { id: string; name: string }[] | null;
        }
      | {
          id: string;
          contract_number: string;
          name: string;
          customers: { id: string; name: string } | { id: string; name: string }[] | null;
        }[]
      | null;
    const contract = Array.isArray(contractJoin) ? contractJoin[0] : contractJoin;
    const customerRaw = contract?.customers;
    const customer = Array.isArray(customerRaw) ? customerRaw[0] : customerRaw;
    events.push({
      id: `rem-${reminder.id}`,
      date: reminder.anchor_date,
      kind: "reminder",
      reminderKind: reminder.reminder_kind,
      label: reminder.message || reminderKindLabel(reminder.reminder_kind),
      contractId: reminder.contract_id,
      contractNumber: contract?.contract_number ?? "—",
      customerName: customer?.name ?? null,
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return { events, error: null };
}
