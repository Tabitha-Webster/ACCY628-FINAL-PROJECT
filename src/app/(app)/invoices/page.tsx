import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ErrorState, PageHeader } from "@/components/ui";
import { InvoiceListClient, type InvoiceListRow } from "@/components/InvoiceListClient";
import { deriveInvoiceStatus, todayDateString } from "@/lib/billing";
import {
  contractAgreementFee,
  summarizeTicketSlaSpeed,
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
      "id, invoice_number, invoice_date, due_date, status, subtotal, tax_amount, total_amount, amount_paid, remaining_balance, billing_period_start, billing_period_end, dispute_status, customers(name), contracts(id, name, monthly_recurring_fee, work_location)"
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
  const ticketLinksRes =
    invoiceIds.length > 0
      ? await supabase
          .from("invoice_tickets")
          .select(
            "invoice_id, support_tickets(id, ticket_number, title, completed_at, target_resolution_at)"
          )
          .in("invoice_id", invoiceIds)
      : { data: [] as Array<{
          invoice_id: string;
          support_tickets:
            | {
                id: string;
                ticket_number: string;
                title: string;
                completed_at: string | null;
                target_resolution_at: string | null;
              }
            | {
                id: string;
                ticket_number: string;
                title: string;
                completed_at: string | null;
                target_resolution_at: string | null;
              }[]
            | null;
        }>, error: null };

  const ticketsByInvoice = new Map<
    string,
    Array<{
      id: string;
      ticket_number: string;
      title: string;
      completed_at: string | null;
      target_resolution_at: string | null;
    }>
  >();

  for (const row of ticketLinksRes.data ?? []) {
    const ticketRaw = row.support_tickets;
    const ticket = Array.isArray(ticketRaw) ? ticketRaw[0] : ticketRaw;
    if (!ticket) continue;
    const list = ticketsByInvoice.get(row.invoice_id) ?? [];
    list.push(ticket);
    ticketsByInvoice.set(row.invoice_id, list);
  }

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

    const linkedTickets = ticketsByInvoice.get(invoice.id) ?? [];
    const ticketRefs: InvoiceTicketRef[] = linkedTickets.map((t) => ({
      id: t.id,
      ticket_number: t.ticket_number,
      title: t.title,
    }));
    const sla = summarizeTicketSlaSpeed(linkedTickets);
    const agreementFee = contractAgreementFee(
      contract
        ? {
            monthly_recurring_fee: Number(contract.monthly_recurring_fee ?? 0),
            work_location: (contract as { work_location?: string | null }).work_location ?? null,
          }
        : null
    );

    return {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      status,
      subtotal: Number(invoice.subtotal ?? 0),
      tax_amount: Number(invoice.tax_amount ?? 0),
      total_amount: Number(invoice.total_amount ?? 0),
      amount_paid: amountPaid,
      remaining_balance: remainingBalance,
      billing_period_start: invoice.billing_period_start,
      billing_period_end: invoice.billing_period_end,
      customer_name: customer?.name ?? "Unknown customer",
      contract_name: contract?.name ?? null,
      tickets: ticketRefs,
      contract_agreement_fee: agreementFee,
      sla_outcome: sla.outcome,
      sla_label: sla.label,
    };
  });

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Review draft invoices before sending, check linked tickets, contract fees, and SLA speed gain/loss."
      />
      {error ? <ErrorState message={error.message} /> : <InvoiceListClient invoices={rows} />}
    </div>
  );
}
