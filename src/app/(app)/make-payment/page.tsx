import { redirect } from "next/navigation";
import { PaymentForm, type PayableInvoice } from "@/components/PaymentForm";
import { ErrorState, PageHeader } from "@/components/ui";
import { getCurrentProfile } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function MakePaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceId?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "customer" || !profile.customer_id) redirect("/dashboard");

  const { invoiceId: initialInvoiceId } = await searchParams;
  const supabase = await createClient();
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, due_date, status, remaining_balance, customers(name)")
    .eq("customer_id", profile.customer_id)
    .gt("remaining_balance", 0)
    .neq("status", "draft")
    .neq("status", "canceled")
    .order("due_date", { ascending: true });

  if (error) {
    return (
      <div>
        <PageHeader title="Make a Payment" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const payableInvoices: PayableInvoice[] = (invoices ?? []).map((invoice) => {
    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      customerName: customer?.name ?? "Your account",
      dueDate: formatDate(invoice.due_date),
      status: invoice.status,
      remainingBalance: Number(invoice.remaining_balance ?? 0),
    };
  });
  const totalDue = payableInvoices.reduce((sum, invoice) => sum + invoice.remainingBalance, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Make a Payment"
        description="Submit a full or partial demo payment toward one of your open invoices."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-box border border-base-300 bg-base-100 px-3 py-2">
          <p className="text-xs uppercase tracking-wide opacity-60">Open Invoices</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{payableInvoices.length}</p>
        </div>
        <div className="rounded-box border border-primary bg-primary/10 px-3 py-2 text-primary">
          <p className="text-xs uppercase tracking-wide opacity-80">Total Balance Due</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatCurrency(totalDue)}</p>
        </div>
      </div>

      <PaymentForm invoices={payableInvoices} initialInvoiceId={initialInvoiceId} mode="customer" />
    </div>
  );
}
