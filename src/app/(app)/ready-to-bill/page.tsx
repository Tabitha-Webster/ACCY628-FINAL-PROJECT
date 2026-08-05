import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ReadyToBillClient, type MonthlyFeeInfo, type ReadyItem } from "@/components/ReadyToBillClient";
import { TICKET_BILLING_ELIGIBILITY_RULES } from "@/lib/billingEligibility";

export default async function ReadyToBillPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  // Technicians cannot create invoices or use Ready to Bill.
  if (!["manager", "billing"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();

  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [
    { data: ticketTime },
    { data: ticketCosts },
    { data: nonTicketTime },
    { data: nonTicketCosts },
    { data: projects },
    { data: activeContracts },
    { data: recurringRevenue },
  ] = await Promise.all([
    // Reliable ticket eligibility source (DB view encodes all controls).
    supabase
      .from("v_ticket_time_ready_to_bill")
      .select(
        "id, customer_id, customer_name, contract_id, contract_name, support_ticket_id, ticket_number, technician_name, work_date, hours_worked, billing_rate, description, work_category, amount, approval_status, billing_status"
      )
      .order("work_date", { ascending: true }),
    supabase
      .from("v_ticket_cost_ready_to_bill")
      .select(
        "id, customer_id, customer_name, contract_id, contract_name, support_ticket_id, ticket_number, technician_name, cost_date, cost_category, vendor, description, amount, approval_status, billing_status"
      )
      .order("cost_date", { ascending: true }),
    // Non-ticket billable time (projects / standalone) — unchanged path.
    supabase
      .from("time_entries")
      .select(
        "id, customer_id, contract_id, work_date, hours_worked, billing_rate, description, work_category, customers(name), contracts(name)"
      )
      .is("support_ticket_id", null)
      .eq("classification", "billable")
      .in("billing_status", ["unbilled", "ready"])
      .in("approval_status", ["approved", "not_required"])
      .is("invoice_id", null)
      .is("invoice_line_item_id", null)
      .order("work_date", { ascending: true }),
    supabase
      .from("direct_costs")
      .select(
        "id, customer_id, contract_id, cost_category, vendor, cost_date, billable_amount, description, customers(name), contracts(name)"
      )
      .is("support_ticket_id", null)
      .eq("approval_status", "approved")
      .in("billing_status", ["unbilled", "ready"])
      .is("invoice_id", null)
      .is("invoice_line_item_id", null)
      .gt("billable_amount", 0)
      .order("cost_date", { ascending: true }),
    supabase
      .from("projects")
      .select("id, customer_id, contract_id, name, fixed_fee, estimated_billing_amount, status, customers(name)")
      .in("status", ["completed", "approved"])
      .in("billing_status", ["unbilled", "ready"]),
    supabase
      .from("contracts")
      .select("id, name, monthly_recurring_fee, customers(name)")
      .eq("status", "active")
      .gt("monthly_recurring_fee", 0),
    supabase.from("revenue_records").select("contract_id").eq("revenue_type", "recurring").eq("period_month", periodMonth),
  ]);

  const contractsWithRevenue = new Set((recurringRevenue ?? []).map((r) => r.contract_id));

  const readyItems: ReadyItem[] = [
    ...(ticketTime ?? []).map((entry) => {
      const hours = Number(entry.hours_worked ?? 0);
      return {
        type: "time_entry" as const,
        id: entry.id,
        customerId: entry.customer_id,
        customerName: entry.customer_name ?? "Unknown customer",
        contractId: entry.contract_id,
        contractName: entry.contract_name ?? null,
        description: entry.description,
        detail: [
          entry.ticket_number ? `Ticket ${entry.ticket_number}` : null,
          entry.technician_name ? `Tech ${entry.technician_name}` : null,
          `${hours.toFixed(1)} hrs on ${entry.work_date}`,
          entry.work_category,
          "Ticket-eligible",
        ]
          .filter(Boolean)
          .join(" · "),
        amount: Number(entry.amount ?? hours * Number(entry.billing_rate ?? 0)),
        source: "ticket" as const,
        ticketNumber: entry.ticket_number ?? null,
      };
    }),
    ...(ticketCosts ?? []).map((cost) => ({
      type: "direct_cost" as const,
      id: cost.id,
      customerId: cost.customer_id,
      customerName: cost.customer_name ?? "Unknown customer",
      contractId: cost.contract_id,
      contractName: cost.contract_name ?? null,
      description: cost.description,
      detail: [
        cost.ticket_number ? `Ticket ${cost.ticket_number}` : null,
        cost.cost_category,
        cost.vendor,
        cost.cost_date,
        "Ticket-eligible",
      ]
        .filter(Boolean)
        .join(" · "),
      amount: Number(cost.amount ?? 0),
      source: "ticket" as const,
      ticketNumber: cost.ticket_number ?? null,
    })),
    ...(nonTicketTime ?? []).map((entry) => {
      const customer = Array.isArray(entry.customers) ? entry.customers[0] : entry.customers;
      const contract = Array.isArray(entry.contracts) ? entry.contracts[0] : entry.contracts;
      const hours = Number(entry.hours_worked ?? 0);
      const rate = Number(entry.billing_rate ?? 0);
      return {
        type: "time_entry" as const,
        id: entry.id,
        customerId: entry.customer_id,
        customerName: customer?.name ?? "Unknown customer",
        contractId: entry.contract_id,
        contractName: contract?.name ?? null,
        description: entry.description,
        detail: `${hours.toFixed(1)} hrs on ${entry.work_date}${entry.work_category ? ` · ${entry.work_category}` : ""}`,
        amount: hours * rate,
        source: "other" as const,
        ticketNumber: null,
      };
    }),
    ...(nonTicketCosts ?? []).map((cost) => {
      const customer = Array.isArray(cost.customers) ? cost.customers[0] : cost.customers;
      const contract = Array.isArray(cost.contracts) ? cost.contracts[0] : cost.contracts;
      return {
        type: "direct_cost" as const,
        id: cost.id,
        customerId: cost.customer_id,
        customerName: customer?.name ?? "Unknown customer",
        contractId: cost.contract_id,
        contractName: contract?.name ?? null,
        description: cost.description,
        detail: `${cost.cost_category}${cost.vendor ? ` · ${cost.vendor}` : ""} · ${cost.cost_date}`,
        amount: Number(cost.billable_amount ?? 0),
        source: "other" as const,
        ticketNumber: null,
      };
    }),
    ...(projects ?? []).map((project) => {
      const customer = Array.isArray(project.customers) ? project.customers[0] : project.customers;
      return {
        type: "project" as const,
        id: project.id,
        customerId: project.customer_id,
        customerName: customer?.name ?? "Unknown customer",
        contractId: project.contract_id,
        contractName: null,
        description: project.name,
        detail: `Project ${project.status === "completed" ? "completed" : "approved"} for billing`,
        amount: Number(project.fixed_fee || project.estimated_billing_amount || 0),
        source: "other" as const,
        ticketNumber: null,
      };
    }),
  ];

  // De-dupe if a row somehow appears in both ticket view and legacy query (should not).
  const seen = new Set<string>();
  const deduped = readyItems.filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const monthlyFees: MonthlyFeeInfo[] = (activeContracts ?? [])
    .filter((c) => !contractsWithRevenue.has(c.id))
    .map((c) => {
      const customer = Array.isArray(c.customers) ? c.customers[0] : c.customers;
      return {
        contractId: c.id,
        contractName: c.name,
        customerName: customer?.name ?? "Unknown customer",
        monthlyFee: Number(c.monthly_recurring_fee ?? 0),
        periodLabel: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      };
    });

  const ticketReadyCount = deduped.filter((i) => i.source === "ticket").length;

  return (
    <div>
      <PageHeader
        title="Ready to Bill"
        description="Approved, unbilled work waiting to be placed on a customer invoice. Ticket work appears only when eligibility controls are met — invoices are never generated automatically."
      />
      <div className="mb-4 rounded-box border border-base-300 bg-base-100 p-4 text-sm">
        <p className="font-medium">
          Ticket-eligible items in this queue: {ticketReadyCount}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs opacity-70">
          {TICKET_BILLING_ELIGIBILITY_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>
      <ReadyToBillClient items={deduped} monthlyFees={monthlyFees} />
    </div>
  );
}
