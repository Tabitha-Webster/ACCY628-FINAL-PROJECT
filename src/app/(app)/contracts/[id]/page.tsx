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
import type { ContractStatus } from "@/lib/types";
import {
  canManageContracts,
  canViewContractsModule,
  getContractById,
  getContractRelatedWork,
  getContractWarnings,
  getLifecycleActions,
  isOperationalStatus,
  listContractModifications,
  listContractServices,
  unwrapAssignedManager,
  unwrapCustomer,
  type ContractDetailRow,
} from "@/lib/contracts";

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
  if (!canViewContractsModule(profile.role)) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();

  const { data: contractData, error: contractError } = await getContractById(supabase, id);

  if (!contractError && !contractData) notFound();

  if (contractError || !contractData) {
    return <ErrorState message={contractError?.message ?? "Contract not found."} />;
  }

  const contract = contractData as ContractDetailRow;
  const customer = unwrapCustomer(contract);
  const manager = unwrapAssignedManager(contract);
  const status = contract.status as ContractStatus;
  const lifecycleActions = getLifecycleActions(status);
  const warnings = getContractWarnings(contract);
  const managerCanEdit = canManageContracts(profile.role);

  const [related, servicesResult, modificationsResult] = await Promise.all([
    getContractRelatedWork(supabase, id),
    listContractServices(supabase, [id]),
    listContractModifications(supabase, id),
  ]);

  const services = servicesResult.data ?? [];
  const modifications = modificationsResult.data ?? [];
  const { tickets, projects, invoices, monthEntries } = related;

  const includedHours = Number(contract.included_hours_per_month ?? 0);
  const usedHours = monthEntries.reduce((sum, e) => sum + Number(e.hours_worked ?? 0), 0);
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

      {warnings.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {warnings.map((warning) => (
            <span key={warning.code} className="badge badge-warning">
              {warning.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Contract Lifecycle
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {isOperationalStatus(status) ? (
              <span className="badge badge-success badge-outline">Operational</span>
            ) : (
              <span className="badge badge-ghost">Not operational</span>
            )}
          </div>
        </div>
        <p className="text-sm opacity-70">
          Lifecycle supports draft → approval → active service → hold / expiry / cancel / renewal.
          Billing, technicians, and reporting should only treat <strong>active</strong> agreements as
          operational unless a future rule says otherwise.
        </p>
        {lifecycleActions.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lifecycleActions.map((action) => (
              <div
                key={action.to}
                className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-3"
              >
                <p className="text-sm font-medium">{action.label}</p>
                <p className="mt-1 text-xs opacity-60">{action.description}</p>
                <p className="mt-2 text-xs opacity-50">
                  {managerCanEdit
                    ? "Action UI coming next — transition rules are ready."
                    : "Managers control status changes."}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm opacity-60">No further lifecycle transitions from this status.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Hours Used This Month"
          value={`${usedHours.toFixed(1)} / ${includedHours.toFixed(1)} hrs`}
          hint={`${pctUsed.toFixed(0)}% of included hours`}
          tone={usage === "over_limit" ? "error" : usage === "warning" ? "warning" : "default"}
        />
        <StatCard
          label="Monthly Recurring Fee"
          value={`$${Number(contract.monthly_recurring_fee ?? 0).toFixed(2)}`}
        />
        <StatCard
          label="Additional Hourly Rate"
          value={`$${Number(contract.additional_hourly_rate ?? 0).toFixed(2)}/hr`}
        />
      </div>

      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Hour Usage This Month
          </h2>
          <span className={`badge ${usageBadgeClass(usage)}`}>{statusLabel(usage)}</span>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <progress
            className={`progress w-full ${
              usage === "over_limit"
                ? "progress-error"
                : usage === "warning"
                  ? "progress-warning"
                  : "progress-success"
            }`}
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
          <Field
            label="Customer"
            value={
              customer ? (
                <Link href={`/customers/${customer.id}`} className="link link-hover">
                  {customer.name}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <Field label="Contract Type" value={statusLabel(contract.contract_type)} />
          <Field label="Assigned Manager" value={manager?.full_name} />
          <Field label="Start Date" value={formatDate(contract.start_date)} />
          <Field label="End Date" value={formatDate(contract.end_date)} />
          <Field
            label="Renewal Type"
            value={contract.renewal_type ? statusLabel(contract.renewal_type) : "—"}
          />
          <Field
            label="Cancellation Notice"
            value={
              contract.cancellation_notice_days
                ? `${contract.cancellation_notice_days} days`
                : "—"
            }
          />
          <Field
            label="Requires Customer Approval"
            value={contract.requires_customer_approval ? "Yes" : "No"}
          />
          <Field
            label="Requires Manager Approval"
            value={contract.requires_manager_approval ? "Yes" : "No"}
          />
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
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
          Service Scope &amp; SLA
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Included Hours / Month" value={<Hours value={includedHours} />} />
          <Field
            label="SLA Response Time"
            value={contract.sla_response_hours ? `${contract.sla_response_hours} hrs` : "—"}
          />
          <Field
            label="SLA Resolution Time"
            value={contract.sla_resolution_hours ? `${contract.sla_resolution_hours} hrs` : "—"}
          />
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
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
          Contract Services
        </h2>
        {services.length > 0 ? (
          <DataTable headers={["Service", "Included", "Description"]}>
            {services.map((service) => (
              <tr key={service.id}>
                <td className="font-medium">{service.service_name}</td>
                <td>
                  <span className={`badge badge-sm ${service.is_included ? "badge-success" : "badge-ghost"}`}>
                    {service.is_included ? "Included" : "Excluded"}
                  </span>
                </td>
                <td className="text-sm opacity-70">{service.service_description ?? "—"}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No service line items yet"
            description="contract_services rows will appear here for technicians and customer portals."
          />
        )}
      </div>

      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
          Billing &amp; Payment Terms
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="Billing Frequency"
            value={contract.billing_frequency ? statusLabel(contract.billing_frequency) : "—"}
          />
          <Field
            label="Billing Timing"
            value={contract.billing_timing ? statusLabel(contract.billing_timing) : "—"}
          />
          <Field label="Payment Terms" value={contract.payment_terms} />
          <Field label="Deposit Amount" value={<Money value={Number(contract.deposit_amount ?? 0)} />} />
          <Field label="Tax Status" value={contract.tax_status ? statusLabel(contract.tax_status) : "—"} />
          <Field label="Billing Contact" value={contract.billing_contact} />
          <Field
            label="Software Markup"
            value={<Percent value={Number(contract.software_markup_pct ?? 0) * 100} />}
          />
          <Field
            label="Equipment Markup"
            value={<Percent value={Number(contract.equipment_markup_pct ?? 0) * 100} />}
          />
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

      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
          Modifications &amp; Amendments
        </h2>
        {modifications.length > 0 ? (
          <DataTable headers={["Summary", "Effective", "Approval"]}>
            {modifications.map((mod) => (
              <tr key={mod.id}>
                <td className="text-sm">{mod.modification_summary}</td>
                <td className="text-xs">{formatDate(mod.effective_date)}</td>
                <td>
                  <StatusBadge status={mod.approval_status} />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No modifications recorded"
            description="Future amendment workflow will write to contract_modifications."
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div>
          <h2 className="mb-2 text-lg font-semibold">Related Tickets</h2>
          {tickets.length > 0 ? (
            <DataTable headers={["Ticket", "Priority", "Status", "Submitted"]}>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <Link href={`/tickets/${ticket.id}`} className="link link-hover font-medium">
                      {ticket.title}
                    </Link>
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
          {projects.length > 0 ? (
            <DataTable headers={["Project", "Status", "Fixed Fee", "Target"]}>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link href={`/projects/${project.id}`} className="link link-hover font-medium">
                      {project.name}
                    </Link>
                  </td>
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

        <div>
          <h2 className="mb-2 text-lg font-semibold">Related Invoices</h2>
          {invoices.length > 0 ? (
            <DataTable headers={["Invoice", "Status", "Total", "Balance"]}>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link href={`/invoices/${invoice.id}`} className="link link-hover font-medium">
                      {invoice.invoice_number}
                    </Link>
                    <div className="text-xs opacity-60">{formatDate(invoice.invoice_date)}</div>
                  </td>
                  <td>
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td>
                    <Money value={Number(invoice.total_amount ?? 0)} />
                  </td>
                  <td>
                    <Money value={Number(invoice.remaining_balance ?? 0)} />
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <EmptyState title="No invoices linked to this contract" />
          )}
        </div>
      </div>
    </div>
  );
}
