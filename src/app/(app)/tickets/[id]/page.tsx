import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader, DataTable, EmptyState, StatusBadge, ErrorState, Money, Hours, DateText } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { slaStatus } from "@/lib/calculations";
import { TicketActions } from "@/components/TicketActions";
import { ContractRequirementsCard } from "@/components/ContractRequirementsCard";
import { TimeCostForm } from "@/components/TimeCostForm";
import type { SupportTicket } from "@/lib/types";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: ticket, error } = await supabase.from("support_tickets").select("*").eq("id", id).maybeSingle();

  if (error) {
    return (
      <div>
        <PageHeader title="Ticket" />
        <ErrorState message={error.message} />
      </div>
    );
  }
  if (!ticket) {
    return (
      <div>
        <PageHeader title="Ticket" />
        <EmptyState title="Ticket not found" description="It may have been removed, or you may not have access to it." />
      </div>
    );
  }
  const t = ticket as SupportTicket;
  const isTechnician = profile.role === "technician";

  const [customerRes, contractRes, technicianRes, timeEntriesRes, additionalWorkRes, formOptionsRes] =
    await Promise.all([
      supabase.from("customers").select("id, name, primary_contact, contact_email").eq("id", t.customer_id).maybeSingle(),
      t.contract_id
        ? supabase
            .from("contracts")
            .select(
              "id, name, contract_number, included_hours_per_month, additional_hourly_rate, sla_response_hours, sla_resolution_hours, scope, included_services, excluded_services, customer_id"
            )
            .eq("id", t.contract_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      t.assigned_technician_id
        ? supabase.from("profiles").select("id, full_name, email").eq("id", t.assigned_technician_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("time_entries")
        .select("id, technician_id, work_date, hours_worked, classification, description, labor_cost, billing_rate")
        .eq("support_ticket_id", t.id)
        .order("work_date", { ascending: false }),
      supabase
        .from("additional_work_requests")
        .select("id, title, description, estimated_hours, estimated_amount, approval_status, reviewed_at, created_at")
        .eq("support_ticket_id", t.id)
        .order("created_at", { ascending: false }),
      isTechnician
        ? Promise.all([
            supabase.from("customers").select("id, name").eq("status", "active").order("name"),
            supabase
              .from("contracts")
              .select("id, name, contract_number, customer_id, additional_hourly_rate")
              .eq("status", "active"),
            supabase
              .from("support_tickets")
              .select("id, ticket_number, title, customer_id")
              .not("status", "in", "(resolved,closed,canceled)"),
            supabase.from("projects").select("id, name, customer_id").not("status", "in", "(closed,canceled)"),
          ])
        : Promise.resolve(null),
    ]);

  const timeEntries = timeEntriesRes.data ?? [];
  const technicianIds = Array.from(new Set(timeEntries.map((e) => e.technician_id)));
  const techniciansRes = technicianIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", technicianIds)
    : { data: [] as { id: string; full_name: string }[] };
  const technicianName = new Map((techniciansRes.data ?? []).map((p) => [p.id, p.full_name]));

  const responseSla = slaStatus(t.target_response_at, t.actual_response_at);
  const resolutionSla = slaStatus(t.target_resolution_at, t.completed_at);
  const totalHours = timeEntries.reduce((sum, e) => sum + Number(e.hours_worked), 0);
  const hasTimeLogged = timeEntries.some((e) => e.technician_id === profile.id);

  const formCustomers = formOptionsRes?.[0].data ?? [];
  const formContracts = (formOptionsRes?.[1].data ?? []).map((c) => ({
    id: c.id,
    customerId: c.customer_id,
    label: `${c.contract_number} · ${c.name}`,
    additionalHourlyRate: Number(c.additional_hourly_rate),
  }));
  const formTickets = (formOptionsRes?.[2].data ?? []).map((ticketRow) => ({
    id: ticketRow.id,
    customerId: ticketRow.customer_id,
    label: `${ticketRow.ticket_number} · ${ticketRow.title}`,
  }));
  const formProjects = (formOptionsRes?.[3].data ?? []).map((p) => ({
    id: p.id,
    customerId: p.customer_id,
    label: p.name,
  }));

  return (
    <div>
      <PageHeader
        title={`${t.ticket_number} · ${t.title}`}
        description={customerRes.data?.name ?? undefined}
        actions={
          <div className="flex gap-2">
            {isTechnician ? (
              <Link href="/assignments" className="btn btn-sm btn-outline">
                Back to Assignments
              </Link>
            ) : null}
            <Link href="/tickets" className="btn btn-sm btn-outline">
              Back to Tickets
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-box border border-base-300 bg-base-100 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={t.status} />
              <StatusBadge status={t.priority} />
              {t.classification && t.classification !== "included" ? <StatusBadge status={t.classification} /> : null}
            </div>
            <p className="text-sm leading-relaxed">{t.description}</p>
            {t.service_category ? <p className="mt-2 text-xs opacity-60">Category: {t.service_category}</p> : null}
          </div>

          <ContractRequirementsCard contract={contractRes.data} />

          <div className="rounded-box border border-base-300 bg-base-100 p-4">
            <p className="mb-2 text-sm font-semibold">Technician Notes</p>
            {t.technician_notes ? (
              <pre className="whitespace-pre-wrap text-sm leading-relaxed">{t.technician_notes}</pre>
            ) : (
              <p className="text-sm opacity-60">No notes yet.</p>
            )}
          </div>

          {t.customer_resolution_summary ? (
            <div className="rounded-box border border-success/40 bg-success/5 p-4">
              <p className="mb-2 text-sm font-semibold">Resolution Summary</p>
              <p className="text-sm leading-relaxed">{t.customer_resolution_summary}</p>
              {t.customer_confirmed ? <p className="mt-2 text-xs text-success">Customer confirmed resolution.</p> : null}
            </div>
          ) : null}

          {isTechnician ? (
            <div>
              <p className="mb-2 text-sm font-semibold">Log Time and Materials</p>
              <p className="mb-3 text-xs opacity-60">
                Capture hours worked and materials or other direct costs used on this ticket.
              </p>
              <TimeCostForm
                technicianId={profile.id}
                internalCostRate={Number(profile.internal_cost_rate ?? 65)}
                customers={formCustomers}
                contracts={formContracts}
                tickets={formTickets}
                projects={formProjects}
                defaults={{
                  customerId: t.customer_id,
                  contractId: t.contract_id ?? undefined,
                  ticketId: t.id,
                }}
              />
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-semibold">
              Time Logged (<Hours value={totalHours} />)
            </p>
            {timeEntries.length === 0 ? (
              <EmptyState title="No time logged yet" description="Technician time against this ticket will show up here." />
            ) : (
              <DataTable headers={["Date", "Technician", "Hours", "Type", "Notes"]}>
                {timeEntries.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <DateText value={e.work_date} />
                    </td>
                    <td>{technicianName.get(e.technician_id) ?? "—"}</td>
                    <td>
                      <Hours value={Number(e.hours_worked)} />
                    </td>
                    <td>
                      <StatusBadge status={e.classification} />
                    </td>
                    <td className="max-w-xs truncate opacity-70">{e.description}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Additional Work Requests</p>
            {(additionalWorkRes.data ?? []).length === 0 ? (
              <EmptyState title="Nothing flagged" description="Out-of-scope work flagged from this ticket will appear here." />
            ) : (
              <DataTable headers={["Title", "Est. Hours", "Est. Amount", "Status"]}>
                {(additionalWorkRes.data ?? []).map((w) => (
                  <tr key={w.id}>
                    <td>{w.title}</td>
                    <td>{w.estimated_hours != null ? <Hours value={Number(w.estimated_hours)} /> : "—"}</td>
                    <td>{w.estimated_amount != null ? <Money value={Number(w.estimated_amount)} /> : "—"}</td>
                    <td>
                      <StatusBadge status={w.approval_status} />
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <TicketActions
            ticketId={t.id}
            customerId={t.customer_id}
            contractId={t.contract_id}
            status={t.status}
            assignedTechnicianId={t.assigned_technician_id}
            technicianNotes={t.technician_notes}
            customerResolutionSummary={t.customer_resolution_summary}
            customerConfirmed={t.customer_confirmed}
            hasTimeLogged={hasTimeLogged}
            currentUserId={profile.id}
            role={profile.role}
          />

          <div className="rounded-box border border-base-300 bg-base-100 p-4 text-sm">
            <p className="font-semibold">Details</p>
            <dl className="mt-2 space-y-2">
              <div className="flex justify-between">
                <dt className="opacity-60">Customer</dt>
                <dd>{customerRes.data?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="opacity-60">Contract</dt>
                <dd>
                  {contractRes.data ? (
                    <Link className="link link-hover" href={`/contracts/${contractRes.data.id}`}>
                      {contractRes.data.contract_number}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="opacity-60">Assigned To</dt>
                <dd>{technicianRes.data?.full_name ?? "Unassigned"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="opacity-60">Submitted</dt>
                <dd>{formatDateTime(t.submitted_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="opacity-60">Response SLA</dt>
                <dd>
                  <StatusBadge status={responseSla} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="opacity-60">Resolution SLA</dt>
                <dd>
                  <StatusBadge status={resolutionSla} />
                </dd>
              </div>
              {t.target_response_at ? (
                <div className="flex justify-between">
                  <dt className="opacity-60">Target Response</dt>
                  <dd>{formatDateTime(t.target_response_at)}</dd>
                </div>
              ) : null}
              {t.target_resolution_at ? (
                <div className="flex justify-between">
                  <dt className="opacity-60">Target Resolution</dt>
                  <dd>{formatDateTime(t.target_resolution_at)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
