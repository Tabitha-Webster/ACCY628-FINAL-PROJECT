import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, OPEN_TICKET_STATUSES } from "@/lib/admin";
import { PageHeader, StatCard, ErrorState, DataTable, StatusBadge, Money, DateText } from "@/components/ui";

export default async function AdminSystemHealthPage() {
  await requireAdmin();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    profilesRes,
    customersRes,
    contractsRes,
    ticketsRes,
    pendingWorkRes,
    pendingTimeRes,
    pendingCostsRes,
    invoicesRes,
    disputesRes,
    projectsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("id, role, is_active, is_demo_user"),
    supabase.from("customers").select("id, status"),
    supabase.from("contracts").select("id, status, end_date"),
    supabase.from("support_tickets").select("id, status").in("status", OPEN_TICKET_STATUSES),
    supabase.from("additional_work_requests").select("id").eq("approval_status", "pending"),
    supabase.from("time_entries").select("id").eq("approval_status", "pending"),
    supabase.from("direct_costs").select("id").eq("approval_status", "pending"),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, due_date, remaining_balance, customers(name)")
      .in("status", ["issued", "partially_paid", "overdue"])
      .gt("remaining_balance", 0)
      .order("due_date", { ascending: true })
      .limit(8),
    supabase.from("disputes").select("id").in("resolution_status", ["open", "under_review"]),
    supabase.from("projects").select("id, status").not("status", "in", "(closed,canceled)"),
  ]);

  const error =
    profilesRes.error ||
    customersRes.error ||
    contractsRes.error ||
    ticketsRes.error ||
    pendingWorkRes.error ||
    pendingTimeRes.error ||
    pendingCostsRes.error ||
    invoicesRes.error ||
    disputesRes.error ||
    projectsRes.error;

  const profiles = profilesRes.data ?? [];
  const customers = customersRes.data ?? [];
  const contracts = contractsRes.data ?? [];
  const openInvoices = invoicesRes.data ?? [];
  const overdueInvoices = openInvoices.filter((i) => i.due_date < today || i.status === "overdue");
  const activeCustomers = customers.filter((c) => c.status === "active").length;
  const activeContracts = contracts.filter((c) => c.status === "active").length;
  const endingSoon = contracts.filter(
    (c) => c.status === "active" && c.end_date && c.end_date <= new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)
  ).length;

  return (
    <div>
      <PageHeader
        title="System Health"
        description="Company-wide pulse across users, service delivery, billing, and open risk items."
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Admin Console
          </Link>
        }
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Customers" value={String(activeCustomers)} />
        <StatCard label="Active Contracts" value={String(activeContracts)} hint={`${endingSoon} ending in 60 days`} />
        <StatCard label="Open Tickets" value={String(ticketsRes.data?.length ?? 0)} />
        <StatCard label="Active Projects" value={String(projectsRes.data?.length ?? 0)} />
        <StatCard label="Users" value={String(profiles.length)} hint={`${profiles.filter((p) => !p.is_active).length} inactive`} />
        <StatCard
          label="Pending Approvals"
          value={String(
            (pendingWorkRes.data?.length ?? 0) + (pendingTimeRes.data?.length ?? 0) + (pendingCostsRes.data?.length ?? 0)
          )}
          tone={
            (pendingWorkRes.data?.length ?? 0) + (pendingTimeRes.data?.length ?? 0) + (pendingCostsRes.data?.length ?? 0) > 0
              ? "warning"
              : "success"
          }
          hint="Additional work + time + costs"
        />
        <StatCard
          label="Open AR Invoices"
          value={String(openInvoices.length)}
          tone={overdueInvoices.length > 0 ? "error" : "default"}
          hint={`${overdueInvoices.length} overdue / past due`}
        />
        <StatCard
          label="Open Disputes"
          value={String(disputesRes.data?.length ?? 0)}
          tone={(disputesRes.data?.length ?? 0) > 0 ? "warning" : "success"}
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold">Open invoices needing attention</h2>
        {openInvoices.length === 0 ? (
          <p className="text-sm opacity-60">No open invoice balances right now.</p>
        ) : (
          <DataTable headers={["Invoice", "Customer", "Due", "Status", "Balance"]}>
            {openInvoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <Link className="link link-hover" href={`/invoices/${inv.id}`}>
                    {inv.invoice_number}
                  </Link>
                </td>
                <td>{(inv.customers as { name?: string } | null)?.name ?? "—"}</td>
                <td>
                  <DateText value={inv.due_date} />
                </td>
                <td>
                  <StatusBadge status={inv.status} />
                </td>
                <td>
                  <Money value={Number(inv.remaining_balance)} />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/admin/exceptions" className="btn btn-sm btn-primary">
          Open exceptions queue
        </Link>
        <Link href="/admin/data-quality" className="btn btn-sm btn-outline">
          Data quality checks
        </Link>
        <Link href="/billing-collections" className="btn btn-sm btn-outline">
          Billing and collections
        </Link>
      </div>
    </div>
  );
}
