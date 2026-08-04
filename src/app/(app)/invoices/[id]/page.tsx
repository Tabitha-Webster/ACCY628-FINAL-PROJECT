import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { DataTable, EmptyState, ErrorState, Money, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing"].includes(profile.role)) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*, customers(id, name, contact_email), contracts(id, name, contract_number)")
    .eq("id", id)
    .maybeSingle();

  if (!invoiceError && !invoice) notFound();
  if (invoiceError || !invoice) {
    return <ErrorState message={invoiceError?.message ?? "Invoice not found."} />;
  }

  const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
  const contract = Array.isArray(invoice.contracts) ? invoice.contracts[0] : invoice.contracts;

  const [{ data: lineItems }, { data: applications }, { data: disputes }] = await Promise.all([
    supabase.from("invoice_line_items").select("*").eq("invoice_id", id).order("created_at", { ascending: true }),
    supabase
      .from("payment_applications")
      .select("id, amount_applied, created_at, payments(payment_number, payment_date, payment_method)")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true }),
    supabase.from("disputes").select("*").eq("invoice_id", id).order("dispute_date", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Invoice ${invoice.invoice_number}`}
        description={customer ? `${customer.name}${contract ? ` · ${contract.name}` : ""}` : undefined}
        actions={<StatusBadge status={invoice.status} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wide opacity-50">Invoice Date</p>
          <p className="mt-1 text-lg font-semibold">{formatDate(invoice.invoice_date)}</p>
        </div>
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wide opacity-50">Due Date</p>
          <p className="mt-1 text-lg font-semibold">{formatDate(invoice.due_date)}</p>
        </div>
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wide opacity-50">Total Amount</p>
          <p className="mt-1 text-lg font-semibold">
            <Money value={Number(invoice.total_amount ?? 0)} />
          </p>
        </div>
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wide opacity-50">Remaining Balance</p>
          <p className={`mt-1 text-lg font-semibold ${Number(invoice.remaining_balance ?? 0) > 0 ? "text-warning" : ""}`}>
            <Money value={Number(invoice.remaining_balance ?? 0)} />
          </p>
        </div>
      </div>

      {customer ? (
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">Billed To</h2>
          <p className="font-medium">
            <Link href={`/customers/${customer.id}`} className="link link-hover">
              {customer.name}
            </Link>
          </p>
          {customer.contact_email ? <p className="text-sm opacity-70">{customer.contact_email}</p> : null}
          {contract ? (
            <p className="mt-2 text-sm">
              Contract:{" "}
              <Link href={`/contracts/${contract.id}`} className="link link-hover">
                {contract.name}
              </Link>{" "}
              <span className="opacity-60">({contract.contract_number})</span>
            </p>
          ) : null}
          {invoice.billing_period_start || invoice.billing_period_end ? (
            <p className="mt-1 text-sm opacity-70">
              Billing period: {formatDate(invoice.billing_period_start)} – {formatDate(invoice.billing_period_end)}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <h2 className="mb-2 text-lg font-semibold">Line Items</h2>
        {lineItems && lineItems.length > 0 ? (
          <DataTable headers={["Description", "Source", "Quantity", "Rate", "Amount"]}>
            {lineItems.map((li) => (
              <tr key={li.id}>
                <td>{li.description}</td>
                <td className="text-xs capitalize opacity-70">{li.source_type?.replace(/_/g, " ") ?? "—"}</td>
                <td>{Number(li.quantity ?? 0).toFixed(2)}</td>
                <td>
                  <Money value={Number(li.rate ?? 0)} />
                </td>
                <td className="font-medium">
                  <Money value={Number(li.line_amount ?? 0)} />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No line items on this invoice" />
        )}

        <div className="mt-3 flex justify-end">
          <div className="w-full max-w-xs space-y-1 rounded-box border border-base-300 bg-base-100 p-4 text-sm">
            <div className="flex justify-between">
              <span className="opacity-60">Subtotal</span>
              <Money value={Number(invoice.subtotal ?? 0)} />
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">Tax</span>
              <Money value={Number(invoice.tax_amount ?? 0)} />
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">Credits</span>
              <Money value={Number(invoice.credits ?? 0)} />
            </div>
            <div className="flex justify-between border-t border-base-300 pt-1 font-semibold">
              <span>Total</span>
              <Money value={Number(invoice.total_amount ?? 0)} />
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">Paid</span>
              <Money value={Number(invoice.amount_paid ?? 0)} />
            </div>
            <div className="flex justify-between font-semibold">
              <span>Balance Due</span>
              <Money value={Number(invoice.remaining_balance ?? 0)} />
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Payments Applied</h2>
        {applications && applications.length > 0 ? (
          <DataTable headers={["Payment", "Method", "Date", "Amount Applied"]}>
            {applications.map((app) => {
              const payment = Array.isArray(app.payments) ? app.payments[0] : app.payments;
              return (
                <tr key={app.id}>
                  <td>{payment?.payment_number ?? "—"}</td>
                  <td className="text-xs capitalize">{payment?.payment_method?.replace(/_/g, " ") ?? "—"}</td>
                  <td className="text-xs">{formatDate(payment?.payment_date)}</td>
                  <td>
                    <Money value={Number(app.amount_applied ?? 0)} />
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title="No payments applied to this invoice yet" />
        )}
      </div>

      {disputes && disputes.length > 0 ? (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Disputes</h2>
          <DataTable headers={["Opened", "Reason", "Disputed Amount", "Status"]}>
            {disputes.map((dispute) => (
              <tr key={dispute.id}>
                <td className="text-xs">{formatDate(dispute.dispute_date)}</td>
                <td className="max-w-sm">{dispute.dispute_reason}</td>
                <td>
                  <Money value={Number(dispute.disputed_amount ?? 0)} />
                </td>
                <td>
                  <StatusBadge status={dispute.resolution_status} />
                </td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : null}

      {invoice.notes ? (
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide opacity-60">Notes</h2>
          <p className="text-sm leading-relaxed">{invoice.notes}</p>
        </div>
      ) : null}
    </div>
  );
}
