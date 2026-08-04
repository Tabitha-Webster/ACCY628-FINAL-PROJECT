import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { DataTable, EmptyState, ErrorState, Money, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { PaymentForm, type PayableInvoice } from "@/components/PaymentForm";

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

      <div>
        <h2 className="mb-2 text-lg font-semibold">Payment History</h2>
        {payments && payments.length > 0 ? (
          <DataTable headers={["Payment", "Customer", "Date", "Method", "Reference", "Amount"]}>
            {payments.map((payment) => {
              const customer = Array.isArray(payment.customers) ? payment.customers[0] : payment.customers;
              return (
                <tr key={payment.id}>
                  <td className="font-medium">{payment.payment_number}</td>
                  <td>{customer?.name ?? "—"}</td>
                  <td className="text-xs">{formatDate(payment.payment_date)}</td>
                  <td className="text-xs capitalize">{payment.payment_method?.replace(/_/g, " ")}</td>
                  <td className="text-xs">{payment.reference_number ?? "—"}</td>
                  <td className="font-medium">
                    <Money value={Number(payment.payment_amount ?? 0)} />
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title="No payments recorded yet" />
        )}
      </div>
    </div>
  );
}
