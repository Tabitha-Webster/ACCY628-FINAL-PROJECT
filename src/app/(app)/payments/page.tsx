import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { DataTable, EmptyState, ErrorState, Money, PageHeader, StatCard } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { PaymentForm, type PayableInvoice } from "@/components/PaymentForm";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceId?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing"].includes(profile.role)) redirect("/dashboard");

  const { invoiceId: initialInvoiceId } = await searchParams;
  const supabase = await createClient();

  const [
    { data: payments, error: paymentsError },
    { data: openInvoices, error: invoicesError },
    { data: applications, error: applicationsError },
  ] = await Promise.all([
    supabase
      .from("payments")
      .select("id, payment_number, payment_date, payment_amount, payment_method, reference_number, customers(name)")
      .order("payment_date", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, invoice_number, due_date, status, remaining_balance, customers(name)")
      .gt("remaining_balance", 0)
      .neq("status", "canceled")
      .neq("status", "draft")
      .order("invoice_date", { ascending: true }),
    supabase
      .from("payment_applications")
      .select("payment_id, amount_applied, invoices(id, invoice_number)")
      .order("created_at", { ascending: false }),
  ]);

  const error = paymentsError || invoicesError || applicationsError;

  const payableInvoices: PayableInvoice[] = (openInvoices ?? []).map((inv) => {
    const customer = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      customerName: customer?.name ?? "Unknown customer",
      dueDate: formatDate(inv.due_date),
      status: inv.status,
      remainingBalance: Number(inv.remaining_balance ?? 0),
    };
  });

  const applicationsByPayment = new Map<
    string,
    { invoiceId: string; invoiceNumber: string; amountApplied: number }[]
  >();
  for (const application of applications ?? []) {
    const invoice = Array.isArray(application.invoices) ? application.invoices[0] : application.invoices;
    if (!invoice) continue;
    const linked = applicationsByPayment.get(application.payment_id) ?? [];
    linked.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      amountApplied: Number(application.amount_applied ?? 0),
    });
    applicationsByPayment.set(application.payment_id, linked);
  }

  const totalOutstanding = payableInvoices.reduce((sum, invoice) => sum + invoice.remainingBalance, 0);
  const totalReceived = (payments ?? []).reduce((sum, payment) => sum + Number(payment.payment_amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Entry"
        description="Record received payments, apply them to invoices, and review collection history."
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open Invoices" value={String(payableInvoices.length)} />
        <StatCard
          label="Outstanding Balance"
          value={formatCurrency(totalOutstanding)}
          tone={totalOutstanding > 0 ? "warning" : "success"}
        />
        <StatCard label="Payments Recorded" value={formatCurrency(totalReceived)} tone="success" />
      </div>

      {!error ? <PaymentForm invoices={payableInvoices} initialInvoiceId={initialInvoiceId} /> : null}

      <div>
        <h2 className="mb-2 text-lg font-semibold">Payment History</h2>
        {payments && payments.length > 0 ? (
          <DataTable headers={["Payment", "Customer", "Invoice Applied", "Date", "Method", "Reference", "Amount"]}>
            {payments.map((payment) => {
              const customer = Array.isArray(payment.customers) ? payment.customers[0] : payment.customers;
              const linkedApplications = applicationsByPayment.get(payment.id) ?? [];
              return (
                <tr key={payment.id}>
                  <td className="font-medium">{payment.payment_number}</td>
                  <td>{customer?.name ?? "—"}</td>
                  <td>
                    {linkedApplications.length > 0
                      ? linkedApplications.map((application) => (
                          <div key={application.invoiceId}>
                            <Link href={`/invoices/${application.invoiceId}`} className="link link-hover">
                              {application.invoiceNumber}
                            </Link>
                            <span className="ml-1 text-xs opacity-60">
                              ({formatCurrency(application.amountApplied)})
                            </span>
                          </div>
                        ))
                      : "—"}
                  </td>
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
