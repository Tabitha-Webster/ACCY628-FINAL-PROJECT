import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, OPEN_TICKET_STATUSES } from "@/lib/admin";
import { PageHeader, StatCard, DataTable, EmptyState, ErrorState, StatusBadge } from "@/components/ui";

type CheckRow = {
  id: string;
  area: string;
  issue: string;
  detail: string;
  href?: string;
};

export default async function AdminDataQualityPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [customersRes, contractsRes, ticketsRes, usersRes, projectsRes] = await Promise.all([
    supabase.from("customers").select("id, name, status, primary_contact, contact_email, credit_terms"),
    supabase.from("contracts").select("id, contract_number, name, status, customer_id, payment_terms, billing_frequency, end_date"),
    supabase
      .from("support_tickets")
      .select("id, ticket_number, title, status, contract_id, assigned_technician_id, customer_id")
      .in("status", OPEN_TICKET_STATUSES),
    supabase.from("profiles").select("id, full_name, email, role, customer_id, is_active"),
    supabase.from("projects").select("id, name, status, customer_id, contract_id").not("status", "in", "(closed,canceled)"),
  ]);

  const error = customersRes.error || contractsRes.error || ticketsRes.error || usersRes.error || projectsRes.error;
  const customers = customersRes.data ?? [];
  const contracts = contractsRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const users = usersRes.data ?? [];
  const projects = projectsRes.data ?? [];

  const checks: CheckRow[] = [];

  for (const c of customers.filter((x) => x.status === "active")) {
    if (!c.contact_email) {
      checks.push({
        id: `cust-email-${c.id}`,
        area: "Customer",
        issue: "Missing contact email",
        detail: c.name,
        href: `/customers/${c.id}`,
      });
    }
    if (!c.primary_contact) {
      checks.push({
        id: `cust-contact-${c.id}`,
        area: "Customer",
        issue: "Missing primary contact",
        detail: c.name,
        href: `/customers/${c.id}`,
      });
    }
    if (!contracts.some((ct) => ct.customer_id === c.id && ct.status === "active")) {
      checks.push({
        id: `cust-contract-${c.id}`,
        area: "Customer",
        issue: "Active customer has no active contract",
        detail: c.name,
        href: `/customers/${c.id}`,
      });
    }
  }

  for (const ct of contracts.filter((x) => x.status === "active")) {
    if (!ct.payment_terms) {
      checks.push({
        id: `ct-terms-${ct.id}`,
        area: "Contract",
        issue: "Missing payment terms",
        detail: `${ct.contract_number} · ${ct.name}`,
        href: `/contracts/${ct.id}`,
      });
    }
    if (!ct.billing_frequency) {
      checks.push({
        id: `ct-billing-${ct.id}`,
        area: "Contract",
        issue: "Missing billing frequency",
        detail: `${ct.contract_number} · ${ct.name}`,
        href: `/contracts/${ct.id}`,
      });
    }
  }

  for (const t of tickets) {
    if (!t.assigned_technician_id) {
      checks.push({
        id: `tkt-assign-${t.id}`,
        area: "Ticket",
        issue: "Open ticket is unassigned",
        detail: `${t.ticket_number} · ${t.title}`,
        href: `/tickets/${t.id}`,
      });
    }
    if (!t.contract_id) {
      checks.push({
        id: `tkt-contract-${t.id}`,
        area: "Ticket",
        issue: "Open ticket has no contract link",
        detail: `${t.ticket_number} · ${t.title}`,
        href: `/tickets/${t.id}`,
      });
    }
  }

  for (const u of users.filter((x) => x.is_active)) {
    if (u.role === "customer" && !u.customer_id) {
      checks.push({
        id: `user-cust-${u.id}`,
        area: "User Access",
        issue: "Customer user missing customer link",
        detail: `${u.full_name} · ${u.email}`,
        href: "/admin/users",
      });
    }
  }

  for (const p of projects) {
    if (!p.contract_id) {
      checks.push({
        id: `proj-contract-${p.id}`,
        area: "Project",
        issue: "Active/open project missing contract",
        detail: p.name,
        href: `/projects/${p.id}`,
      });
    }
  }

  const byArea = checks.reduce<Record<string, number>>((acc, c) => {
    acc[c.area] = (acc[c.area] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Data Quality"
        description="Missing links and incomplete records that can break billing, service, or access controls."
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Admin Console
          </Link>
        }
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Issues" value={String(checks.length)} tone={checks.length ? "warning" : "success"} />
        <StatCard label="Customer Issues" value={String(byArea.Customer ?? 0)} />
        <StatCard label="Ticket Issues" value={String(byArea.Ticket ?? 0)} />
        <StatCard label="Access Issues" value={String(byArea["User Access"] ?? 0)} />
      </div>

      {checks.length === 0 ? (
        <EmptyState title="No data quality issues found" description="Customers, contracts, tickets, and user links look complete." />
      ) : (
        <DataTable headers={["Area", "Issue", "Record", "Open"]}>
          {checks.map((c) => (
            <tr key={c.id}>
              <td>
                <StatusBadge status={c.area.toLowerCase().replace(" ", "_")} />
              </td>
              <td>{c.issue}</td>
              <td className="max-w-md">{c.detail}</td>
              <td>
                {c.href ? (
                  <Link href={c.href} className="btn btn-ghost btn-xs">
                    Review
                  </Link>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
