import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  PageHeader,
  DataTable,
  EmptyState,
  StatusBadge,
  ErrorState,
  Money,
  Hours,
  DateText,
  StatCard,
} from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { hoursRemaining, usagePercentage } from "@/lib/calculations";
import { evaluateTicketSla } from "@/lib/sla";
import { completedTicketQualityIssues } from "@/lib/technicianWork";
import { SlaConditionBadge, TicketSlaAlerts } from "@/components/SlaBadges";
import { ServiceModeBadge, serviceModeLabel } from "@/components/ServiceModeBadge";
import { TicketActions } from "@/components/TicketActions";
import type { SupportTicket } from "@/lib/types";
import type { UserRole } from "@/lib/constants";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide opacity-50">{label}</p>
      <div className="mt-0.5 text-sm">{value ?? "—"}</div>
    </div>
  );
}

function Section({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "default" | "warning" | "error" | "success";
}) {
  const border =
    tone === "error"
      ? "border-error/40"
      : tone === "warning"
        ? "border-warning/40"
        : tone === "success"
          ? "border-success/40"
          : "border-base-300";
  const bg =
    tone === "error"
      ? "bg-error/5"
      : tone === "warning"
        ? "bg-warning/5"
        : tone === "success"
          ? "bg-success/5"
          : "bg-base-100";
  return (
    <section className={`rounded-box border ${border} ${bg} p-4`}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-70">{title}</h2>
      {children}
    </section>
  );
}

function boolTerm(value: boolean | null | undefined, yesLabel: string, noLabel: string) {
  if (value == null) return "—";
  return value ? yesLabel : noLabel;
}

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const role: UserRole = profile.role;
  const isCustomer = role === "customer";
  const isInternal = role === "manager" || role === "technician" || role === "billing";
  const canSeeInternalNotes = role === "manager" || role === "technician" || role === "billing";
  const canSeeInternalCosts = role === "manager" || role === "technician" || role === "billing";
  const showCustomerCosts = false; // customers never see internal cost rates / profitability

  const supabase = await createClient();
  const { data: ticket, error } = await supabase.from("support_tickets").select("*").eq("id", id).maybeSingle();

  if (error) {
    return (
      <div>
        <PageHeader title="Ticket" />
        <ErrorState message={`We couldn't load this ticket right now. ${error.message}`} />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div>
        <PageHeader title="Ticket unavailable" />
        <EmptyState
          title="Ticket not found or not authorized"
          description="This ticket may not exist, or your role does not have access to it. Customers can only open tickets for their own organization."
        />
        <div className="mt-4">
          <Link
            href={isCustomer ? "/support-requests" : "/tickets"}
            className="btn btn-outline btn-sm"
          >
            Back to ticket list
          </Link>
        </div>
      </div>
    );
  }

  const t = ticket as SupportTicket & {
    completion_notes?: string | null;
    no_time_explanation?: string | null;
    reopened_at?: string | null;
    reopen_reason?: string | null;
    billable_approval_status?: string | null;
  };

  // Defense in depth: never show another customer's ticket to a customer user
  if (isCustomer && profile.customer_id && t.customer_id !== profile.customer_id) {
    return (
      <div>
        <PageHeader title="Unauthorized" />
        <ErrorState message="You can only view support tickets for your own organization." />
        <div className="mt-4">
          <Link href="/support-requests" className="btn btn-outline btn-sm">
            Back to Support Requests
          </Link>
        </div>
      </div>
    );
  }

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

  const [customerRes, contractRes, technicianRes, timeEntriesRes, directCostsRes, additionalWorkRes, techniciansRes] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, name, primary_contact, contact_email")
        .eq("id", t.customer_id)
        .maybeSingle(),
      t.contract_id
        ? supabase
            .from("contracts")
            .select(
              "id, name, contract_number, status, included_hours_per_month, additional_hourly_rate, sla_response_hours, sla_resolution_hours, included_services, excluded_services, remote_support, onsite_support, after_hours_terms"
            )
            .eq("id", t.contract_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      t.assigned_technician_id
        ? supabase.from("profiles").select("id, full_name, email").eq("id", t.assigned_technician_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("time_entries")
        .select(
          "id, technician_id, work_date, hours_worked, classification, description, labor_cost, billing_rate, internal_cost_rate"
        )
        .eq("support_ticket_id", t.id)
        .order("work_date", { ascending: false }),
      supabase
        .from("direct_costs")
        .select(
          "id, cost_category, vendor, cost_date, internal_cost, billable_amount, description, approval_status, billing_status"
        )
        .eq("support_ticket_id", t.id)
        .order("cost_date", { ascending: false }),
      supabase
        .from("additional_work_requests")
        .select("id, title, description, estimated_hours, estimated_amount, approval_status, reviewed_at, created_at")
        .eq("support_ticket_id", t.id)
        .order("created_at", { ascending: false }),
      role === "manager"
        ? supabase
            .from("profiles")
            .select("id, full_name")
            .eq("role", "technician")
            .eq("is_active", true)
            .order("full_name")
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    ]);

  const contract = contractRes.data;
  const monthHoursRes =
    contract != null
      ? await supabase
          .from("time_entries")
          .select("hours_worked")
          .eq("contract_id", contract.id)
          .eq("classification", "included")
          .gte("work_date", monthStart)
          .lt("work_date", monthEnd)
      : { data: [] as { hours_worked: number }[] };

  const timeEntries = timeEntriesRes.data ?? [];
  const directCosts = directCostsRes.data ?? [];
  const technicianIds = Array.from(new Set(timeEntries.map((e) => e.technician_id)));
  const timeTechRes = technicianIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", technicianIds)
    : { data: [] as { id: string; full_name: string }[] };
  const technicianName = new Map((timeTechRes.data ?? []).map((p) => [p.id, p.full_name]));

  const totalTicketHours = timeEntries.reduce((sum, e) => sum + Number(e.hours_worked), 0);
  const hasTimeEntryDescriptions = timeEntries.some((e) => Boolean(e.description?.trim()));
  const sla = evaluateTicketSla(t);
  const isOverdue = sla.overdue;
  const qualityIssues = completedTicketQualityIssues({
    status: t.status,
    technicianNotes: t.technician_notes,
    completionNotes: t.completion_notes,
    recordedHours: totalTicketHours,
    noTimeExplanation: t.no_time_explanation,
    hasTimeEntryDescriptions,
  });

  const includedHours = Number(contract?.included_hours_per_month ?? 0);
  const usedHours = (monthHoursRes.data ?? []).reduce((sum, e) => sum + Number(e.hours_worked ?? 0), 0);
  const remainingHours = hoursRemaining(includedHours, usedHours);
  const usagePct = usagePercentage(usedHours, includedHours);

  const backHref = isCustomer ? "/support-requests" : "/tickets";
  const backLabel = isCustomer ? "Back to Support Requests" : "Back to Tickets";

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${t.ticket_number} · ${t.title}`}
        description={customerRes.data?.name ?? undefined}
        actions={
          <Link href={backHref} className="btn btn-sm btn-outline">
            {backLabel}
          </Link>
        }
      />

      <TicketSlaAlerts ticket={t} />

      {qualityIssues.length > 0 ? (
        <div className="alert alert-error text-sm" role="alert">
          <div>
            <p className="font-semibold">Completed ticket quality warning</p>
            <ul className="mt-1 list-disc pl-4">
              {qualityIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <TicketActions
          ticketId={t.id}
          customerId={t.customer_id}
          contractId={t.contract_id}
          status={t.status}
          priority={t.priority}
          assignedTechnicianId={t.assigned_technician_id}
          actualResponseAt={t.actual_response_at}
          technicianNotes={t.technician_notes}
          completionNotes={t.completion_notes ?? null}
          customerResolutionSummary={t.customer_resolution_summary}
          customerConfirmed={t.customer_confirmed}
          classification={t.classification}
          billableApprovalStatus={t.billable_approval_status ?? null}
          noTimeExplanation={t.no_time_explanation ?? null}
          reopenedAt={t.reopened_at ?? null}
          reopenReason={t.reopen_reason ?? null}
          scheduledStartAt={(t as SupportTicket).scheduled_start_at ?? null}
          scheduledEndAt={(t as SupportTicket).scheduled_end_at ?? null}
          serviceMode={(t as SupportTicket).service_mode ?? null}
          serviceLocation={(t as SupportTicket).service_location ?? null}
          scheduleNotes={(t as SupportTicket).schedule_notes ?? null}
          currentUserId={profile.id}
          role={role}
          internalCostRate={Number(profile.internal_cost_rate ?? 65)}
          contractHourlyRate={
            contract?.additional_hourly_rate != null ? Number(contract.additional_hourly_rate) : null
          }
          recordedHours={totalTicketHours}
          hasTimeEntryDescriptions={hasTimeEntryDescriptions}
          technicians={techniciansRes.data ?? []}
        />

        <Section title="Ticket information">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={t.status} />
              {t.priority === "critical" ? (
                <span className="inline-flex items-center gap-1 rounded-box border border-error/40 bg-error/10 px-2 py-0.5 text-xs font-semibold text-error">
                  ⚠ Critical
                </span>
              ) : (
                <StatusBadge status={t.priority} />
              )}
              {t.service_category ? <span className="badge badge-ghost">{t.service_category}</span> : null}
              <ServiceModeBadge
                mode={(t as SupportTicket).service_mode}
                location={(t as SupportTicket).service_location}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ticket number" value={t.ticket_number} />
              <Field label="Submitted" value={formatDateTime(t.submitted_at)} />
              <Field label="Customer" value={customerRes.data?.name ?? "—"} />
              <Field
                label="Contract"
                value={
                  contract
                    ? `${contract.contract_number ?? "—"} · ${contract.name}`
                    : "No contract linked"
                }
              />
              <Field label="Assigned technician" value={technicianRes.data?.full_name ?? "Unassigned"} />
              <Field label="Issue category" value={t.service_category ?? "—"} />
              <Field
                label="Job type"
                value={serviceModeLabel((t as SupportTicket).service_mode)}
              />
              <Field
                label="Service location"
                value={(t as SupportTicket).service_location?.trim() || "—"}
              />
            </div>
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide opacity-50">Request title</p>
              <p className="mt-1 text-sm font-medium">{t.title}</p>
            </div>
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide opacity-50">Request description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{t.description}</p>
            </div>
          </Section>

          <Section
            title="SLA information"
            tone={isOverdue ? "error" : sla.overall === "at_risk" ? "warning" : "default"}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs opacity-60">Overall SLA result</span>
              <SlaConditionBadge condition={sla.overall} />
            </div>
            <p className="mb-3 text-xs opacity-60">
              Deadlines use continuous calendar hours from submission (contract after-hours notes are
              policy text only — no structured service-hour calendar is stored). Status is calculated
              when you view this page from the timestamps below.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Target response deadline" value={formatDateTime(t.target_response_at)} />
              <Field label="Target resolution deadline" value={formatDateTime(t.target_resolution_at)} />
              <Field label="Actual response time" value={formatDateTime(t.actual_response_at)} />
              <Field label="Completion date" value={formatDateTime(t.completed_at)} />
              <Field
                label="Response SLA"
                value={
                  <span className="inline-flex items-center gap-2">
                    <SlaConditionBadge condition={sla.response} />
                  </span>
                }
              />
              <Field
                label="Resolution SLA"
                value={
                  <span className="inline-flex items-center gap-2">
                    <SlaConditionBadge condition={sla.resolution} />
                  </span>
                }
              />
            </div>
          </Section>

          <Section title="Contract requirements">
            {!contract ? (
              <EmptyState
                title="No contract linked"
                description="This ticket is not tied to an active contract, so contractual SLA and hour allowances are unavailable."
              />
            ) : (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <StatCard
                    label="Hours used this month"
                    value={`${usedHours.toFixed(1)} / ${includedHours.toFixed(1)}`}
                    hint={`${usagePct.toFixed(0)}% of included hours`}
                    explanation={{
                      title: "Hours used this month",
                      result: `${usedHours.toFixed(1)} / ${includedHours.toFixed(1)}`,
                      formula: "Sum of included-classification time entries on this contract this month ÷ included hours per month",
                      lines: [
                        { label: "Included hours this month", value: `${includedHours.toFixed(1)} hrs` },
                        { label: "Included hours used", value: `${usedHours.toFixed(1)} hrs` },
                      ],
                    }}
                  />
                  <StatCard
                    label="Hours remaining"
                    value={`${remainingHours.toFixed(1)} hrs`}
                    explanation={{
                      title: "Hours remaining",
                      result: `${remainingHours.toFixed(1)} hrs`,
                      formula: "Included hours per month − included hours used this month",
                      lines: [
                        { label: "Included hours this month", value: `${includedHours.toFixed(1)} hrs` },
                        { label: "Hours used", value: `${usedHours.toFixed(1)} hrs` },
                        { label: "Hours remaining", value: `${remainingHours.toFixed(1)} hrs` },
                      ],
                    }}
                  />
                  <StatCard
                    label="Additional hourly rate"
                    value={`$${Number(contract.additional_hourly_rate ?? 0).toFixed(2)}/hr`}
                    explanation={{
                      title: "Additional hourly rate",
                      result: `$${Number(contract.additional_hourly_rate ?? 0).toFixed(2)}/hr`,
                      formula: "Contract additional_hourly_rate charged after included hours are used",
                      lines: [{ label: contract.name, value: `$${Number(contract.additional_hourly_rate ?? 0).toFixed(2)}/hr` }],
                    }}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Contract name" value={contract.name} />
                  <Field label="Contract number" value={contract.contract_number ?? "—"} />
                  <Field label="Contract status" value={<StatusBadge status={contract.status} />} />
                  <Field
                    label="Included monthly support hours"
                    value={<Hours value={includedHours} />}
                  />
                  <Field
                    label="Service-level response target"
                    value={
                      contract.sla_response_hours != null
                        ? `${contract.sla_response_hours} hours`
                        : "—"
                    }
                  />
                  <Field
                    label="Service-level resolution target"
                    value={
                      contract.sla_resolution_hours != null
                        ? `${contract.sla_resolution_hours} hours`
                        : "—"
                    }
                  />
                  <Field
                    label="Remote-support terms"
                    value={boolTerm(contract.remote_support, "Remote support included", "Remote support not included")}
                  />
                  <Field
                    label="On-site-support terms"
                    value={boolTerm(contract.onsite_support, "On-site support included", "On-site support not included")}
                  />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide opacity-50">Included services</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                      {contract.included_services ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide opacity-50">Excluded services</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                      {contract.excluded_services ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-wide opacity-50">After-hours terms</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                    {contract.after_hours_terms ?? "—"}
                  </p>
                </div>
              </>
            )}
          </Section>

          <Section title="Work information">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Included or billable classification"
                value={t.classification ? <StatusBadge status={t.classification} /> : "—"}
              />
              <Field
                label="Billable approval status"
                value={
                  t.billable_approval_status ? (
                    <StatusBadge status={t.billable_approval_status} />
                  ) : (
                    "—"
                  )
                }
              />
            </div>

            {canSeeInternalNotes ? (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide opacity-50">Technician work notes</p>
                {t.technician_notes ? (
                  <pre className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{t.technician_notes}</pre>
                ) : (
                  <p className="mt-1 text-sm opacity-60">No internal work notes yet.</p>
                )}
              </div>
            ) : null}

            {canSeeInternalNotes ? (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide opacity-50">Completion notes (internal)</p>
                {t.completion_notes ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{t.completion_notes}</p>
                ) : (
                  <p className="mt-1 text-sm opacity-60">No internal completion notes yet.</p>
                )}
                {t.no_time_explanation ? (
                  <p className="mt-2 text-xs opacity-70">
                    Zero-time explanation: {t.no_time_explanation}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 rounded-box border border-success/30 bg-success/5 p-3">
              <p className="text-xs uppercase tracking-wide opacity-50">
                Customer-visible resolution summary
              </p>
              {t.customer_resolution_summary ? (
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                  {t.customer_resolution_summary}
                </p>
              ) : (
                <p className="mt-1 text-sm opacity-60">No customer-facing resolution has been posted yet.</p>
              )}
              {t.customer_confirmed ? (
                <p className="mt-2 text-xs text-success">Customer confirmed this resolution.</p>
              ) : null}
            </div>

            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">
                Time entries (<Hours value={totalTicketHours} />)
              </p>
              {timeEntries.length === 0 ? (
                <EmptyState
                  title="No time logged yet"
                  description="Technician time against this ticket will show up here."
                />
              ) : (
                <DataTable
                  headers={
                    canSeeInternalCosts && !showCustomerCosts
                      ? ["Date", "Technician", "Hours", "Type", "Billing rate", "Labor cost", "Notes"]
                      : ["Date", "Technician", "Hours", "Type", "Notes"]
                  }
                >
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
                      {canSeeInternalCosts && !showCustomerCosts ? (
                        <>
                          <td>
                            {e.billing_rate != null ? <Money value={Number(e.billing_rate)} /> : "—"}
                          </td>
                          <td>
                            {e.labor_cost != null ? <Money value={Number(e.labor_cost)} /> : "—"}
                          </td>
                        </>
                      ) : null}
                      <td className="max-w-xs truncate opacity-70">{e.description}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
              {isCustomer ? (
                <p className="mt-2 text-xs opacity-60">
                  Cost rates and profitability details are not shown on customer accounts.
                </p>
              ) : null}
            </div>

            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">Direct costs</p>
              {directCosts.length === 0 ? (
                <EmptyState
                  title="No direct costs"
                  description="Parts, vendor charges, or other costs tied to this ticket will appear here."
                />
              ) : isCustomer ? (
                <DataTable headers={["Date", "Category", "Description", "Billable amount", "Status"]}>
                  {directCosts.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <DateText value={c.cost_date} />
                      </td>
                      <td>{c.cost_category}</td>
                      <td className="max-w-xs truncate">{c.description}</td>
                      <td>
                        <Money value={Number(c.billable_amount)} />
                      </td>
                      <td>
                        <StatusBadge status={c.billing_status} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              ) : (
                <DataTable
                  headers={["Date", "Category", "Vendor", "Internal cost", "Billable", "Approval", "Billing"]}
                >
                  {directCosts.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <DateText value={c.cost_date} />
                      </td>
                      <td>{c.cost_category}</td>
                      <td>{c.vendor ?? "—"}</td>
                      <td>
                        <Money value={Number(c.internal_cost)} />
                      </td>
                      <td>
                        <Money value={Number(c.billable_amount)} />
                      </td>
                      <td>
                        <StatusBadge status={c.approval_status} />
                      </td>
                      <td>
                        <StatusBadge status={c.billing_status} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </div>

            {isInternal ? (
              <div className="mt-5">
                <p className="mb-2 text-sm font-semibold">Additional work requests</p>
                {(additionalWorkRes.data ?? []).length === 0 ? (
                  <EmptyState
                    title="Nothing flagged"
                    description="Out-of-scope work flagged from this ticket will appear here."
                  />
                ) : (
                  <DataTable headers={["Title", "Est. Hours", "Est. Amount", "Status"]}>
                    {(additionalWorkRes.data ?? []).map((w) => (
                      <tr key={w.id}>
                        <td>{w.title}</td>
                        <td>
                          {w.estimated_hours != null ? <Hours value={Number(w.estimated_hours)} /> : "—"}
                        </td>
                        <td>
                          {w.estimated_amount != null ? (
                            <Money value={Number(w.estimated_amount)} />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <StatusBadge status={w.approval_status} />
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                )}
              </div>
            ) : null}
          </Section>
      </div>
    </div>
  );
}
