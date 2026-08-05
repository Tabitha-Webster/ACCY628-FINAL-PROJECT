import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ButtonLink } from "@/components/Button";
import { Card } from "@/components/Card";
import { DeleteCustomerButton } from "@/components/DeleteCustomerButton";
import { PageLayout } from "@/components/PageLayout";
import {
  DataTable,
  EmptyState,
  ErrorState,
  Money,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { formatCurrency, formatDate, statusBadgeClass, statusLabel } from "@/lib/format";
import { grossMarginPct, grossProfit } from "@/lib/calculations";
import { todayDateString, withDerivedInvoiceStatus } from "@/lib/billing";
import {
  canEditCustomers,
  canViewCustomers,
  getCustomerDetailForInternalRoles,
} from "@/lib/customers/queries";

export const dynamic = "force-dynamic";

const OPEN_TICKET_STATUSES = ["new", "assigned", "in_progress", "waiting_on_customer", "waiting_on_approval"];

function display(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function customerStatusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "active") return "badge-success";
  if (s === "inactive") return "badge-error";
  if (s === "on_hold") return "badge-warning";
  return statusBadgeClass(s);
}

function CustomerStatusBadge({ status }: { status: string }) {
  return <span className={`badge ${customerStatusBadgeClass(status)}`}>{statusLabel(status)}</span>;
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide opacity-60">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewCustomers(profile.role)) redirect("/dashboard");

  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId ?? "").trim();

  if (!id) {
    return (
      <PageLayout
        title="Customer not found"
        description="Customer details"
        actions={
          <ButtonLink href="/customers" variant="secondary" size="sm">
            Back to list
          </ButtonLink>
        }
      >
        <ErrorState message="No customer ID was provided in the link. Return to the customer list and select a customer again." />
      </PageLayout>
    );
  }

  const supabase = await createClient();
  const { customer, error } = await getCustomerDetailForInternalRoles(supabase, id);

  if (error) {
    return (
      <PageLayout
        title="Customer"
        description="Customer details"
        actions={
          <ButtonLink href="/customers" variant="secondary" size="sm">
            Back to list
          </ButtonLink>
        }
      >
        <ErrorState message={`Unable to load this customer. ${error.message}`} />
      </PageLayout>
    );
  }

  if (!customer) {
    return (
      <PageLayout
        title="Customer not found"
        description="Customer details"
        actions={
          <ButtonLink href="/customers" variant="secondary" size="sm">
            Back to list
          </ButtonLink>
        }
      >
        <ErrorState message="That customer does not exist, or you do not have access to it. Return to the customer list and try another record." />
      </PageLayout>
    );
  }

  const yearStart = `${new Date().getFullYear()}-01-01`;

  const [
    { data: contracts },
    { data: tickets },
    { data: invoices },
    { data: revenueYtd },
    { data: costsYtd },
  ] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, contract_number, name, status, contract_type, start_date, end_date")
      .eq("customer_id", id)
      .order("start_date", { ascending: false }),
    supabase
      .from("support_tickets")
      .select("id, ticket_number, title, status, priority, submitted_at")
      .eq("customer_id", id)
      .order("submitted_at", { ascending: false })
      .limit(10),
    supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, due_date, status, total_amount, remaining_balance, amount_paid, dispute_status")
      .eq("customer_id", id)
      .order("invoice_date", { ascending: false }),
    supabase
      .from("revenue_records")
      .select("amount")
      .eq("customer_id", id)
      .eq("recognition", "earned")
      .gte("period_month", yearStart),
    supabase.from("direct_costs").select("internal_cost").eq("customer_id", id).gte("cost_date", yearStart),
  ]);

  const derivedInvoices = (invoices ?? []).map((inv) => withDerivedInvoiceStatus(inv));
  const activeContractsList = (contracts ?? []).filter((c) => c.status === "active");
  const activeContracts = activeContractsList.length;
  const openTicketRows = (tickets ?? []).filter((t) => OPEN_TICKET_STATUSES.includes(t.status));
  const openTickets = openTicketRows.length;
  const openReceivables = derivedInvoices.filter(
    (inv) => !["draft", "canceled", "paid"].includes(inv.status) && inv.remaining_balance > 0.01
  );
  const totalAr = openReceivables.reduce((sum, inv) => sum + inv.remaining_balance, 0);
  const today = todayDateString();
  const overdueInvoices = openReceivables.filter((inv) => inv.due_date < today);
  const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.remaining_balance, 0);

  const ytdRevenue = (revenueYtd ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const ytdCost = (costsYtd ?? []).reduce((sum, c) => sum + Number(c.internal_cost ?? 0), 0);
  const ytdProfit = grossProfit(ytdRevenue, ytdCost);
  const ytdMargin = grossMarginPct(ytdRevenue, ytdCost);

  const row = customer;
  const identifier = display(row.customer_identifier) !== "—" ? row.customer_identifier : row.id;
  const canEdit = canEditCustomers(profile.role);
  const lastUpdated =
    row.updated_at && !Number.isNaN(Date.parse(row.updated_at))
      ? ` Last updated ${formatDate(row.updated_at)}.`
      : "";

  return (
    <PageLayout
      title={display(row.name)}
      description={
        canEdit
          ? `Shared customer profile. Manager and HR can edit; Technician and Billing view the same live data.${lastUpdated}`
          : `View-only shared profile — same live data Manager and HR maintain.${lastUpdated}`
      }
      actions={
        <>
          <ButtonLink href="/customers" variant="secondary" size="sm">
            Back to list
          </ButtonLink>
          {canEdit ? (
            <ButtonLink href={`/customers/${row.id}/edit`} variant="primary" size="sm">
              Edit Customer
            </ButtonLink>
          ) : null}
        </>
      }
    >
      {canEdit ? (
        <div className="mb-2">
          <DeleteCustomerButton
            customerId={row.id}
            customerName={row.name?.trim() || "this customer"}
            currentStatus={row.status}
          />
        </div>
      ) : null}

      <Card title="Customer details">
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Customer identifier">
            <span className="font-mono text-xs tabular-nums">{display(identifier)}</span>
          </DetailField>
          <DetailField label="Customer name">{display(row.name)}</DetailField>
          <DetailField label="Customer status">
            {row.status ? <CustomerStatusBadge status={row.status} /> : "—"}
          </DetailField>
          <DetailField label="Industry">{display(row.industry)}</DetailField>
          <DetailField label="Service address">{display(row.service_address)}</DetailField>
          <DetailField label="Credit terms">{display(row.credit_terms)}</DetailField>
        </dl>
      </Card>

      <Card title="Primary contact">
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Primary contact name">{display(row.primary_contact)}</DetailField>
          <DetailField label="Primary contact email">{display(row.contact_email)}</DetailField>
          <DetailField label="Primary contact phone">{display(row.primary_contact_phone)}</DetailField>
        </dl>
      </Card>

      <Card title="Billing information">
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Billing contact name">{display(row.billing_contact_name)}</DetailField>
          <DetailField label="Billing contact email">{display(row.billing_contact_email)}</DetailField>
          <DetailField label="Billing address">{display(row.billing_address)}</DetailField>
          <DetailField label="City">{display(row.city)}</DetailField>
          <DetailField label="State">{display(row.state)}</DetailField>
          <DetailField label="Postal code">{display(row.postal_code)}</DetailField>
        </dl>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Contracts"
          value={String(activeContracts)}
          explanation={{
            title: "Active Contracts",
            result: String(activeContracts),
            formula: "Count of this customer's contracts where status = active",
            lines: activeContractsList.map((contract) => ({
              label: contract.name,
              value: contract.contract_number,
              detail: contract.contract_type?.replace(/_/g, " "),
            })),
          }}
        />
        <StatCard
          label="Open Tickets"
          value={String(openTickets)}
          tone={openTickets > 0 ? "warning" : "default"}
          explanation={{
            title: "Open Tickets",
            result: String(openTickets),
            formula: "Count of this customer's tickets that are still open",
            lines: openTicketRows.map((ticket) => ({
              label: ticket.ticket_number,
              value: ticket.status.replace(/_/g, " "),
              detail: ticket.title,
            })),
          }}
        />
        <StatCard
          label="Accounts Receivable"
          value={formatCurrency(totalAr)}
          explanation={{
            title: "Accounts Receivable",
            result: formatCurrency(totalAr),
            formula: "Sum of remaining_balance on this customer's open invoices",
            lines: openReceivables.map((invoice) => ({
              label: invoice.invoice_number,
              value: formatCurrency(invoice.remaining_balance),
              detail: invoice.status.replace(/_/g, " "),
            })),
          }}
        />
        <StatCard
          label="Overdue Amount"
          value={formatCurrency(overdueAmount)}
          tone={overdueAmount > 0 ? "error" : "default"}
          explanation={{
            title: "Overdue Amount",
            result: formatCurrency(overdueAmount),
            formula: "Sum of remaining_balance on this customer's open invoices that are past due",
            lines: overdueInvoices.map((invoice) => ({
              label: invoice.invoice_number,
              value: formatCurrency(invoice.remaining_balance),
              detail: `due ${invoice.due_date} · ${invoice.status.replace(/_/g, " ")}`,
            })),
          }}
        />
      </div>

      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Year to Date</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs opacity-60">Earned Revenue</p>
            <p className="text-xl font-semibold tabular-nums">
              <Money value={ytdRevenue} />
            </p>
          </div>
          <div>
            <p className="text-xs opacity-60">Direct Costs</p>
            <p className="text-xl font-semibold tabular-nums">
              <Money value={ytdCost} />
            </p>
          </div>
          <div>
            <p className="text-xs opacity-60">Gross Profit / Margin</p>
            <p className="text-xl font-semibold tabular-nums">
              <Money value={ytdProfit} /> <span className="text-sm opacity-60">({ytdMargin.toFixed(1)}%)</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Contracts</h2>
          </div>
          {contracts && contracts.length > 0 ? (
            <DataTable headers={["Contract name", "Contract type", "Status", "Start date", "End date"]}>
              {contracts.map((contract) => (
                <tr key={contract.id}>
                  <td>
                    <Link href={`/contracts/${contract.id}`} className="link link-hover font-medium">
                      {contract.name}
                    </Link>
                  </td>
                  <td className="text-xs capitalize">
                    {(contract.contract_type ?? "—").toString().replace(/_/g, " ")}
                  </td>
                  <td>
                    <StatusBadge status={contract.status} />
                  </td>
                  <td className="text-xs">{formatDate(contract.start_date)}</td>
                  <td className="text-xs">{formatDate(contract.end_date)}</td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <EmptyState
              title="No contracts for this customer"
              description="There are no contracts linked to this customer yet. When a contract is created for this account, it will appear here."
            />
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Tickets</h2>
          </div>
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
            <EmptyState title="No support tickets on file" />
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Invoices</h2>
        {derivedInvoices.length > 0 ? (
          <DataTable headers={["Invoice", "Date", "Due", "Status", "Total", "Balance", ""]}>
            {derivedInvoices.map((invoice) => (
              <tr key={invoice.id}>
                <td className="font-medium">{invoice.invoice_number}</td>
                <td className="text-xs">{formatDate(invoice.invoice_date)}</td>
                <td className="text-xs">{formatDate(invoice.due_date)}</td>
                <td>
                  <StatusBadge status={invoice.status} />
                </td>
                <td>
                  <Money value={Number(invoice.total_amount ?? 0)} />
                </td>
                <td>
                  <Money value={Number(invoice.remaining_balance ?? 0)} />
                </td>
                <td className="text-right">
                  <Link href={`/invoices/${invoice.id}`} className="btn btn-ghost btn-xs">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No invoices issued yet" />
        )}
      </div>
    </PageLayout>
  );
}
