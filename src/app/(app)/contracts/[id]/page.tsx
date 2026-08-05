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
import { formatDate, formatDateTime, statusLabel } from "@/lib/format";
import { usagePercentage, usageStatus } from "@/lib/calculations";
import type { ContractStatus } from "@/lib/types";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  CONTRACT_BILLING_STATUS_LABELS,
  canViewContractsModule,
  getContractById,
  getContractRelatedWork,
  getContractRenewalDate,
  getContractWarnings,
  isOperationalStatus,
  listContractChanges,
  listContractDocuments,
  listContractModifications,
  listContractRenewalReminders,
  listContractRenewals,
  listContractServices,
  listContractVersions,
  recurringAmountForPeriod,
  syncContractReminders,
  getContractPermissions,
  unwrapAssignedManager,
  unwrapCustomer,
  unwrapProfile,
  type ContractCustomerJoin,
  type ContractDetailRow,
} from "@/lib/contracts";
import { ContractDocumentsPanel } from "@/components/ContractDocumentsPanel";
import { ContractChangesPanel } from "@/components/ContractChangesPanel";
import { ContractRenewalsPanel } from "@/components/ContractRenewalsPanel";
import { ContractLifecycleActions } from "@/components/ContractLifecycleActions";
import { EditContractButton } from "@/components/EditContractButton";
import { ContractModificationsPanel } from "@/components/ContractModificationsPanel";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide opacity-50">{label}</p>
      <p className="mt-0.5 text-sm whitespace-pre-wrap">{value ?? "—"}</p>
    </div>
  );
}

function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">{title}</h2>
        {actions}
      </div>
      {children}
    </div>
  );
}

function yesNo(value: boolean | null | undefined) {
  if (value == null) return "—";
  return value ? "Yes" : "No";
}

function hoursOrDash(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value)} hrs`;
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
  const customer = unwrapCustomer(contract) as ContractCustomerJoin | null;
  const manager = unwrapAssignedManager(contract);
  const salesRep = unwrapProfile(contract.sales_representative);
  const createdBy = unwrapProfile(contract.created_by_profile);
  const updatedBy = unwrapProfile(contract.updated_by_profile);
  const status = contract.status as ContractStatus;
  const statusLabelText = CONTRACT_STATUS_LABELS[status] ?? statusLabel(status);
  const permissions = getContractPermissions(profile.role);
  const managerCanEdit = permissions.edit;
  const allWarnings = getContractWarnings(contract);
  const warnings = allWarnings.filter((w) => {
    if (["missing_payment_terms", "missing_billing_frequency"].includes(w.code)) return true;
    if (w.code === "renewal_soon") {
      return !allWarnings.some((x) =>
        ["renewal_90", "renewal_60", "renewal_30"].includes(x.code)
      );
    }
    if (w.code === "ends_soon") {
      return !allWarnings.some((x) => x.code === "expiration_warning");
    }
    return [
      "past_end_date",
      "expiration_warning",
      "renewal_90",
      "renewal_60",
      "renewal_30",
      "ends_soon",
      "renewal_soon",
    ].includes(w.code);
  });
  const renewalDate = getContractRenewalDate(contract);
  const autoRenew = (contract.renewal_type ?? "").toLowerCase() === "auto";

  const [related, servicesResult, modificationsResult, documentsResult, versionsResult, changesResult] =
    await Promise.all([
      getContractRelatedWork(supabase, id),
      listContractServices(supabase, [id]),
      listContractModifications(supabase, id),
      listContractDocuments(supabase, id),
      listContractVersions(supabase, id),
      listContractChanges(supabase, id),
    ]);

  await syncContractReminders(supabase, {
    id: contract.id,
    status: contract.status,
    start_date: contract.start_date,
    end_date: contract.end_date,
    renewal_type: contract.renewal_type,
  });

  const [remindersResult, renewalsResult] = await Promise.all([
    listContractRenewalReminders(supabase, id),
    listContractRenewals(supabase, id),
  ]);

  const services = servicesResult.data ?? [];
  const modifications = modificationsResult.data ?? [];
  const documents = documentsResult.data ?? [];
  const versions = versionsResult.data ?? [];
  const changes = changesResult.data ?? [];
  const reminders = remindersResult.data ?? [];
  const renewals = renewalsResult.data ?? [];
  const { tickets, projects, invoices, monthEntries } = related;

  const includedHours = Number(contract.included_hours_per_month ?? 0);
  const usedHours = monthEntries.reduce((sum, e) => sum + Number(e.hours_worked ?? 0), 0);
  const pctUsed = usagePercentage(usedHours, includedHours);
  const usage = usageStatus(pctUsed);
  const typeLabel =
    CONTRACT_TYPE_LABELS[contract.contract_type as keyof typeof CONTRACT_TYPE_LABELS] ??
    statusLabel(String(contract.contract_type));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/contracts/reports" className="btn btn-ghost btn-sm">
          ← Back to reports
        </Link>
        {permissions.report ? (
          <Link href="/contracts/reports" className="btn btn-ghost btn-sm">
            Reports
          </Link>
        ) : null}
        <Link href="/contracts/renewals" className="btn btn-outline btn-sm">
          Renewal & Expiration
        </Link>
        {permissions.edit ? (
          <EditContractButton href={`/contracts/${id}/edit`} isActive={status === "active"} />
        ) : null}
      </div>

      <PageHeader
        title={contract.name}
        description={`${contract.contract_number} · ${customer ? customer.name : "Unknown customer"} · Version ${contract.version_number ?? 1}`}
        actions={<StatusBadge status={contract.status} label={statusLabelText} />}
      />

      {warnings.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {warnings.map((warning) => (
            <span
              key={warning.code}
              className={`badge ${
                warning.code === "past_end_date"
                  ? "badge-error"
                  : warning.code === "renewal_90"
                    ? "badge-ghost"
                    : warning.code === "renewal_60" || warning.code === "renewal_soon"
                      ? "badge-info"
                      : "badge-warning"
              }`}
            >
              {warning.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Contract Number" value={contract.contract_number} hint="Auto-generated" />
        <StatCard
          label="Monthly Recurring Fee"
          value={`$${Number(contract.monthly_recurring_fee ?? 0).toFixed(2)}`}
        />
        <StatCard
          label="Included Hours / Month"
          value={`${includedHours.toFixed(1)} hrs`}
          hint={`${pctUsed.toFixed(0)}% used this month`}
          tone={usage === "over_limit" ? "error" : usage === "warning" ? "warning" : "default"}
        />
        <StatCard
          label="Overage Hourly Rate"
          value={`$${Number(contract.additional_hourly_rate ?? 0).toFixed(2)}/hr`}
        />
      </div>

      <Section
        title="Contract Lifecycle"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} label={statusLabelText} />
            {isOperationalStatus(status) ? (
              <span className="badge badge-success badge-outline">Operational</span>
            ) : (
              <span className="badge badge-ghost">Not operational</span>
            )}
          </div>
        }
      >
        <p className="text-sm opacity-70">
          Status values: Draft, Pending Approval, Active, Suspended, Expired, Renewed, Cancelled.
          Actions respect your role permissions (approve, renew, cancel, edit, delete).
        </p>
        <ContractLifecycleActions
          contractId={id}
          status={status}
          role={profile.role}
          profileId={profile.id}
        />
      </Section>

      <Section title="Overview">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Contract Number" value={contract.contract_number} />
          <Field label="Contract Name" value={contract.name} />
          <Field label="Status" value={<StatusBadge status={status} label={statusLabelText} />} />
          <Field label="Contract Type" value={typeLabel} />
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
          <Field
            label="Customer Contact"
            value={
              customer?.primary_contact || customer?.contact_email
                ? `${customer.primary_contact ?? "—"}${customer.contact_email ? ` · ${customer.contact_email}` : ""}`
                : "—"
            }
          />
          <Field label="Account Manager" value={manager?.full_name} />
          <Field label="Sales Representative" value={salesRep?.full_name} />
          <Field label="Billing Contact" value={contract.billing_contact} />
          <Field label="Requires Customer Approval" value={yesNo(contract.requires_customer_approval)} />
          <Field label="Requires Manager Approval" value={yesNo(contract.requires_manager_approval)} />
          <Field label="Current Version" value={String(contract.version_number ?? 1)} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field label="Description / Notes" value={contract.description} />
          <Field label="Scope" value={contract.scope} />
        </div>
      </Section>

      <Section title="Dates, Renewal & Cancellation">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Start Date" value={formatDate(contract.start_date)} />
          <Field label="End Date" value={formatDate(contract.end_date)} />
          <Field label="Effective Date" value={formatDate(contract.effective_date)} />
          <Field label="Signed Date" value={formatDate(contract.signed_date)} />
          <Field label="Renewal Date" value={formatDate(renewalDate)} />
          <Field label="Auto-Renew" value={autoRenew ? "Enabled" : "Disabled"} />
          <Field
            label="Renewal Type"
            value={contract.renewal_type ? statusLabel(String(contract.renewal_type)) : "—"}
          />
          <Field
            label="Notice Period"
            value={
              contract.cancellation_notice_days != null
                ? `${contract.cancellation_notice_days} days`
                : "—"
            }
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field label="Renewal Terms" value={contract.renewal_terms} />
          <Field label="Cancellation Terms" value={contract.cancellation_terms} />
        </div>
      </Section>

      <Section title="Billing Integration (Contract-to-Cash)">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Monthly Recurring Revenue (MRR)"
            value={<Money value={Number(contract.monthly_recurring_fee ?? 0)} />}
          />
          <Field
            label="Billing Frequency"
            value={contract.billing_frequency ? statusLabel(String(contract.billing_frequency)) : "—"}
          />
          <Field
            label="Billing Method"
            value={contract.billing_method ? statusLabel(String(contract.billing_method)) : "—"}
          />
          <Field label="Invoice Terms" value={contract.payment_terms} />
          <Field
            label="Billing Timing"
            value={contract.billing_timing ? statusLabel(String(contract.billing_timing)) : "—"}
          />
          <Field
            label="Billing Status"
            value={
              contract.billing_status
                ? (CONTRACT_BILLING_STATUS_LABELS[
                    contract.billing_status as keyof typeof CONTRACT_BILLING_STATUS_LABELS
                  ] ?? statusLabel(String(contract.billing_status)))
                : "—"
            }
          />
          <Field label="Next Invoice Date" value={formatDate(contract.next_invoice_date)} />
          <Field label="Last Invoice Date" value={formatDate(contract.last_invoice_date)} />
          <Field
            label="Period Recurring Amount"
            value={
              <Money
                value={recurringAmountForPeriod(
                  Number(contract.monthly_recurring_fee ?? 0),
                  contract.billing_frequency
                )}
              />
            }
          />
          <Field label="Included Support Hours" value={<Hours value={includedHours} />} />
          <Field
            label="Overage Hourly Rate"
            value={
              contract.overages_allowed === false ? (
                "Overages not allowed"
              ) : (
                <Money value={Number(contract.additional_hourly_rate ?? 0)} />
              )
            }
          />
          <Field
            label="Overage Charges (accrued)"
            value={<Money value={Number(contract.overage_charges ?? 0)} />}
          />
          <Field
            label="One-Time Setup Fee"
            value={<Money value={Number(contract.one_time_setup_fee ?? contract.deposit_amount ?? 0)} />}
          />
          <Field
            label="Deposit Amount"
            value={<Money value={Number(contract.deposit_amount ?? 0)} />}
          />
          <Field label="Tax Status" value={contract.tax_status ? statusLabel(contract.tax_status) : "—"} />
          <Field label="Late Fee Terms" value={contract.late_fee_terms} />
          <Field
            label="Software Markup"
            value={<Percent value={Number(contract.software_markup_pct ?? 0) * 100} />}
          />
          <Field
            label="Equipment Markup"
            value={<Percent value={Number(contract.equipment_markup_pct ?? 0) * 100} />}
          />
        </div>
        {contract.reimbursable_cost_policy ? (
          <div className="mt-4">
            <Field label="Reimbursable Cost Policy" value={contract.reimbursable_cost_policy} />
          </div>
        ) : null}
      </Section>

      <Section title="Service Coverage & Rates">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Included Support Hours" value={<Hours value={includedHours} />} />
          <Field
            label="Overage Hourly Rate"
            value={<Money value={Number(contract.additional_hourly_rate ?? 0)} />}
          />
          <Field
            label="Overages Allowed"
            value={contract.overages_allowed === false ? "No" : "Yes"}
          />
          <Field label="Remote Support" value={contract.remote_support ? "Included" : "Not included"} />
          <Field label="Onsite Support" value={contract.onsite_support ? "Included" : "Not included"} />
          <Field label="Covered Sites / Locations" value={contract.supported_locations} />
          <Field label="Covered Devices / Users" value={contract.supported_users_devices} />
          <Field label="After-Hours Terms" value={contract.after_hours_terms} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field label="Covered Services" value={contract.included_services} />
          <Field label="Excluded Services" value={contract.excluded_services} />
        </div>
        {contract.change_request_procedure ? (
          <div className="mt-4">
            <Field label="Change Request Procedure" value={contract.change_request_procedure} />
          </div>
        ) : null}
      </Section>

      <Section title="SLA Response Times">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Critical" value={hoursOrDash(contract.sla_critical_response_hours)} />
          <Field label="High" value={hoursOrDash(contract.sla_high_response_hours ?? contract.sla_response_hours)} />
          <Field label="Medium" value={hoursOrDash(contract.sla_medium_response_hours)} />
          <Field label="Low" value={hoursOrDash(contract.sla_low_response_hours)} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Default Response SLA" value={hoursOrDash(contract.sla_response_hours)} />
          <Field label="Resolution SLA" value={hoursOrDash(contract.sla_resolution_hours)} />
        </div>
      </Section>

      <Section title="Hour Usage This Month">
        <div className="flex items-center justify-between gap-3">
          <span className={`badge ${usageBadgeClass(usage)}`}>{statusLabel(usage)}</span>
          <span className="text-sm">
            {usedHours.toFixed(1)} / {includedHours.toFixed(1)} hrs (<Percent value={pctUsed} />)
          </span>
        </div>
        <progress
          className={`progress mt-3 w-full ${
            usage === "over_limit"
              ? "progress-error"
              : usage === "warning"
                ? "progress-warning"
                : "progress-success"
          }`}
          value={Math.min(pctUsed, 100)}
          max={100}
        />
      </Section>

      <Section title="Covered Service Line Items">
        {services.length > 0 ? (
          <DataTable headers={["Service", "Included", "Description"]}>
            {services.map((service) => (
              <tr key={service.id}>
                <td className="font-medium">{service.service_name}</td>
                <td>
                  <span
                    className={`badge badge-sm ${service.is_included ? "badge-success" : "badge-ghost"}`}
                  >
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
            description="Add covered services under this agreement to show them here."
          />
        )}
      </Section>

      <div id="renewal-expiration">
        <Section title="Renewal & Expiration">
          <ContractRenewalsPanel
            contract={{
              id: contract.id,
              status: contract.status,
              start_date: contract.start_date,
              end_date: contract.end_date,
              renewal_type: contract.renewal_type,
              version_number: contract.version_number,
            }}
            profileId={profile.id}
            canManage={permissions.renew || permissions.edit}
            reminders={reminders as Parameters<typeof ContractRenewalsPanel>[0]["reminders"]}
            renewals={renewals as Parameters<typeof ContractRenewalsPanel>[0]["renewals"]}
          />
        </Section>
      </div>

      <Section title="Contract Documents">
        <ContractDocumentsPanel
          contractId={id}
          profileId={profile.id}
          canManage={managerCanEdit}
          documents={documents as Parameters<typeof ContractDocumentsPanel>[0]["documents"]}
        />
      </Section>

      <Section title="Contract Changes">
        <ContractChangesPanel
          changes={changes as Parameters<typeof ContractChangesPanel>[0]["changes"]}
        />
      </Section>

      <Section title="Version History">
        {versions.length > 0 ? (
          <DataTable headers={["Version", "Summary", "Created", "By"]}>
            {versions.map((version) => {
              const author = unwrapProfile(
                (version as { created_by_profile?: { full_name: string } | { full_name: string }[] | null })
                  .created_by_profile
              );
              return (
                <tr key={version.id}>
                  <td className="font-medium">v{version.version_number}</td>
                  <td className="text-sm">{version.change_summary}</td>
                  <td className="text-xs">{formatDateTime(version.created_at)}</td>
                  <td className="text-xs">{author?.full_name ?? "—"}</td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title="No version history recorded" />
        )}
      </Section>

      <Section title="Price Change Approvals">
        <ContractModificationsPanel
          contractId={id}
          profileId={profile.id}
          currentVersion={Number(contract.version_number ?? 1)}
          canApprove={permissions.approve}
          modifications={
            modifications as Parameters<typeof ContractModificationsPanel>[0]["modifications"]
          }
        />
      </Section>

      <Section title="Audit Log">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Created By" value={createdBy?.full_name ?? "—"} />
          <Field label="Created At" value={formatDateTime(contract.created_at)} />
          <Field label="Modified By" value={updatedBy?.full_name ?? "—"} />
          <Field label="Modified At" value={formatDateTime(contract.updated_at)} />
        </div>
      </Section>

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
