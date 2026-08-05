import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { DataTable, EmptyState, ErrorState, Money, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate, formatHours } from "@/lib/format";
import { lineSourceLabel } from "@/lib/billing";

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

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
    .select("*, customers(id, name, contact_email, service_address), contracts(id, name, contract_number, included_hours_per_month, additional_hourly_rate, monthly_recurring_fee)")
    .eq("id", id)
    .maybeSingle();

  if (!invoiceError && !invoice) notFound();
  if (invoiceError || !invoice) {
    return <ErrorState message={invoiceError?.message ?? "Invoice not found."} />;
  }

  const customer = unwrap(invoice.customers);
  const contract = unwrap(invoice.contracts);

  const [{ data: lineItems }, { data: applications }, { data: disputes }] = await Promise.all([
    supabase.from("invoice_line_items").select("*").eq("invoice_id", id).order("created_at", { ascending: true }),
    supabase
      .from("payment_applications")
      .select("id, amount_applied, created_at, payments(payment_number, payment_date, payment_method)")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true }),
    supabase.from("disputes").select("*").eq("invoice_id", id).order("dispute_date", { ascending: false }),
  ]);

  const lines = lineItems ?? [];
  const monthlyLines = lines.filter((li) => li.source_type === "recurring");
  const hourLines = lines.filter((li) => li.source_type === "hours_included");
  const overageLines = lines.filter((li) => li.source_type === "overage");
  const projectLines = lines.filter((li) => li.source_type === "project" || li.source_type === "milestone");
  const equipmentSoftwareLines = lines.filter((li) => li.source_type === "direct_cost");
  const otherLines = lines.filter(
    (li) => !["recurring", "hours_included", "overage", "project", "milestone", "direct_cost"].includes(li.source_type ?? "")
  );

  const includedHoursUsed = hourLines.reduce((sum, li) => sum + Number(li.quantity ?? 0), 0);
  const overageHours = overageLines.reduce((sum, li) => sum + Number(li.quantity ?? 0), 0);
  const overageCharge = overageLines.reduce((sum, li) => sum + Number(li.line_amount ?? 0), 0);
  const includedHours = Number(contract?.included_hours_per_month ?? 0);
  const monthlyTotal = monthlyLines.reduce((sum, li) => sum + Number(li.line_amount ?? 0), 0);
  const projectTotal = projectLines.reduce((sum, li) => sum + Number(li.line_amount ?? 0), 0);
  const equipmentSoftwareTotal = equipmentSoftwareLines.reduce((sum, li) => sum + Number(li.line_amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Invoice ${invoice.invoice_number}`}
        description={customer ? `${customer.name}${contract ? ` · ${contract.name}` : ""}` : undefined}
        actions={
          <div className="flex gap-2">
            <StatusBadge status={invoice.status} />
            {Number(invoice.remaining_balance ?? 0) > 0 && !["draft", "canceled"].includes(invoice.status) ? (
              <Link href={`/payments?invoiceId=${invoice.id}`} className="btn btn-primary btn-sm">
                Record Payment
              </Link>
            ) : null}
          </div>
        }
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
          {customer.service_address ? <p className="text-sm opacity-70">{customer.service_address}</p> : null}
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wide opacity-60">Monthly contract charges</p>
          <p className="mt-1 text-lg font-semibold">
            <Money value={monthlyTotal} />
          </p>
        </div>
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wide opacity-60">Overage charges</p>
          <p className="mt-1 text-lg font-semibold">
            <Money value={overageCharge} />
          </p>
        </div>
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wide opacity-60">Approved project charges</p>
          <p className="mt-1 text-lg font-semibold">
            <Money value={projectTotal} />
          </p>
        </div>
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wide opacity-60">Equipment / software</p>
          <p className="mt-1 text-lg font-semibold">
            <Money value={equipmentSoftwareTotal} />
          </p>
        </div>
      </div>

      {(hourLines.length > 0 || overageLines.length > 0 || includedHours > 0) && (
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">Support hour usage</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="text-xs opacity-60">Included hours</p>
              <p className="font-semibold tabular-nums">{formatHours(includedHours)}</p>
            </div>
            <div>
              <p className="text-xs opacity-60">Included hours used</p>
              <p className="font-semibold tabular-nums">{formatHours(includedHoursUsed)}</p>
            </div>
            <div>
              <p className="text-xs opacity-60">Overage hours</p>
              <p className="font-semibold tabular-nums">{formatHours(overageHours)}</p>
            </div>
            <div>
              <p className="text-xs opacity-60">Overage rate</p>
              <p className="font-semibold tabular-nums">
                <Money value={Number(contract?.additional_hourly_rate ?? overageLines[0]?.rate ?? 0)} />
              </p>
            </div>
            <div>
              <p className="text-xs opacity-60">Overage charges</p>
              <p className="font-semibold tabular-nums">
                <Money value={overageCharge} />
              </p>
            </div>
          </div>
        </div>
      )}

      <ChargeSection title="Monthly contract charges" lines={monthlyLines} empty="No monthly contract charge on this invoice." />
      <ChargeSection title="Included support hours" lines={hourLines} empty="No included-hour line is recorded on this invoice." />
      <ChargeSection title="Overage charges" lines={overageLines} empty="No overage charges on this invoice." />
      <ChargeSection title="Approved project charges" lines={projectLines} empty="No approved project or milestone charges on this invoice." />
      <ChargeSection
        title="Equipment and software charges"
        lines={equipmentSoftwareLines}
        empty="No approved equipment or software charges on this invoice."
      />
      {otherLines.length > 0 ? <ChargeSection title="Other charges" lines={otherLines} /> : null}

      <div className="flex justify-end">
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

      <div>
        <h2 className="mb-2 text-lg font-semibold">Payments Applied</h2>
        {applications && applications.length > 0 ? (
          <DataTable headers={["Payment", "Method", "Date", "Amount Applied"]}>
            {applications.map((app) => {
              const payment = unwrap(app.payments);
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

      <p className="text-sm">
        <Link href="/invoices" className="link link-primary">
          Back to invoice list
        </Link>
      </p>
    </div>
  );
}

function ChargeSection({
  title,
  lines,
  empty,
}: {
  title: string;
  lines: Array<{
    id: string;
    description: string;
    source_type: string | null;
    quantity: number | string | null;
    rate: number | string | null;
    line_amount: number | string | null;
  }>;
  empty?: string;
}) {
  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {lines.length > 0 ? (
        <DataTable headers={["Description", "Type", "Quantity", "Rate", "Amount"]}>
          {lines.map((li) => (
            <tr key={li.id}>
              <td>{li.description}</td>
              <td className="text-xs opacity-70">{lineSourceLabel(li.source_type)}</td>
              <td className="tabular-nums">{Number(li.quantity ?? 0).toFixed(2)}</td>
              <td>
                <Money value={Number(li.rate ?? 0)} />
              </td>
              <td className="font-medium">
                <Money value={Number(li.line_amount ?? 0)} />
              </td>
            </tr>
          ))}
        </DataTable>
      ) : empty ? (
        <p className="rounded-box border border-dashed border-base-300 bg-base-100 px-4 py-3 text-sm opacity-70">{empty}</p>
      ) : null}
    </div>
  );
}
