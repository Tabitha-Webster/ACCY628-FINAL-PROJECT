import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ButtonLink } from "@/components/Button";
import { Card } from "@/components/Card";
import {
  AccountingExplainer,
  DataTable,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { grossMarginPct, grossProfit } from "@/lib/calculations";

const OPEN_TICKET_STATUSES = ["new", "assigned", "in_progress", "waiting_on_customer", "waiting_on_approval"];

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing", "technician"].includes(profile.role)) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!customerError && !customer) notFound();

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
      .select("id, contract_number, name, status, contract_type, start_date, end_date, monthly_recurring_fee")
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
      .select("id, invoice_number, invoice_date, due_date, status, total_amount, remaining_balance")
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

  const activeContracts = (contracts ?? []).filter((c) => c.status === "active").length;
  const openTickets = (tickets ?? []).filter((t) => OPEN_TICKET_STATUSES.includes(t.status)).length;
  const nonCanceledInvoices = (invoices ?? []).filter((inv) => inv.status !== "canceled");
  const totalAr = nonCanceledInvoices.reduce((sum, inv) => sum + Number(inv.remaining_balance ?? 0), 0);
  const overdueAmount = (invoices ?? [])
    .filter((inv) => inv.status === "overdue")
    .reduce((sum, inv) => sum + Number(inv.remaining_balance ?? 0), 0);

  const ytdRevenue = (revenueYtd ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const ytdCost = (costsYtd ?? []).reduce((sum, c) => sum + Number(c.internal_cost ?? 0), 0);
  const ytdProfit = grossProfit(ytdRevenue, ytdCost);
  const ytdMargin = grossMarginPct(ytdRevenue, ytdCost);

  if (customerError || !customer) {
    return <ErrorState message={customerError?.message ?? "Customer not found."} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name}
        description={customer.industry ? `${customer.industry} · ${customer.credit_terms ?? "Net 30"}` : undefined}
        actions={<StatusBadge status={customer.status} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Contracts" value={String(activeContracts)} />
        <StatCard label="Open Tickets" value={String(openTickets)} tone={openTickets > 0 ? "warning" : "default"} />
        <StatCard label="Accounts Receivable" value={formatCurrency(totalAr)} />
        <StatCard
          label="Overdue Amount"
          value={formatCurrency(overdueAmount)}
          tone={overdueAmount > 0 ? "error" : "default"}
        />
      </div>

      <Card title="Year to Date" description="Earned revenue, direct costs, and margin for the current calendar year.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Contracts">
          {contracts && contracts.length > 0 ? (
            <DataTable headers={["Contract", "Status", "Type", "Term", "Monthly Fee"]}>
              {contracts.map((contract) => (
                <tr key={contract.id}>
                  <td>
                    <Link href={`/contracts/${contract.id}`} className="link link-hover font-medium">
                      {contract.name}
                    </Link>
                    <div className="text-xs opacity-60">{contract.contract_number}</div>
                  </td>
                  <td>
                    <StatusBadge status={contract.status} />
                  </td>
                  <td className="text-xs">{contract.contract_type}</td>
                  <td className="text-xs">
                    {formatDate(contract.start_date)} – {formatDate(contract.end_date)}
                  </td>
                  <td>
                    <Money value={Number(contract.monthly_recurring_fee ?? 0)} />
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <EmptyState title="No contracts on file" />
          )}
        </Card>

        <Card title="Recent Tickets">
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
        </Card>
      </div>

      <Card title="Invoices">
        {invoices && invoices.length > 0 ? (
          <DataTable headers={["Invoice", "Date", "Due", "Status", "Total", "Balance", ""]}>
            {invoices.map((invoice) => (
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
                  <ButtonLink href={`/invoices/${invoice.id}`} variant="secondary" size="xs">
                    View
                  </ButtonLink>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No invoices issued yet" />
        )}
      </Card>

      <AccountingExplainer />
    </div>
  );
}
