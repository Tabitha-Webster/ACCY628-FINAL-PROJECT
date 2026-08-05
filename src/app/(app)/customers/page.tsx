import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ButtonLink } from "@/components/Button";
import { PageLayout } from "@/components/PageLayout";
import { Table, TableCell } from "@/components/Table";
import { ErrorState, StatusBadge } from "@/components/ui";

const CUSTOMER_COLUMNS = [
  { key: "name", header: "Customer" },
  { key: "industry", header: "Industry" },
  { key: "contact", header: "Primary Contact" },
  { key: "terms", header: "Credit Terms" },
  { key: "status", header: "Status" },
  { key: "actions", header: "Actions", align: "right" as const },
];

export default async function CustomersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing", "technician"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name, industry, primary_contact, contact_email, status, credit_terms")
    .order("name", { ascending: true });

  const rows = customers ?? [];

  return (
    <PageLayout
      title="Customers"
      description="Every organization ServiceSync currently supports or is onboarding."
      actions={
        profile.role === "manager" ? (
          <ButtonLink href="/customer-approvals" variant="primary" size="sm">
            Review approvals
          </ButtonLink>
        ) : undefined
      }
    >
      {error ? <ErrorState message={error.message} /> : null}

      {!error ? (
        <Table
          columns={CUSTOMER_COLUMNS}
          isEmpty={rows.length === 0}
          emptyTitle="No customers yet"
          emptyDescription="Customers will appear here once they are added to the system."
        >
          {rows.map((customer) => (
            <tr key={customer.id} className="border-b border-base-200 last:border-b-0">
              <TableCell className="font-medium">{customer.name}</TableCell>
              <TableCell>{customer.industry ?? "—"}</TableCell>
              <TableCell>
                <div>{customer.primary_contact ?? "—"}</div>
                {customer.contact_email ? (
                  <div className="text-xs opacity-60">{customer.contact_email}</div>
                ) : null}
              </TableCell>
              <TableCell>{customer.credit_terms ?? "—"}</TableCell>
              <TableCell>
                <StatusBadge status={customer.status} />
              </TableCell>
              <TableCell actions>
                <ButtonLink href={`/customers/${customer.id}`} variant="secondary" size="xs">
                  View
                </ButtonLink>
              </TableCell>
            </tr>
          ))}
        </Table>
      ) : null}
    </PageLayout>
  );
}
