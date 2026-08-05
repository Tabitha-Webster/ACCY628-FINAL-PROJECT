import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader, DataTable, EmptyState, StatusBadge, Money, DateText, ErrorState, StatCard } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { withDerivedInvoiceStatus } from "@/lib/billing";
import type { Dispute } from "@/lib/types";
export default async function MyInvoicesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "customer" || !profile.customer_id) redirect("/invoices");

  const supabase = await createClient();
  const customerId = profile.customer_id;

  const [invoicesRes, paymentsRes, disputesRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, due_date, status, total_amount, amount_paid, remaining_balance, billing_period_start, billing_period_end")
      .eq("customer_id", customerId)
      .order("invoice_date", { ascending: false }),
    supabase
      .from("payments")
      .select(
        "id, payment_number, payment_date, payment_amount, payment_method, reference_number, payment_applications(amount_applied, invoices(invoice_number))"
      )
      .eq("customer_id", customerId)
      .order("payment_date", { ascending: false }),
    supabase.from("disputes").select("id, invoice_id, dispute_date, dispute_reason, disputed_amount, resolution_status").eq("customer_id", customerId),
  ]);

  const error = invoicesRes.error || paymentsRes.error || disputesRes.error;
  if (error) {
    return (
      <div>
        <PageHeader title="Invoices and Payments" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const invoices = (invoicesRes.data ?? []).map((invoice) => withDerivedInvoiceStatus(invoice));
  const payments = paymentsRes.data ?? [];
  const disputes = (disputesRes.data ?? []) as (Pick<Dispute, "invoice_id" | "dispute_date" | "dispute_reason" | "disputed_amount" | "resolution_status"> & { id: string })[];
  const openInvoices = invoices.filter((i) => !["draft", "canceled", "paid"].includes(i.status) && i.remaining_balance > 0.01);
  const balanceDue = openInvoices.reduce((sum, i) => sum + i.remaining_balance, 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.payment_amount), 0);
  const invoiceNumberById = new Map(invoices.map((i) => [i.id, i.invoice_number]));

  return (
    <div>
      <PageHeader
        title="Invoices and Payments"
        description="Your billing history and current balance."
        actions={
          balanceDue > 0 ? (
            <Link href="/make-payment" className="btn btn-primary btn-sm">
              Make a Payment
            </Link>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Balance Due"
          value={formatCurrency(balanceDue)}
          tone={balanceDue > 0 ? "warning" : "success"}
          explanation={{
            title: "Balance Due",
            result: formatCurrency(balanceDue),
            formula: "Sum of remaining_balance on your open invoices that are not draft, canceled, or paid",
            lines: openInvoices.map((invoice) => ({
              label: invoice.invoice_number,
              value: formatCurrency(invoice.remaining_balance),
              detail: invoice.status.replace(/_/g, " "),
            })),
          }}
        />
        <StatCard
          label="Total Invoices"
          value={String(invoices.length)}
          explanation={{
            title: "Total Invoices",
            result: String(invoices.length),
            formula: "Count of all invoices issued to your account",
            lines: invoices.map((invoice) => ({
              label: invoice.invoice_number,
              value: formatCurrency(Number(invoice.total_amount ?? 0)),
              detail: invoice.status.replace(/_/g, " "),
            })),
          }}
        />
        <StatCard
          label="Total Paid to Date"
          value={formatCurrency(totalPaid)}
          tone="success"
          explanation={{
            title: "Total Paid to Date",
            result: formatCurrency(totalPaid),
            formula: "Sum of all payment_amount values recorded for your account",
            lines: payments.map((payment) => ({
              label: payment.payment_number,
              value: formatCurrency(Number(payment.payment_amount)),
              detail: `${payment.payment_method.replace(/_/g, " ")} · ${payment.payment_date}`,
            })),
          }}
        />
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Invoices</h2>
        {invoices.length === 0 ? (
          <EmptyState title="No invoices yet" description="Invoices for your account will appear here once issued." />
        ) : (
          <DataTable headers={["Invoice", "Period", "Total", "Paid", "Balance", "Due", "Status", ""]}>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td>{i.invoice_number}</td>
                <td>
                  {i.billing_period_start ? <DateText value={i.billing_period_start} /> : "—"}
                  {i.billing_period_end ? (
                    <>
                      {" "}
                      – <DateText value={i.billing_period_end} />
                    </>
                  ) : null}
                </td>
                <td>
                  <Money value={Number(i.total_amount)} />
                </td>
                <td>
                  <Money value={Number(i.amount_paid)} />
                </td>
                <td>
                  <Money value={Number(i.remaining_balance)} />
                </td>
                <td>
                  <DateText value={i.due_date} />
                </td>
                <td>
                  <StatusBadge status={i.status} />
                </td>
                <td className="text-right">
                  {Number(i.remaining_balance) > 0 && !["draft", "canceled"].includes(i.status) ? (
                    <Link href={`/make-payment?invoiceId=${i.id}`} className="btn btn-primary btn-xs">
                      Pay
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Payment History</h2>
          {payments.length === 0 ? (
            <EmptyState title="No payments recorded yet" />
          ) : (
            <DataTable headers={["Payment #", "Invoice", "Amount Applied", "Method", "Date"]}>
              {payments.map((p) => {
                const application = p.payment_applications?.[0];
                const invoice = application
                  ? Array.isArray(application.invoices)
                    ? application.invoices[0]
                    : application.invoices
                  : null;
                return (
                  <tr key={p.id}>
                    <td>{p.payment_number}</td>
                    <td>{invoice?.invoice_number ?? "—"}</td>
                    <td>
                      <Money value={Number(application?.amount_applied ?? p.payment_amount)} />
                    </td>
                    <td>
                      <StatusBadge status={p.payment_method} />
                    </td>
                    <td>
                      <DateText value={p.payment_date} />
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Disputes</h2>
          {disputes.length === 0 ? (
            <EmptyState title="No disputes on file" description="If something on an invoice looks wrong, contact your account manager." />
          ) : (
            <DataTable headers={["Invoice", "Reason", "Amount", "Status"]}>
              {disputes.map((d) => (
                <tr key={d.id}>
                  <td>{invoiceNumberById.get(d.invoice_id) ?? "—"}</td>
                  <td className="max-w-xs truncate">{d.dispute_reason}</td>
                  <td>
                    <Money value={Number(d.disputed_amount)} />
                  </td>
                  <td>
                    <StatusBadge status={d.resolution_status} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      </div>
    </div>
  );
}
