import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { DataTable, EmptyState, ErrorState, Hours, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { formatDate, statusLabel } from "@/lib/format";
import { slaStatus, usagePercentage, usageStatus } from "@/lib/calculations";

const OPEN_TICKET_STATUSES = ["new", "assigned", "in_progress", "waiting_on_customer", "waiting_on_approval"];

function slaBadgeClass(status: "met" | "at_risk" | "missed" | "pending") {
  if (status === "missed") return "badge-error";
  if (status === "at_risk") return "badge-warning";
  if (status === "met") return "badge-success";
  return "badge-ghost";
}

export default async function OperationsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager") redirect("/dashboard");

  const supabase = await createClient();

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

  const [
    { data: openTickets, error: ticketsError },
    { data: pendingWork, error: workError },
    { data: activeContracts, error: contractsError },
    { data: monthEntries, error: entriesError },
  ] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("id, ticket_number, title, status, priority, target_resolution_at, completed_at, customers(name)")
      .in("status", OPEN_TICKET_STATUSES)
      .order("target_resolution_at", { ascending: true }),
    supabase
      .from("additional_work_requests")
      .select("id, title, estimated_hours, estimated_amount, created_at, customers(name), contracts(name)")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("contracts")
      .select("id, name, contract_number, included_hours_per_month, customers(name)")
      .eq("status", "active"),
    supabase
      .from("time_entries")
      .select("contract_id, hours_worked")
      .eq("classification", "included")
      .gte("work_date", monthStart)
      .lt("work_date", monthEnd),
  ]);

  const error = ticketsError || workError || contractsError || entriesError;

  const ticketsWithSla = (openTickets ?? []).map((t) => ({
    ...t,
    sla: slaStatus(t.target_resolution_at, t.completed_at, now),
  }));
  const atRiskOrMissed = ticketsWithSla.filter((t) => t.sla === "at_risk" || t.sla === "missed");

  const hoursByContract = new Map<string, number>();
  for (const entry of monthEntries ?? []) {
    if (!entry.contract_id) continue;
    hoursByContract.set(entry.contract_id, (hoursByContract.get(entry.contract_id) ?? 0) + Number(entry.hours_worked ?? 0));
  }

  const contractsOverHours = (activeContracts ?? [])
    .map((c) => {
      const used = hoursByContract.get(c.id) ?? 0;
      const included = Number(c.included_hours_per_month ?? 0);
      const pct = usagePercentage(used, included);
      return { ...c, used, included, pct, status: usageStatus(pct) };
    })
    .filter((c) => c.status === "over_limit")
    .sort((a, b) => b.pct - a.pct);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Operations"
        description="Ticket load, SLA exposure, pending work requests, and hour usage across active contracts."
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open Tickets" value={String(openTickets?.length ?? 0)} />
        <StatCard
          label="SLA At Risk / Missed"
          value={String(atRiskOrMissed.length)}
          tone={atRiskOrMissed.length > 0 ? "error" : "default"}
        />
        <StatCard
          label="Pending Work Requests"
          value={String(pendingWork?.length ?? 0)}
          tone={(pendingWork?.length ?? 0) > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Contracts Over Hours"
          value={String(contractsOverHours.length)}
          tone={contractsOverHours.length > 0 ? "error" : "default"}
        />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">SLA At Risk or Missed</h2>
        {atRiskOrMissed.length > 0 ? (
          <DataTable headers={["Ticket", "Customer", "Priority", "Target Resolution", "SLA"]}>
            {atRiskOrMissed.map((ticket) => {
              const customer = Array.isArray(ticket.customers) ? ticket.customers[0] : ticket.customers;
              return (
                <tr key={ticket.id}>
                  <td>
                    <div className="font-medium">{ticket.title}</div>
                    <div className="text-xs opacity-60">{ticket.ticket_number}</div>
                  </td>
                  <td>{customer?.name ?? "—"}</td>
                  <td className="text-xs capitalize">{ticket.priority}</td>
                  <td className="text-xs">{formatDate(ticket.target_resolution_at)}</td>
                  <td>
                    <span className={`badge ${slaBadgeClass(ticket.sla)}`}>{statusLabel(ticket.sla)}</span>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title="No tickets are at risk of missing their SLA" />
        )}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">All Open Tickets</h2>
        {openTickets && openTickets.length > 0 ? (
          <DataTable headers={["Ticket", "Customer", "Priority", "Status", "Target Resolution"]}>
            {ticketsWithSla.map((ticket) => {
              const customer = Array.isArray(ticket.customers) ? ticket.customers[0] : ticket.customers;
              return (
                <tr key={ticket.id}>
                  <td className="font-medium">{ticket.title}</td>
                  <td>{customer?.name ?? "—"}</td>
                  <td className="text-xs capitalize">{ticket.priority}</td>
                  <td>
                    <StatusBadge status={ticket.status} />
                  </td>
                  <td className="text-xs">{formatDate(ticket.target_resolution_at)}</td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title="No open tickets" description="All support tickets are resolved, closed, or canceled." />
        )}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Pending Additional Work Requests</h2>
        {pendingWork && pendingWork.length > 0 ? (
          <DataTable headers={["Request", "Customer", "Contract", "Est. Hours", "Est. Amount", "Requested"]}>
            {pendingWork.map((req) => {
              const customer = Array.isArray(req.customers) ? req.customers[0] : req.customers;
              const contract = Array.isArray(req.contracts) ? req.contracts[0] : req.contracts;
              return (
                <tr key={req.id}>
                  <td className="font-medium">{req.title}</td>
                  <td>{customer?.name ?? "—"}</td>
                  <td>{contract?.name ?? "—"}</td>
                  <td>
                    <Hours value={Number(req.estimated_hours ?? 0)} />
                  </td>
                  <td>{req.estimated_amount ? `$${Number(req.estimated_amount).toFixed(2)}` : "—"}</td>
                  <td className="text-xs">{formatDate(req.created_at)}</td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title="No additional work requests are awaiting review" />
        )}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Contracts Over Included Hours (This Month)</h2>
        {contractsOverHours.length > 0 ? (
          <DataTable headers={["Contract", "Customer", "Used", "Included", "% Used"]}>
            {contractsOverHours.map((contract) => {
              const customer = Array.isArray(contract.customers) ? contract.customers[0] : contract.customers;
              return (
                <tr key={contract.id}>
                  <td>
                    <Link href={`/contracts/${contract.id}`} className="link link-hover font-medium">
                      {contract.name}
                    </Link>
                    <div className="text-xs opacity-60">{contract.contract_number}</div>
                  </td>
                  <td>{customer?.name ?? "—"}</td>
                  <td>
                    <Hours value={contract.used} />
                  </td>
                  <td>
                    <Hours value={contract.included} />
                  </td>
                  <td>
                    <span className="badge badge-error">{contract.pct.toFixed(0)}%</span>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title="No active contracts are over their included hours this month" />
        )}
      </div>
    </div>
  );
}
