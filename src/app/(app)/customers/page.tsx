import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { DataTable, EmptyState, ErrorState, PageHeader, StatusBadge } from "@/components/ui";

export default async function CustomersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing", "technician"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name, industry, primary_contact, contact_email, status, credit_terms")
    .order("name", { ascending: true });

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Every organization ServiceSync currently supports or is onboarding."
      />

      {error ? <ErrorState message={error.message} /> : null}

      {!error && customers && customers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Customers will appear here once they are added to the system."
        />
      ) : null}

      {!error && customers && customers.length > 0 ? (
        <DataTable headers={["Customer", "Industry", "Primary Contact", "Credit Terms", "Status", ""]}>
          {customers.map((customer) => (
            <tr key={customer.id}>
              <td className="font-medium">{customer.name}</td>
              <td>{customer.industry ?? "—"}</td>
              <td>
                <div>{customer.primary_contact ?? "—"}</div>
                {customer.contact_email ? (
                  <div className="text-xs opacity-60">{customer.contact_email}</div>
                ) : null}
              </td>
              <td>{customer.credit_terms ?? "—"}</td>
              <td>
                <StatusBadge status={customer.status} />
              </td>
              <td className="text-right">
                <Link href={`/customers/${customer.id}`} className="btn btn-ghost btn-xs">
                  View
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      ) : null}
    </div>
  );
}
