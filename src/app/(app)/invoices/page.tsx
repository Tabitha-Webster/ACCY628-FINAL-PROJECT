import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ErrorState, PageHeader } from "@/components/ui";
import { InvoiceListClient, type InvoiceListRow } from "@/components/InvoiceListClient";
import { deriveInvoiceStatus, todayDateString } from "@/lib/billing";
import {
  computeInvoiceListTotal,
  contractAgreementFee,
  invoiceGainLossVersusContractFee,
  type InvoiceTicketRef,
} from "@/lib/invoice-tickets";

export default async function InvoicesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, invoice_date, due_date, status, subtotal, tax_amount, total_amount, amount_paid, remaining_balance, billing_period_start, billing_period_end, dispute_status, customers(name), contracts(id, name, monthly_recurring_fee, work_location, included_hours_per_month, additional_hourly_rate)"
    )
    .order("invoice_date", { ascending: false });

  const today = todayDateString();
  const overdueIds = (invoices ?? [])
    .filter(
      (invoice) =>
        ["issued", "sent", "partially_paid"].includes(invoice.status) &&
        invoice.due_date < today &&
        Number(invoice.remaining_balance ?? 0) > 0.01 &&
        !invoice.dispute_status
    )
    .map((invoice) => invoice.id);

  if (overdueIds.length > 0) {
    await supabase.from("invoices").update({ status: "overdue" }).in("id", overdueIds);
  }

  const invoiceIds = (invoices ?? []).map((invoice) => invoice.id);

  const [ticketLinksRes, linesRes, timeRes, costsRes, projectsRes] = await Promise.all([
    invoiceIds.length > 0
      ? supabase
          .from("invoice_tickets")
          .select("invoice_id, support_tickets(id, ticket_number, title)")
          .in("invoice_id", invoiceIds)
      : Promise.resolve({ data: [] as Array<{ invoice_id: string; support_tickets: unknown }>, error: null }),
    invoiceIds.length > 0
      ? supabase
          .from("invoice_line_items")
          .select("invoice_id, source_type, source_id, line_amount, quantity, rate")
          .in("invoice_id", invoiceIds)
      : Promise.resolve({ data: [] as Array<{
          invoice_id: string;
          source_type: string | null;
          source_id: string | null;
          line_amount: number | null;
          quantity: number | null;
          rate: number | null;
        }>, error: null }),
    invoiceIds.length > 0
      ? supabase
          .from("time_entries")
          .select(
            "id, invoice_id, hours_worked, billing_rate, classification, approval_status, billing_status, invoice_line_item_id, billed_at"
          )
          .in("invoice_id", invoiceIds)
      : Promise.resolve({ data: [] as Array<{
          id: string;
          invoice_id: string | null;
          hours_worked: number | null;
          billing_rate: number | null;
          classification: string | null;
          approval_status: string | null;
          billing_status: string | null;
          invoice_line_item_id: string | null;
          billed_at: string | null;
        }>, error: null }),
    invoiceIds.length > 0
      ? supabase
          .from("direct_costs")
          .select("id, invoice_id, billable_amount")
          .in("invoice_id", invoiceIds)
      : Promise.resolve({ data: [] as Array<{
          id: string;
          invoice_id: string | null;
          billable_amount: number | null;
        }>, error: null }),
    invoiceIds.length > 0
      ? supabase
          .from("projects")
          .select("id, fixed_fee, estimated_billing_amount")
      : Promise.resolve({ data: [] as Array<{
          id: string;
          fixed_fee: number | null;
          estimated_billing_amount: number | null;
        }>, error: null }),
  ]);

  const ticketsByInvoice = new Map<string, InvoiceTicketRef[]>();
  for (const row of ticketLinksRes.data ?? []) {
    const ticketRaw = row.support_tickets;
    const ticket = Array.isArray(ticketRaw) ? ticketRaw[0] : ticketRaw;
    if (!ticket || typeof ticket !== "object") continue;
    const t = ticket as { id: string; ticket_number: string; title: string };
    const list = ticketsByInvoice.get(row.invoice_id) ?? [];
    list.push({ id: t.id, ticket_number: t.ticket_number, title: t.title });
    ticketsByInvoice.set(row.invoice_id, list);
  }

  const linesByInvoice = new Map<string, NonNullable<typeof linesRes.data>>();
  for (const line of linesRes.data ?? []) {
    const list = linesByInvoice.get(line.invoice_id) ?? [];
    list.push(line);
    linesByInvoice.set(line.invoice_id, list);
  }

  const timeByInvoice = new Map<string, NonNullable<typeof timeRes.data>>();
  for (const entry of timeRes.data ?? []) {
    if (!entry.invoice_id) continue;
    const list = timeByInvoice.get(entry.invoice_id) ?? [];
    list.push(entry);
    timeByInvoice.set(entry.invoice_id, list);
  }

  const costsByInvoice = new Map<string, NonNullable<typeof costsRes.data>>();
  for (const cost of costsRes.data ?? []) {
    if (!cost.invoice_id) continue;
    const list = costsByInvoice.get(cost.invoice_id) ?? [];
    list.push(cost);
    costsByInvoice.set(cost.invoice_id, list);
  }

  const projects = projectsRes.data ?? [];

  const rows: InvoiceListRow[] = (invoices ?? []).map((invoice) => {
    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
    const contract = Array.isArray(invoice.contracts) ? invoice.contracts[0] : invoice.contracts;
    const remainingBalance = Number(invoice.remaining_balance ?? 0);
    const amountPaid = Number(invoice.amount_paid ?? 0);
    const status = overdueIds.includes(invoice.id)
      ? "overdue"
      : deriveInvoiceStatus({
          currentStatus: invoice.status,
          dueDate: invoice.due_date,
          amountPaid,
          remainingBalance,
          disputed: Boolean(invoice.dispute_status) || invoice.status === "disputed",
          today,
        });

    const contractForFee = contract
      ? {
          monthly_recurring_fee: Number(contract.monthly_recurring_fee ?? 0),
          work_location: (contract as { work_location?: string | null }).work_location ?? null,
          included_hours_per_month: Number(
            (contract as { included_hours_per_month?: number | null }).included_hours_per_month ?? 0
          ),
          additional_hourly_rate: Number(
            (contract as { additional_hourly_rate?: number | null }).additional_hourly_rate ?? 0
          ),
        }
      : null;

    const agreementFee = contractAgreementFee(contractForFee);
    const breakdown = computeInvoiceListTotal({
      contract: contractForFee,
      lines: linesByInvoice.get(invoice.id) ?? [],
      timeEntries: timeByInvoice.get(invoice.id) ?? [],
      directCosts: costsByInvoice.get(invoice.id) ?? [],
      projects,
    });
    // Prefer component formula; fall back to stored invoice total when nothing matched.
    const invoiceTotal =
      breakdown.invoiceTotal > 0 || (linesByInvoice.get(invoice.id) ?? []).length === 0
        ? breakdown.invoiceTotal
        : Number(invoice.total_amount ?? 0);
    const gainLoss = invoiceGainLossVersusContractFee(invoiceTotal, agreementFee);

    return {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      status,
      subtotal: Number(invoice.subtotal ?? 0),
      tax_amount: Number(invoice.tax_amount ?? 0),
      total_amount: invoiceTotal,
      amount_paid: amountPaid,
      remaining_balance: remainingBalance,
      billing_period_start: invoice.billing_period_start,
      billing_period_end: invoice.billing_period_end,
      customer_name: customer?.name ?? "Unknown customer",
      contract_name: contract?.name ?? null,
      tickets: ticketsByInvoice.get(invoice.id) ?? [],
      contract_agreement_fee: agreementFee,
      total_breakdown: {
        monthlyRecurringFee: breakdown.monthlyRecurringFee,
        hourOverages: breakdown.hourOverages,
        billableTime: breakdown.billableTime,
        directCosts: breakdown.directCosts,
        projects: breakdown.projects,
        invoiceTotal,
      },
      gain_loss_amount: gainLoss.amount,
      gain_loss_outcome: gainLoss.outcome,
      gain_loss_label: gainLoss.label,
    };
  });

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Review draft invoices before sending. Invoice Total is monthly fee + overages + billable time + direct costs + projects; Gain/Loss compares that total to the contract fee."
      />
      {error ? <ErrorState message={error.message} /> : <InvoiceListClient invoices={rows} />}
    </div>
  );
}
