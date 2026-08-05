import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { DataTable, EmptyState, ErrorState, Money, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export default async function ContractsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing", "technician"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: contracts, error } = await supabase
    .from("contracts")
    .select(
      "id, contract_number, name, status, contract_type, start_date, end_date, payment_terms, billing_frequency, monthly_recurring_fee, customers(id, name)"
    )
    .order("start_date", { ascending: false });

  const now = new Date().getTime();

  return (
    <div>
      <PageHeader
        title="Contracts"
        description="Every service agreement, its term, and the billing terms it runs on."
      />

      {error ? <ErrorState message={error.message} /> : null}

      {!error && contracts && contracts.length === 0 ? (
        <EmptyState title="No contracts on file" />
      ) : null}

      {!error && contracts && contracts.length > 0 ? (
        <DataTable headers={["Contract", "Customer", "Status", "Type", "Term", "Monthly Fee", "Warnings", ""]}>
          {contracts.map((contract) => {
            const customer = Array.isArray(contract.customers) ? contract.customers[0] : contract.customers;
            const warnings: string[] = [];

            if (contract.status === "active" && contract.end_date) {
              const endMs = new Date(contract.end_date).getTime();
              if (!Number.isNaN(endMs) && endMs - now <= SIXTY_DAYS_MS && endMs - now >= 0) {
                warnings.push("Ends within 60 days");
              } else if (!Number.isNaN(endMs) && endMs < now) {
                warnings.push("Past end date");
              }
            }
            if (!contract.payment_terms) warnings.push("Missing payment terms");
            if (!contract.billing_frequency) warnings.push("Missing billing frequency");

            return (
              <tr key={contract.id}>
                <td>
                  <Link href={`/contracts/${contract.id}`} className="link link-hover font-medium">
                    {contract.name}
                  </Link>
                  <div className="text-xs opacity-60">{contract.contract_number}</div>
                </td>
                <td>
                  {customer ? (
                    <Link href={`/customers/${customer.id}`} className="link link-hover">
                      {customer.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <StatusBadge status={contract.status} />
                </td>
                <td className="text-xs">{contract.contract_type}</td>
                <td className="text-xs">
                  {formatDate(contract.start_date)} – {formatDate(contract.end_date)}
                </td>
                <td>
                  <Money value={Number(contract.monthly_recurring_fee ?? 0)} />
                </td>
                <td>
                  {warnings.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {warnings.map((warning) => (
                        <span key={warning} className="badge badge-warning badge-sm">
                          {warning}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs opacity-50">None</span>
                  )}
                </td>
                <td className="text-right">
                  <Link href={`/contracts/${contract.id}`} className="btn btn-ghost btn-xs">
                    View
                  </Link>
                </td>
              </tr>
            );
          })}
        </DataTable>
      ) : null}
    </div>
  );
}
