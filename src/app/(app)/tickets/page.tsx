import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader, DataTable, EmptyState, StatusBadge, ErrorState, DateText } from "@/components/ui";
import { slaStatus } from "@/lib/calculations";
import type { SupportTicket } from "@/lib/types";

export default async function TicketsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "customer") redirect("/support-requests");

  const supabase = await createClient();

  const { data: tickets, error } = await supabase
    .from("support_tickets")
    .select(
      "id, ticket_number, customer_id, title, priority, status, submitted_at, target_response_at, target_resolution_at, actual_response_at, completed_at, assigned_technician_id"
    )
    .order("submitted_at", { ascending: false });

  if (error) {
    return (
      <div>
        <PageHeader title="Support Tickets" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const rows = (tickets ?? []) as SupportTicket[];
  const customerIds = Array.from(new Set(rows.map((t) => t.customer_id)));
  const technicianIds = Array.from(new Set(rows.map((t) => t.assigned_technician_id).filter((v): v is string => Boolean(v))));

  const [customersRes, techniciansRes] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    technicianIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", technicianIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const customerName = new Map((customersRes.data ?? []).map((c) => [c.id, c.name]));
  const technicianName = new Map((techniciansRes.data ?? []).map((t) => [t.id, t.full_name]));

  function slaSeverity(t: SupportTicket) {
    const response = slaStatus(t.target_response_at, t.actual_response_at);
    const resolution = slaStatus(t.target_resolution_at, t.completed_at);
    if (response === "missed" || resolution === "missed") return "missed";
    if (response === "at_risk" || resolution === "at_risk") return "at_risk";
    if (response === "met" && resolution === "met") return "met";
    return "pending";
  }

  return (
    <div>
      <PageHeader
        title="Support Tickets"
        description={`${rows.length} ticket${rows.length === 1 ? "" : "s"} visible to your role.`}
        actions={
          profile.role === "manager" || profile.role === "technician" ? (
            <Link href="/support-requests" className="btn btn-sm btn-outline">
              View Submitted Requests
            </Link>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No tickets yet" description="Support tickets submitted by customers will appear here." />
      ) : (
        <DataTable headers={["Ticket", "Customer", "Priority", "Status", "SLA", "Assigned To", "Submitted"]}>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>
                <Link className="link link-hover font-medium" href={`/tickets/${t.id}`}>
                  {t.ticket_number}
                </Link>
                <div className="text-xs opacity-60">{t.title}</div>
              </td>
              <td>{customerName.get(t.customer_id) ?? "—"}</td>
              <td>
                <StatusBadge status={t.priority} />
              </td>
              <td>
                <StatusBadge status={t.status} />
              </td>
              <td>
                <StatusBadge status={slaSeverity(t)} />
              </td>
              <td>{t.assigned_technician_id ? technicianName.get(t.assigned_technician_id) ?? "—" : "Unassigned"}</td>
              <td>
                <DateText value={t.submitted_at} />
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
