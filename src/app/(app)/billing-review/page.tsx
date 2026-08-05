import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import {
  BillingReviewClient,
  type MonthlyPackage,
  type ReviewException,
  type ReviewItem,
} from "@/components/BillingReviewClient";
import { computeMonthlyUsage, currentBillingPeriod, round2 } from "@/lib/billing";

function unwrapName(rel: { name?: string } | { name?: string }[] | null | undefined, fallback = "Unknown customer") {
  if (!rel) return fallback;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name || fallback;
}

function unwrapOptionalName(rel: { name?: string } | { name?: string }[] | null | undefined) {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name || null;
}

export default async function BillingReviewPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { start: billingPeriodStart, end: billingPeriodEnd, label: periodLabel } = currentBillingPeriod();

  const [
    { data: activeContracts },
    { data: timeEntries },
    { data: directCosts },
    { data: milestones },
    { data: projects },
    { data: recurringLines },
    { data: pendingTime },
    { data: pendingCosts },
    { data: pendingWork },
  ] = await Promise.all([
    supabase
      .from("contracts")
      .select(
        "id, name, customer_id, monthly_recurring_fee, included_hours_per_month, additional_hourly_rate, customers(name)"
      )
      .eq("status", "active"),
    supabase
      .from("time_entries")
      .select("id, contract_id, hours_worked, classification, approval_status, work_date")
      .gte("work_date", billingPeriodStart)
      .lte("work_date", billingPeriodEnd),
    supabase
      .from("direct_costs")
      .select(
        "id, customer_id, contract_id, cost_category, vendor, cost_date, billable_amount, description, approval_status, billing_status, customers(name), contracts(name)"
      )
      .eq("approval_status", "approved")
      .in("billing_status", ["unbilled", "ready"]),
    supabase
      .from("project_milestones")
      .select(
        "id, name, amount, due_date, project_id, billing_status, projects(id, customer_id, contract_id, name, customers(name), contracts(name))"
      )
      .eq("completed", true)
      .in("approval_status", ["approved", "not_required"])
      .in("billing_status", ["unbilled", "ready"]),
    supabase
      .from("projects")
      .select(
        "id, customer_id, contract_id, name, fixed_fee, estimated_billing_amount, status, uses_milestone_billing, customers(name), contracts(name)"
      )
      .eq("uses_milestone_billing", false)
      .in("status", ["completed", "approved"])
      .in("billing_status", ["unbilled", "ready"]),
    supabase
      .from("invoice_line_items")
      .select("source_id, invoice_id, invoices(status, billing_period_start)")
      .eq("source_type", "recurring"),
    supabase
      .from("time_entries")
      .select("id, description, hours_worked, work_date, customers(name)")
      .eq("approval_status", "pending")
      .in("classification", ["billable", "out_of_scope"]),
    supabase.from("direct_costs").select("id, description, billable_amount, cost_date, customers(name)").eq("approval_status", "pending"),
    supabase.from("additional_work_requests").select("id, title, estimated_amount, customers(name)").eq("approval_status", "pending"),
  ]);

  const billedRecurring = new Set(
    (recurringLines ?? [])
      .filter((row) => {
        const invoice = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
        return invoice && invoice.status !== "canceled" && invoice.billing_period_start === billingPeriodStart;
      })
      .map((row) => row.source_id)
      .filter(Boolean)
  );

  const timeByContract = new Map<
    string,
    { hours_worked: number | string; classification: string; approval_status: string }[]
  >();
  for (const entry of timeEntries ?? []) {
    if (!entry.contract_id) continue;
    const list = timeByContract.get(entry.contract_id) ?? [];
    list.push(entry);
    timeByContract.set(entry.contract_id, list);
  }

  const packages: MonthlyPackage[] = [];

  for (const contract of activeContracts ?? []) {
    const usage = computeMonthlyUsage(
      timeByContract.get(contract.id) ?? [],
      Number(contract.included_hours_per_month ?? 0),
      Number(contract.additional_hourly_rate ?? 0),
      Number(contract.monthly_recurring_fee ?? 0)
    );

    const projectCharges = (projects ?? [])
      .filter((project) => project.contract_id === contract.id)
      .map((project) => ({
        id: project.id,
        name: project.name,
        amount: round2(Number(project.fixed_fee || project.estimated_billing_amount || 0)),
      }))
      .filter((row) => row.amount > 0);

    const milestoneCharges = (milestones ?? [])
      .map((milestone) => {
        const project = Array.isArray(milestone.projects) ? milestone.projects[0] : milestone.projects;
        if (!project || project.contract_id !== contract.id) return null;
        return {
          id: milestone.id,
          name: `${project.name}: ${milestone.name}`,
          amount: round2(Number(milestone.amount ?? 0)),
        };
      })
      .filter((row): row is { id: string; name: string; amount: number } => Boolean(row && row.amount > 0));

    const equipmentSoftwareCharges = (directCosts ?? [])
      .filter(
        (cost) =>
          cost.contract_id === contract.id && ["software", "equipment"].includes(String(cost.cost_category ?? ""))
      )
      .map((cost) => ({
        id: cost.id,
        description: cost.description,
        category: String(cost.cost_category),
        amount: round2(Number(cost.billable_amount ?? 0)),
      }))
      .filter((row) => row.amount > 0);

    const alreadyInvoiced = billedRecurring.has(contract.id);
    const monthlyFee = alreadyInvoiced ? 0 : usage.monthlyFee;
    const overageCharge = alreadyInvoiced ? 0 : usage.overageCharge;
    const projectTotal = [...projectCharges, ...milestoneCharges].reduce((sum, row) => sum + row.amount, 0);
    const equipmentTotal = equipmentSoftwareCharges.reduce((sum, row) => sum + row.amount, 0);
    const estimatedTotal = round2(monthlyFee + overageCharge + projectTotal + equipmentTotal);

    if (
      usage.monthlyFee <= 0 &&
      usage.includedHours <= 0 &&
      usage.overageCharge <= 0 &&
      projectCharges.length === 0 &&
      milestoneCharges.length === 0 &&
      equipmentSoftwareCharges.length === 0
    ) {
      continue;
    }

    packages.push({
      contractId: contract.id,
      contractName: contract.name,
      customerId: contract.customer_id,
      customerName: unwrapName(contract.customers),
      alreadyInvoiced,
      monthlyFee: usage.monthlyFee,
      includedHours: usage.includedHours,
      includedHoursUsed: usage.includedHoursUsed,
      overageHours: alreadyInvoiced ? 0 : usage.overageHours,
      overageRate: usage.additionalHourlyRate,
      overageCharge,
      projectCharges: [...projectCharges, ...milestoneCharges],
      equipmentSoftwareCharges,
      estimatedTotal,
    });
  }

  const items: ReviewItem[] = [];

  for (const cost of directCosts ?? []) {
    const category = String(cost.cost_category ?? "other");
    if (["software", "equipment"].includes(category)) continue;
    const label =
      category === "vendor"
        ? "Vendor Cost"
        : category === "travel" || category === "shipping" || category === "other"
          ? "Reimbursable Expense"
          : "Approved Cost";
    items.push({
      type: "direct_cost",
      id: cost.id,
      customerId: cost.customer_id,
      customerName: unwrapName(cost.customers),
      contractId: cost.contract_id,
      contractName: unwrapOptionalName(cost.contracts),
      categoryLabel: label,
      description: cost.description,
      detail: `${category}${cost.vendor ? ` · ${cost.vendor}` : ""} · ${cost.cost_date}`,
      amount: Number(cost.billable_amount ?? 0),
    });
  }

  const exceptions: ReviewException[] = [
    ...(pendingTime ?? []).map((row) => ({
      id: `time-${row.id}`,
      customerName: unwrapName(row.customers),
      reason: "Unapproved additional hours",
      detail: `${row.description} · ${Number(row.hours_worked ?? 0).toFixed(1)} hrs on ${row.work_date}`,
    })),
    ...(pendingCosts ?? []).map((row) => ({
      id: `cost-${row.id}`,
      customerName: unwrapName(row.customers),
      reason: "Unapproved direct cost",
      detail: `${row.description} · ${row.cost_date}`,
    })),
    ...(pendingWork ?? []).map((row) => ({
      id: `awr-${row.id}`,
      customerName: unwrapName(row.customers),
      reason: "Additional work awaiting manager approval",
      detail: row.title,
    })),
  ];

  return (
    <div>
      <PageHeader
        title="Billing Review"
        description={`Preview ${periodLabel} monthly contract charges, included hours, overage, approved projects, and equipment or software before generating invoices.`}
      />
      <BillingReviewClient
        packages={packages}
        items={items}
        exceptions={exceptions}
        periodLabel={periodLabel}
        periodRange={`${billingPeriodStart} to ${billingPeriodEnd}`}
      />
    </div>
  );
}
