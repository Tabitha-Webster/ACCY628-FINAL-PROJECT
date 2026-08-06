import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ErrorState } from "@/components/ui";
import { TicketListClient, type TicketListItem } from "@/components/TicketListClient";

export default async function TicketsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // Customers submit from Support Requests; keep that as their primary entry.
  if (profile.role === "customer") redirect("/support-requests");

  const params = (await searchParams) ?? {};
  const priorityParam = typeof params.priority === "string" ? params.priority : "";

  const supabase = await createClient();

  let query = supabase
    .from("support_tickets")
    .select(
      "id, ticket_number, customer_id, contract_id, title, description, priority, status, service_category, submitted_at, target_response_at, target_resolution_at, actual_response_at, completed_at, assigned_technician_id, classification, billable_approval_status, service_mode, service_location"
    )
    .order("submitted_at", { ascending: false });

  if (profile.role === "technician") {
    query = query.eq("assigned_technician_id", profile.id);
  } else if (profile.role === "billing") {
    query = query.or(
      "status.in.(resolved,closed),billable_approval_status.eq.approved,classification.eq.billable"
    );
  }

  const { data: tickets, error } = await query;

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Support Tickets</h1>
        <ErrorState message={`We couldn't load support tickets right now. ${error.message}`} />
      </div>
    );
  }

  const rows = tickets ?? [];
  const customerIds = Array.from(new Set(rows.map((t) => t.customer_id)));
  const contractIds = Array.from(new Set(rows.map((t) => t.contract_id).filter((v): v is string => Boolean(v))));
  const technicianIds = Array.from(
    new Set(rows.map((t) => t.assigned_technician_id).filter((v): v is string => Boolean(v)))
  );

  const [customersRes, contractsRes, techniciansRes, allTechsRes] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name").in("id", customerIds).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    contractIds.length
      ? supabase.from("contracts").select("id, name, contract_number").in("id", contractIds)
      : Promise.resolve({ data: [] as { id: string; name: string; contract_number: string | null }[] }),
    technicianIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", technicianIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    profile.role === "manager" || profile.role === "billing"
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .eq("role", "technician")
          .eq("is_active", true)
          .order("full_name")
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  const customerName = new Map((customersRes.data ?? []).map((c) => [c.id, c.name]));
  const contractLabel = new Map(
    (contractsRes.data ?? []).map((c) => [
      c.id,
      `${c.contract_number ?? "Contract"} · ${c.name}`,
    ])
  );
  const technicianName = new Map((techniciansRes.data ?? []).map((t) => [t.id, t.full_name]));

  const listItems: TicketListItem[] = rows.map((t) => ({
    id: t.id,
    ticket_number: t.ticket_number,
    title: t.title,
    description: t.description ?? "",
    customer_id: t.customer_id,
    customer_name: customerName.get(t.customer_id) ?? "Unknown customer",
    contract_id: t.contract_id,
    contract_label: t.contract_id ? contractLabel.get(t.contract_id) ?? null : null,
    priority: t.priority,
    service_category: t.service_category,
    status: t.status,
    assigned_technician_id: t.assigned_technician_id,
    assigned_technician_name: t.assigned_technician_id
      ? technicianName.get(t.assigned_technician_id) ?? "Unknown technician"
      : null,
    submitted_at: t.submitted_at,
    target_response_at: t.target_response_at,
    target_resolution_at: t.target_resolution_at,
    actual_response_at: t.actual_response_at,
    completed_at: t.completed_at,
    service_mode: t.service_mode ?? null,
    service_location: t.service_location ?? null,
  }));

  const categories = Array.from(
    new Set(listItems.map((t) => t.service_category).filter((v): v is string => Boolean(v)))
  ).sort();

  const filterCustomers = (customersRes.data ?? []).map((c) => ({ id: c.id, name: c.name }));
  const filterTechnicians = (allTechsRes.data ?? []).map((t) => ({ id: t.id, name: t.full_name }));

  const roleDescription =
    profile.role === "technician"
      ? "Tickets currently assigned to you."
      : profile.role === "billing"
        ? "Completed or approved billable tickets (view only)."
        : "All support tickets across customers.";

  return (
    <TicketListClient
      tickets={listItems}
      role={profile.role}
      customers={filterCustomers}
      technicians={filterTechnicians}
      categories={categories}
      initialPriority={priorityParam}
      title="Support Tickets"
      subtitle={`${listItems.length} ticket${listItems.length === 1 ? "" : "s"} · ${roleDescription}`}
      headerAction={
        profile.role === "manager" ? (
          <Link href="/operations" className="btn btn-sm btn-outline">
            Service Tickets
          </Link>
        ) : null
      }
    />
  );
}
