import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireApprovedCustomer } from "@/lib/auth";
import { PageHeader, DataTable, EmptyState, StatusBadge, ErrorState, DateText } from "@/components/ui";
import { SupportRequestForm } from "@/components/SupportRequestForm";
import { slaStatus } from "@/lib/calculations";

export default async function SupportRequestsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "customer" || !profile.customer_id) redirect("/tickets");
  await requireApprovedCustomer(profile);

  const supabase = await createClient();
  const customerId = profile.customer_id;

  const [ticketsRes, contractsRes] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("id, ticket_number, title, priority, status, submitted_at, target_response_at, target_resolution_at, actual_response_at, completed_at, customer_resolution_summary")
      .eq("customer_id", customerId)
      .order("submitted_at", { ascending: false }),
    supabase.from("contracts").select("id, name, contract_number").eq("customer_id", customerId).eq("status", "active"),
  ]);

  if (ticketsRes.error) {
    return (
      <div>
        <PageHeader title="Support Requests" />
        <ErrorState message={ticketsRes.error.message} />
      </div>
    );
  }

  const tickets = ticketsRes.data ?? [];
  const contracts = (contractsRes.data ?? []).map((c) => ({ id: c.id, label: `${c.contract_number} · ${c.name}` }));

  return (
    <div>
      <PageHeader title="Support Requests" description="Submit new requests and track the status of ones you've already sent us." />

      <SupportRequestForm customerId={customerId} createdBy={profile.id} contracts={contracts} />

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Your Requests</h2>
        {tickets.length === 0 ? (
          <EmptyState title="No requests yet" description="Submit your first support request using the form above." />
        ) : (
          <DataTable headers={["Ticket", "Priority", "Status", "SLA", "Submitted"]}>
            {tickets.map((t) => {
              const response = slaStatus(t.target_response_at, t.actual_response_at);
              const resolution = slaStatus(t.target_resolution_at, t.completed_at);
              const sla = response === "missed" || resolution === "missed" ? "missed" : response === "at_risk" || resolution === "at_risk" ? "at_risk" : response;
              return (
                <tr key={t.id}>
                  <td>
                    <Link className="link link-hover font-medium" href={`/tickets/${t.id}`}>
                      {t.ticket_number} · {t.title}
                    </Link>
                    {t.customer_resolution_summary ? <p className="mt-1 max-w-md truncate text-xs opacity-60">{t.customer_resolution_summary}</p> : null}
                  </td>
                  <td>
                    <StatusBadge status={t.priority} />
                  </td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                  <td>
                    <StatusBadge status={sla} />
                  </td>
                  <td>
                    <DateText value={t.submitted_at} />
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </div>
    </div>
  );
}
