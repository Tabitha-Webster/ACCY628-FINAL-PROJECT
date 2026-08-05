import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireApprovedCustomer } from "@/lib/auth";
import { PageHeader, DataTable, EmptyState, StatusBadge, Money, DateText, ErrorState, StatCard } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import type { Dispute, Invoice, Payment } from "@/lib/types";

export default async function MyInvoicesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "customer" || !profile.customer_id) redirect("/invoices");
  await requireApprovedCustomer(profile);

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
      .select("id, payment_number, payment_date, payment_amount, payment_method, reference_number")
      .eq("customer_id", customerId)
      .order("payment_date", { ascending: false }),
    supabase.from("disputes").select("id, invoice_id, dispute_date, dispute_reason, disputed_amount, resolution_status").eq("customer_id", customerId),
  ]);

  if (invoicesRes.error) {
    return (
      <div>
        <PageHeader title="Invoices and Payments" />
        <ErrorState message={invoicesRes.error.message} />
      </div>
    );
  }

  const invoices = (invoicesRes.data ?? []) as Pick<
    Invoice,
    "id" | "invoice_number" | "invoice_date" | "due_date" | "status" | "total_amount" | "amount_paid" | "remaining_balance" | "billing_period_start" | "billing_period_end"
  >[];
  const payments = (paymentsRes.data ?? []) as (Pick<Payment, "payment_number" | "payment_date" | "payment_amount" | "payment_method" | "reference_number"> & { id: string })[];
  const disputes = (disputesRes.data ?? []) as (Pick<Dispute, "invoice_id" | "dispute_date" | "dispute_reason" | "disputed_amount" | "resolution_status"> & { id: string })[];

  const balanceDue = invoices.filter((i) => !["draft", "canceled"].includes(i.status)).reduce((sum, i) => sum + Number(i.remaining_balance), 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.payment_amount), 0);
  const invoiceNumberById = new Map(invoices.map((i) => [i.id, i.invoice_number]));

  return (
    <div>
      <PageHeader title="Invoices and Payments" description="Your billing history and current balance." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Balance Due" value={formatCurrency(balanceDue)} tone={balanceDue > 0 ? "warning" : "success"} />
        <StatCard label="Total Invoices" value={String(invoices.length)} />
        <StatCard label="Total Paid to Date" value={formatCurrency(totalPaid)} tone="success" />
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Invoices</h2>
        {invoices.length === 0 ? (
          <EmptyState title="No invoices yet" description="Invoices for your account will appear here once issued." />
        ) : (
          <DataTable headers={["Invoice", "Period", "Total", "Paid", "Balance", "Due", "Status"]}>
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
            <DataTable headers={["Payment #", "Amount", "Method", "Date"]}>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.payment_number}</td>
                  <td>
                    <Money value={Number(p.payment_amount)} />
                  </td>
                  <td>
                    <StatusBadge status={p.payment_method} />
                  </td>
                  <td>
                    <DateText value={p.payment_date} />
                  </td>
                </tr>
              ))}
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
