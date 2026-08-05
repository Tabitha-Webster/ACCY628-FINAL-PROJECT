import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ErrorState, PageHeader, StatCard } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { PaymentHistoryTable, type PaymentHistoryRow } from "@/components/PaymentHistoryTable";

export default async function PaymentsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: payments, error: paymentsError }, { data: openInvoices, error: invoicesError }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, payment_number, payment_date, payment_amount, payment_method, reference_number, customers(name)")
      .order("payment_date", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, remaining_balance")
      .gt("remaining_balance", 0)
      .neq("status", "canceled")
      .neq("status", "draft"),
  ]);

  const error = paymentsError || invoicesError;
  const totalOutstanding = (openInvoices ?? []).reduce(
    (sum, invoice) => sum + Number(invoice.remaining_balance ?? 0),
    0
  );
  const totalReceived = (payments ?? []).reduce((sum, payment) => sum + Number(payment.payment_amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment History"
        description="Customer payments appear here automatically and update invoice balances and statuses."
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open Invoices" value={String(openInvoices?.length ?? 0)} />
        <StatCard
          label="Outstanding Balance"
          value={formatCurrency(totalOutstanding)}
          tone={totalOutstanding > 0 ? "warning" : "success"}
        />
        <StatCard label="Total Payments Received" value={formatCurrency(totalReceived)} tone="success" />
      </div>

      <PaymentHistoryTable
        payments={(payments ?? []).map((payment): PaymentHistoryRow => {
          const customer = Array.isArray(payment.customers) ? payment.customers[0] : payment.customers;
          return {
            id: payment.id,
            payment_number: payment.payment_number,
            customer_name: customer?.name ?? "Unknown customer",
            payment_date: payment.payment_date,
            payment_method: payment.payment_method ?? "other",
            reference_number: payment.reference_number ?? null,
            payment_amount: Number(payment.payment_amount ?? 0),
          };
        })}
      />
    </div>
  );
}
