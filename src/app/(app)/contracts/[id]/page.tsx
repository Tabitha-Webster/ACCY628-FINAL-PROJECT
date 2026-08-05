import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  DataTable,
  EmptyState,
  ErrorState,
  Hours,
  Money,
  PageHeader,
  Percent,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { formatDate, statusLabel } from "@/lib/format";
import { usagePercentage, usageStatus } from "@/lib/calculations";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide opacity-50">{label}</p>
      <p className="mt-0.5 text-sm">{value ?? "—"}</p>
    </div>
  );
}

function usageBadgeClass(status: "normal" | "warning" | "over_limit") {
  if (status === "over_limit") return "badge-error";
  if (status === "warning") return "badge-warning";
  return "badge-success";
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing", "technician"].includes(profile.role)) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();

  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("*, customers(id, name), assigned_manager:profiles!contracts_assigned_manager_id_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();

  if (!contractError && !contract) notFound();

  if (contractError || !contract) {
    return <ErrorState message={contractError?.message ?? "Contract not found."} />;
  }

  const customer = Array.isArray(contract.customers) ? contract.customers[0] : contract.customers;
  const manager = Array.isArray(contract.assigned_manager)
    ? contract.assigned_manager[0]
    : contract.assigned_manager;

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

  const [{ data: monthEntries }, { data: tickets }, { data: projects }] = await Promise.all([
    supabase
      .from("time_entries")
      .select("hours_worked")
      .eq("contract_id", id)
      .eq("classification", "included")
      .gte("work_date", monthStart)
      .lt("work_date", monthEnd),
    supabase
      .from("support_tickets")
      .select("id, ticket_number, title, status, priority, submitted_at")
      .eq("contract_id", id)
      .order("submitted_at", { ascending: false })
      .limit(5),
    supabase
      .from("projects")
      .select("id, name, status, fixed_fee, target_completion_date")
      .eq("contract_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const includedHours = Number(contract.included_hours_per_month ?? 0);
  const usedHours = (monthEntries ?? []).reduce((sum, e) => sum + Number(e.hours_worked ?? 0), 0);
  const pctUsed = usagePercentage(usedHours, includedHours);
  const usage = usageStatus(pctUsed);

  return (
    <div className="space-y-6">
      <PageHeader
        title={contract.name}
        description={`${contract.contract_number} · ${
          customer ? customer.name : "Unknown customer"
        }`}
        actions={<StatusBadge status={contract.status} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Hours Used This Month"
          value={`${usedHours.toFixed(1)} / ${includedHours.toFixed(1)} hrs`}
          hint={`${pctUsed.toFixed(0)}% of included hours`}
          tone={usage === "over_limit" ? "error" : usage === "warning" ? "warning" : "default"}
        />
        <StatCard label="Monthly Recurring Fee" value={`$${Number(contract.monthly_recurring_fee ?? 0).toFixed(2)}`} />
        <StatCard label="Additional Hourly Rate" value={`$${Number(contract.additional_hourly_rate ?? 0).toFixed(2)}/hr`} />
      </div>

      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Hour Usage This Month</h2>
          <span className={`badge ${usageBadgeClass(usage)}`}>{statusLabel(usage)}</span>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <progress
            className={`progress w-full ${usage === "over_limit" ? "progress-error" : usage === "warning" ? "progress-warning" : "progress-success"}`}
            value={Math.min(pctUsed, 100)}
            max={100}
          />
          <span className="whitespace-nowrap text-sm font-medium">
            <Percent value={pctUsed} />
          </span>
        </div>
      </div>

      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">Overview</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Customer" value={customer ? <Link href={`/customers/${customer.id}`} className="link link-hover">{customer.name}</Link> : "—"} />
          <Field label="Contract Type" value={statusLabel(contract.contract_type)} />
          <Field label="Assigned Manager" value={manager?.full_name} />
          <Field label="Start Date" value={formatDate(contract.start_date)} />
          <Field label="End Date" value={formatDate(contract.end_date)} />
          <Field label="Renewal Type" value={contract.renewal_type ? statusLabel(contract.renewal_type) : "—"} />
          <Field label="Cancellation Notice" value={contract.cancellation_notice_days ? `${contract.cancellation_notice_days} days` : "—"} />
          <Field label="Requires Customer Approval" value={contract.requires_customer_approval ? "Yes" : "No"} />
          <Field label="Requires Manager Approval" value={contract.requires_manager_approval ? "Yes" : "No"} />
        </div>
        {contract.description ? (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide opacity-50">Description</p>
            <p className="mt-1 text-sm leading-relaxed">{contract.description}</p>
          </div>
        ) : null}
        {contract.scope ? (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide opacity-50">Scope</p>
            <p className="mt-1 text-sm leading-relaxed">{contract.scope}</p>
          </div>
        ) : null}
      </div>

      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">Service Scope &amp; SLA</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Included Hours / Month" value={<Hours value={includedHours} />} />
          <Field label="SLA Response Time" value={contract.sla_response_hours ? `${contract.sla_response_hours} hrs` : "—"} />
          <Field label="SLA Resolution Time" value={contract.sla_resolution_hours ? `${contract.sla_resolution_hours} hrs` : "—"} />
          <Field label="Remote Support" value={contract.remote_support ? "Included" : "Not included"} />
          <Field label="Onsite Support" value={contract.onsite_support ? "Included" : "Not included"} />
          <Field label="Supported Locations" value={contract.supported_locations} />
          <Field label="Supported Users / Devices" value={contract.supported_users_devices} />
          <Field label="After-Hours Terms" value={contract.after_hours_terms} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide opacity-50">Included Services</p>
            <p className="mt-1 text-sm leading-relaxed">{contract.included_services ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide opacity-50">Excluded Services</p>
            <p className="mt-1 text-sm leading-relaxed">{contract.excluded_services ?? "—"}</p>
          </div>
        </div>
      </div>

      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">Billing &amp; Payment Terms</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Billing Frequency" value={contract.billing_frequency ? statusLabel(contract.billing_frequency) : "—"} />
          <Field label="Billing Timing" value={contract.billing_timing ? statusLabel(contract.billing_timing) : "—"} />
          <Field label="Payment Terms" value={contract.payment_terms} />
          <Field label="Deposit Amount" value={<Money value={Number(contract.deposit_amount ?? 0)} />} />
          <Field label="Tax Status" value={contract.tax_status ? statusLabel(contract.tax_status) : "—"} />
          <Field label="Billing Contact" value={contract.billing_contact} />
          <Field label="Software Markup" value={<Percent value={Number(contract.software_markup_pct ?? 0) * 100} />} />
          <Field label="Equipment Markup" value={<Percent value={Number(contract.equipment_markup_pct ?? 0) * 100} />} />
          <Field label="Late Fee Terms" value={contract.late_fee_terms} />
        </div>
        {contract.reimbursable_cost_policy ? (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide opacity-50">Reimbursable Cost Policy</p>
            <p className="mt-1 text-sm leading-relaxed">{contract.reimbursable_cost_policy}</p>
          </div>
        ) : null}
        {contract.change_request_procedure ? (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide opacity-50">Change Request Procedure</p>
            <p className="mt-1 text-sm leading-relaxed">{contract.change_request_procedure}</p>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-semibold">Related Tickets</h2>
          {tickets && tickets.length > 0 ? (
            <DataTable headers={["Ticket", "Priority", "Status", "Submitted"]}>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <div className="font-medium">{ticket.title}</div>
                    <div className="text-xs opacity-60">{ticket.ticket_number}</div>
                  </td>
                  <td className="text-xs capitalize">{ticket.priority}</td>
                  <td>
                    <StatusBadge status={ticket.status} />
                  </td>
                  <td className="text-xs">{formatDate(ticket.submitted_at)}</td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <EmptyState title="No tickets linked to this contract" />
          )}
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">Related Projects</h2>
          {projects && projects.length > 0 ? (
            <DataTable headers={["Project", "Status", "Fixed Fee", "Target Completion"]}>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td className="font-medium">{project.name}</td>
                  <td>
                    <StatusBadge status={project.status} />
                  </td>
                  <td>
                    <Money value={Number(project.fixed_fee ?? 0)} />
                  </td>
                  <td className="text-xs">{formatDate(project.target_completion_date)}</td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <EmptyState title="No projects linked to this contract" />
          )}
        </div>
      </div>
    </div>
  );
}
