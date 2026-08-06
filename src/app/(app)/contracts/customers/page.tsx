import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import {
  canViewCustomerContractData,
  buildCustomerContractMetrics,
  loyaltyLabel,
} from "@/lib/contracts";

export default async function ContractCustomersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewCustomerContractData(profile.role)) redirect("/dashboard");

  const supabase = await createClient();

  const [customersRes, contractsRes, invoicesRes, paymentsRes, renewalsRes] = await Promise.all([
    supabase
      .from("customers")
      .select(
        "id, name, industry, status, credit_terms, primary_contact, contact_email, created_at"
      )
      .order("name"),
    supabase
      .from("contracts")
      .select("id, customer_id, status, start_date, monthly_recurring_fee"),
    supabase
      .from("invoices")
      .select(
        "id, customer_id, due_date, status, total_amount, amount_paid, remaining_balance, dispute_status"
      ),
    supabase.from("payments").select("id, customer_id, payment_date, payment_amount"),
    supabase.from("contract_renewals").select("contract_id"),
  ]);

  const error =
    customersRes.error ??
    contractsRes.error ??
    invoicesRes.error ??
    paymentsRes.error ??
    renewalsRes.error;

  const paymentIds = (paymentsRes.data ?? []).map((p) => p.id);
  const paymentApplicationsRes =
    paymentIds.length > 0
      ? await supabase
          .from("payment_applications")
          .select("payment_id, invoice_id, amount_applied")
          .in("payment_id", paymentIds)
      : { data: [] as Array<{ payment_id: string; invoice_id: string; amount_applied: number | null }>, error: null };

  const appError = paymentApplicationsRes.error;
  const pageError = error ?? appError;

  const rows = !pageError
    ? buildCustomerContractMetrics({
        customers: customersRes.data ?? [],
        contracts: contractsRes.data ?? [],
        invoices: invoicesRes.data ?? [],
        payments: paymentsRes.data ?? [],
        paymentApplications: paymentApplicationsRes.data ?? [],
        renewals: renewalsRes.data ?? [],
      })
    : [];

  const loyalCount = rows.filter((r) => r.loyalty === "loyal").length;
  const atRiskCount = rows.filter((r) => r.loyalty === "at_risk").length;
  const totalAr = rows.reduce((sum, r) => sum + r.outstandingAr, 0);
  const totalOverdue = rows.reduce((sum, r) => sum + r.overdueAr, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Contract Data"
        description="Customer relationship view for contracts — active agreements, payment reliability, loyalty, and outstanding balances."
      />

      {pageError ? <ErrorState message={pageError.message} /> : null}

      {!pageError ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Customers" value={String(rows.length)} />
          <StatCard label="Loyal accounts" value={String(loyalCount)} tone="success" />
          <StatCard
            label="At-risk accounts"
            value={String(atRiskCount)}
            tone={atRiskCount > 0 ? "warning" : "default"}
          />
          <StatCard
            label="Outstanding AR"
            value={formatCurrency(totalAr)}
            hint={totalOverdue > 0 ? `${formatCurrency(totalOverdue)} overdue` : "No overdue balance"}
            tone={totalOverdue > 0 ? "error" : "default"}
          />
        </div>
      ) : null}

      {!pageError && rows.length === 0 ? (
        <EmptyState
          title="No customers on file"
          description="Customers appear here once they are added and linked to contracts or billing."
        />
      ) : null}

      {!pageError && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <DataTable
            headers={[
              "Customer",
              "Loyalty",
              "Active contracts",
              "Renewals",
              "Overdue",
              "Collected",
            ]}
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/customers/${row.id}`} className="link link-hover font-medium">
                    {row.name}
                  </Link>
                  <div className="text-xs opacity-60">
                    {row.industry ?? "—"}
                    {row.primary_contact ? ` · ${row.primary_contact}` : ""}
                  </div>
                  <div className="mt-1">
                    <StatusBadge status={row.status} />
                  </div>
                </td>
                <td>
                  <StatusBadge status={row.loyalty} label={loyaltyLabel(row.loyalty)} />
                </td>
                <td className="tabular-nums">{row.activeContracts}</td>
                <td className="tabular-nums">{row.renewalCount}</td>
                <td className="tabular-nums text-sm">
                  {row.overdueAr > 0 ? (
                    <span className="text-error font-medium">{formatCurrency(row.overdueAr)}</span>
                  ) : (
                    formatCurrency(0)
                  )}
                  {row.openInvoiceCount > 0 ? (
                    <div className="text-xs opacity-60">{row.openInvoiceCount} open</div>
                  ) : null}
                </td>
                <td className="tabular-nums text-sm">{formatCurrency(row.lifetimeCollected)}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : null}
    </div>
  );
}
