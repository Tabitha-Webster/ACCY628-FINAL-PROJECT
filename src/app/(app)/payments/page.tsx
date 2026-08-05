import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ErrorState, PageHeader } from "@/components/ui";
import { PaymentForm, type PayableInvoice } from "@/components/PaymentForm";
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
      .select("id, invoice_number, remaining_balance, customers(name)")
      .gt("remaining_balance", 0)
      .neq("status", "canceled")
      .order("invoice_date", { ascending: true }),
  ]);

  const error = paymentsError || invoicesError;

  const payableInvoices: PayableInvoice[] = (openInvoices ?? []).map((inv) => {
    const customer = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      customerName: customer?.name ?? "Unknown customer",
      remainingBalance: Number(inv.remaining_balance ?? 0),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Record customer payments and review payment history." />

      {error ? <ErrorState message={error.message} /> : null}

      <PaymentForm invoices={payableInvoices} />

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
