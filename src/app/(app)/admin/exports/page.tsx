import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, OPEN_TICKET_STATUSES } from "@/lib/admin";
import { PageHeader, ErrorState } from "@/components/ui";
import { CsvExportButton } from "@/components/CsvExportButton";
import { slaStatus } from "@/lib/calculations";

export default async function AdminExportsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    usersRes,
    ticketsRes,
    pendingWorkRes,
    overdueRes,
    contractsRes,
    workloadTicketsRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, role, is_active, is_demo_user, internal_cost_rate")
      .order("full_name"),
    supabase
      .from("support_tickets")
      .select(
        "ticket_number, title, status, priority, assigned_technician_id, target_resolution_at, completed_at, customers(name)"
      )
      .in("status", OPEN_TICKET_STATUSES),
    supabase
      .from("additional_work_requests")
      .select("title, estimated_hours, estimated_amount, created_at, customers(name)")
      .eq("approval_status", "pending"),
    supabase
      .from("invoices")
      .select("invoice_number, status, due_date, remaining_balance, total_amount, customers(name)")
      .or(`status.eq.overdue,and(due_date.lt.${today},remaining_balance.gt.0)`),
    supabase
      .from("contracts")
      .select("contract_number, name, status, end_date, monthly_recurring_fee, customers(name)")
      .in("status", ["active", "on_hold", "pending_approval", "expired"]),
    supabase
      .from("support_tickets")
      .select("assigned_technician_id, status, priority")
      .in("status", OPEN_TICKET_STATUSES),
  ]);

  const error =
    usersRes.error ||
    ticketsRes.error ||
    pendingWorkRes.error ||
    overdueRes.error ||
    contractsRes.error ||
    workloadTicketsRes.error;

  if (error) {
    return (
      <div>
        <PageHeader title="CSV Exports" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const techIds = Array.from(
    new Set(
      (ticketsRes.data ?? [])
        .map((t) => t.assigned_technician_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const techsRes = techIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", techIds)
    : { data: [] as { id: string; full_name: string }[] };
  const techName = new Map((techsRes.data ?? []).map((p) => [p.id, p.full_name]));

  const allTechs = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "technician")
    .eq("is_active", true);

  const unassignedCount = (workloadTicketsRes.data ?? []).filter((t) => !t.assigned_technician_id).length;

  const workloadRows = [
    ["(unassigned)", unassignedCount, (workloadTicketsRes.data ?? []).filter((t) => !t.assigned_technician_id && (t.priority === "critical" || t.priority === "high")).length],
    ...(allTechs.data ?? []).map((tech) => {
      const open = (workloadTicketsRes.data ?? []).filter((t) => t.assigned_technician_id === tech.id);
      const critical = open.filter((t) => t.priority === "critical" || t.priority === "high").length;
      return [tech.full_name, open.length, critical];
    }),
  ];

  const usersCsv = (usersRes.data ?? []).map((u) => [
    u.full_name,
    u.email,
    u.role,
    u.is_active ? "active" : "inactive",
    u.is_demo_user ? "yes" : "no",
    u.internal_cost_rate ?? "",
  ]);

  const exceptionsCsv = (ticketsRes.data ?? [])
    .map((t) => {
      const customer = Array.isArray(t.customers) ? t.customers[0] : t.customers;
      const sla = slaStatus(t.target_resolution_at, t.completed_at);
      return {
        ticket_number: t.ticket_number,
        title: t.title,
        customer: customer?.name ?? "",
        status: t.status,
        priority: t.priority,
        technician: t.assigned_technician_id ? techName.get(t.assigned_technician_id) ?? "" : "UNASSIGNED",
        sla,
      };
    })
    .filter((t) => t.sla === "at_risk" || t.sla === "missed" || t.technician === "UNASSIGNED")
    .map((t) => [t.ticket_number, t.title, t.customer, t.status, t.priority, t.technician, t.sla]);

  const approvalsCsv = (pendingWorkRes.data ?? []).map((w) => {
    const customer = Array.isArray(w.customers) ? w.customers[0] : w.customers;
    return [w.title, customer?.name ?? "", w.estimated_hours ?? "", w.estimated_amount ?? "", w.created_at];
  });

  const overdueCsv = (overdueRes.data ?? []).map((inv) => {
    const customer = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
    return [
      inv.invoice_number,
      customer?.name ?? "",
      inv.status,
      inv.due_date,
      inv.remaining_balance,
      inv.total_amount,
    ];
  });

  const contractsCsv = (contractsRes.data ?? []).map((c) => {
    const customer = Array.isArray(c.customers) ? c.customers[0] : c.customers;
    return [
      c.contract_number,
      c.name,
      customer?.name ?? "",
      c.status,
      c.end_date ?? "",
      c.monthly_recurring_fee ?? 0,
    ];
  });

  const exports = [
    {
      title: "Users",
      description: "All profiles with role, status, and cost rate.",
      filename: "users",
      headers: ["Name", "Email", "Role", "Status", "Demo", "Cost rate"],
      rows: usersCsv,
    },
    {
      title: "Exceptions (SLA + unassigned)",
      description: "Open tickets that are at-risk, missed SLA, or unassigned.",
      filename: "exceptions",
      headers: ["Ticket #", "Title", "Customer", "Status", "Priority", "Technician", "SLA"],
      rows: exceptionsCsv,
    },
    {
      title: "Pending additional work",
      description: "Additional work requests waiting on approval.",
      filename: "pending-approvals-work",
      headers: ["Title", "Customer", "Hours", "Amount", "Created"],
      rows: approvalsCsv,
    },
    {
      title: "Overdue invoices",
      description: "Invoices past due with remaining balance.",
      filename: "overdue-invoices",
      headers: ["Invoice #", "Customer", "Status", "Due", "Remaining", "Total"],
      rows: overdueCsv,
    },
    {
      title: "Contracts",
      description: "Active, on-hold, pending, and expired contracts.",
      filename: "contracts",
      headers: ["Contract #", "Name", "Customer", "Status", "End date", "Monthly fee"],
      rows: contractsCsv,
    },
    {
      title: "Technician workload",
      description: `Open tickets by technician (${unassignedCount} unassigned company-wide).`,
      filename: "technician-workload",
      headers: ["Technician", "Open tickets", "High/critical"],
      rows: workloadRows,
    },
  ];

  return (
    <div>
      <PageHeader
        title="CSV Exports"
        description="Download admin snapshots for class demos, reviews, and offline analysis."
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Admin
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {exports.map((item) => (
          <div key={item.filename} className="rounded-box border border-base-300 bg-base-100 p-4">
            <p className="font-semibold">{item.title}</p>
            <p className="mt-1 text-sm opacity-70">{item.description}</p>
            <p className="mt-2 text-xs opacity-50">{item.rows.length} row(s)</p>
            <div className="mt-3">
              <CsvExportButton
                filename={item.filename}
                headers={item.headers}
                rows={item.rows}
                label={`Download ${item.filename}.csv`}
                className="btn btn-sm btn-primary"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
