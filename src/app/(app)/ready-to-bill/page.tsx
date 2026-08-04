import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ReadyToBillClient, type MonthlyFeeInfo, type ReadyItem } from "@/components/ReadyToBillClient";

export default async function ReadyToBillPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();

  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [
    { data: timeEntries },
    { data: directCosts },
    { data: projects },
    { data: activeContracts },
    { data: recurringRevenue },
  ] = await Promise.all([
    supabase
      .from("time_entries")
      .select(
        "id, customer_id, contract_id, work_date, hours_worked, billing_rate, description, work_category, customers(name), contracts(name)"
      )
      .eq("classification", "billable")
      .in("billing_status", ["unbilled", "ready"])
      .in("approval_status", ["approved", "not_required"])
      .order("work_date", { ascending: true }),
    supabase
      .from("direct_costs")
      .select(
        "id, customer_id, contract_id, cost_category, vendor, cost_date, billable_amount, description, customers(name)"
      )
      .eq("approval_status", "approved")
      .in("billing_status", ["unbilled", "ready"])
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
    ...(timeEntries ?? []).map((entry) => {
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
      };
    }),
    ...(directCosts ?? []).map((cost) => {
      const customer = Array.isArray(cost.customers) ? cost.customers[0] : cost.customers;
      return {
        type: "direct_cost" as const,
        id: cost.id,
        customerId: cost.customer_id,
        customerName: customer?.name ?? "Unknown customer",
        contractId: cost.contract_id,
        contractName: null,
        description: cost.description,
        detail: `${cost.cost_category}${cost.vendor ? ` · ${cost.vendor}` : ""} · ${cost.cost_date}`,
        amount: Number(cost.billable_amount ?? 0),
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
      };
    }),
  ];

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

  return (
    <div>
      <PageHeader
        title="Ready to Bill"
        description="Approved, unbilled work waiting to be placed on a customer invoice."
      />
      <ReadyToBillClient items={readyItems} monthlyFees={monthlyFees} />
    </div>
  );
}
