import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ErrorState, PageHeader } from "@/components/ui";
import { InvoiceListClient, type InvoiceListRow } from "@/components/InvoiceListClient";

export default async function InvoicesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, invoice_date, due_date, status, total_amount, amount_paid, remaining_balance, billing_period_start, billing_period_end, customers(name), contracts(name)"
    )
    .order("invoice_date", { ascending: false });

  const rows: InvoiceListRow[] = (invoices ?? []).map((invoice) => {
    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
    const contract = Array.isArray(invoice.contracts) ? invoice.contracts[0] : invoice.contracts;
    return {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      status: invoice.status,
      total_amount: Number(invoice.total_amount ?? 0),
      amount_paid: Number(invoice.amount_paid ?? 0),
      remaining_balance: Number(invoice.remaining_balance ?? 0),
      billing_period_start: invoice.billing_period_start,
      billing_period_end: invoice.billing_period_end,
      customer_name: customer?.name ?? "Unknown customer",
      contract_name: contract?.name ?? null,
    };
  });

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Review issued invoices, open balances, and generate monthly contract charges for the current period."
      />
      {error ? <ErrorState message={error.message} /> : <InvoiceListClient invoices={rows} />}
    </div>
  );
}
