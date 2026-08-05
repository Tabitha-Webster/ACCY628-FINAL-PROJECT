import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { DataTable, EmptyState, ErrorState, Money, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";

export default async function InvoicesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, due_date, status, total_amount, remaining_balance, customers(name)")
    .order("invoice_date", { ascending: false });

  return (
    <div>
      <PageHeader title="Invoices" description="Every invoice generated for a customer, and its current balance." />

      {error ? <ErrorState message={error.message} /> : null}

      {!error && invoices && invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Generate your first invoice from the Ready to Bill workspace."
        />
      ) : null}

      {!error && invoices && invoices.length > 0 ? (
        <DataTable headers={["Invoice", "Customer", "Invoice Date", "Due Date", "Status", "Total", "Balance", ""]}>
          {invoices.map((invoice) => {
            const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
            return (
              <tr key={invoice.id}>
                <td className="font-medium">{invoice.invoice_number}</td>
                <td>{customer?.name ?? "—"}</td>
                <td className="text-xs">{formatDate(invoice.invoice_date)}</td>
                <td className="text-xs">{formatDate(invoice.due_date)}</td>
                <td>
                  <StatusBadge status={invoice.status} />
                </td>
                <td>
                  <Money value={Number(invoice.total_amount ?? 0)} />
                </td>
                <td>
                  <Money value={Number(invoice.remaining_balance ?? 0)} />
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                    {Number(invoice.remaining_balance ?? 0) > 0 &&
                    !["draft", "canceled"].includes(invoice.status) ? (
                      <Link href={`/payments?invoiceId=${invoice.id}`} className="btn btn-primary btn-xs">
                        Record Payment
                      </Link>
                    ) : null}
                    <Link href={`/invoices/${invoice.id}`} className="btn btn-ghost btn-xs">
                      View
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      ) : null}
    </div>
  );
}
