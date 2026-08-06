import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireApprovedCustomer } from "@/lib/auth";
import { PageHeader, EmptyState, ErrorState } from "@/components/ui";
import { SupportRequestForm } from "@/components/SupportRequestForm";
import { TicketListClient, type TicketListItem } from "@/components/TicketListClient";

export default async function SupportRequestsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "customer" || !profile.customer_id) redirect("/tickets");
  await requireApprovedCustomer(profile);

  const supabase = await createClient();
  const customerId = profile.customer_id;

  const [ticketsRes, contractsRes, customerRes] = await Promise.all([
    supabase
      .from("support_tickets")
      .select(
        "id, ticket_number, customer_id, contract_id, title, description, priority, status, service_category, submitted_at, target_response_at, target_resolution_at, actual_response_at, completed_at, assigned_technician_id, customer_resolution_summary"
      )
      .eq("customer_id", customerId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("contracts")
      .select("id, name, contract_number")
      .eq("customer_id", customerId)
      .eq("status", "active")
      .order("contract_number"),
    supabase.from("customers").select("id, name").eq("id", customerId).maybeSingle(),
  ]);

  if (ticketsRes.error) {
    return (
      <div>
        <PageHeader title="Make a Request" />
        <ErrorState message={`We couldn't load your support requests. ${ticketsRes.error.message}`} />
      </div>
    );
  }

  const tickets = ticketsRes.data ?? [];
  const contracts = (contractsRes.data ?? []).map((c) => ({
    id: c.id,
    label: `${c.contract_number ?? "Contract"} · ${c.name}`,
  }));
  const customerName = customerRes.data?.name ?? "Your organization";

  const contractIds = Array.from(new Set(tickets.map((t) => t.contract_id).filter((v): v is string => Boolean(v))));
  const technicianIds = Array.from(
    new Set(tickets.map((t) => t.assigned_technician_id).filter((v): v is string => Boolean(v)))
  );

  const [contractRowsRes, techRowsRes] = await Promise.all([
    contractIds.length
      ? supabase.from("contracts").select("id, name, contract_number").in("id", contractIds)
      : Promise.resolve({ data: [] as { id: string; name: string; contract_number: string | null }[] }),
    technicianIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", technicianIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  const contractLabel = new Map(
    (contractRowsRes.data ?? []).map((c) => [c.id, `${c.contract_number ?? "Contract"} · ${c.name}`])
  );
  const technicianName = new Map((techRowsRes.data ?? []).map((t) => [t.id, t.full_name]));

  const listItems: TicketListItem[] = tickets.map((t) => ({
    id: t.id,
    ticket_number: t.ticket_number,
    title: t.title,
    description: t.description ?? "",
    customer_id: t.customer_id,
    customer_name: customerName,
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
  }));

  const categories = Array.from(
    new Set(listItems.map((t) => t.service_category).filter((v): v is string => Boolean(v)))
  ).sort();

  return (
    <div>
      <PageHeader
        title="Make a Request"
        description="Submit new requests and track tickets for your organization."
      />

      <div id="submit-request">
        <SupportRequestForm
          customerId={customerId}
          customerName={customerName}
          createdBy={profile.id}
          contracts={contracts}
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Your organization&apos;s tickets</h2>
        {listItems.length === 0 ? (
          <EmptyState
            title="No requests yet"
            description="Submit your first support request using the form above."
          />
        ) : (
          <TicketListClient
            tickets={listItems}
            role="customer"
            customers={[{ id: customerId, name: customerName }]}
            technicians={[]}
            categories={categories}
          />
        )}
      </div>
    </div>
  );
}
