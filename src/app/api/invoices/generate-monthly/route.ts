import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { computeMonthlyUsage, currentBillingPeriod, round2 } from "@/lib/billing";

function parsePaymentTermsDays(paymentTerms: string | null | undefined): number {
  if (!paymentTerms) return 30;
  const match = paymentTerms.match(/(\d+)/);
  if (!match) return 30;
  const days = Number(match[1]);
  return Number.isFinite(days) && days > 0 ? days : 30;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function generateInvoiceNumber(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `INV-${stamp}-${suffix}`;
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!["manager", "billing"].includes(profile.role)) {
    return NextResponse.json({ error: "Only billing and manager roles can generate invoices." }, { status: 403 });
  }

  let body: { contractIds?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const supabase = await createClient();
  const { start: periodStart, end: periodEnd, label: periodLabel } = currentBillingPeriod();

  let contractQuery = supabase
    .from("contracts")
    .select(
      "id, name, customer_id, status, monthly_recurring_fee, included_hours_per_month, additional_hourly_rate, payment_terms, billing_timing"
    )
    .eq("status", "active");

  if (body.contractIds?.length) {
    contractQuery = contractQuery.in("id", body.contractIds);
  }

  const { data: contracts, error: contractError } = await contractQuery;
  if (contractError) return NextResponse.json({ error: contractError.message }, { status: 500 });
  if (!contracts?.length) {
    return NextResponse.json({ error: "No active contracts were selected." }, { status: 400 });
  }

  const { data: existingRecurringLines } = await supabase
    .from("invoice_line_items")
    .select("source_id, invoice_id, invoices(status, billing_period_start)")
    .eq("source_type", "recurring");

  const alreadyBilled = new Set(
    (existingRecurringLines ?? [])
      .filter((row) => {
        const invoice = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
        return invoice && invoice.status !== "canceled" && invoice.billing_period_start === periodStart;
      })
      .map((row) => row.source_id)
  );

  const created: { invoiceNumber: string; contractName: string; total: number }[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const contract of contracts) {
    const monthlyAlreadyBilled = alreadyBilled.has(contract.id);

    const [{ data: timeEntries }, { data: directCosts }, { data: projects }, { data: milestones }] = await Promise.all([
      supabase
        .from("time_entries")
        .select("id, hours_worked, classification, approval_status, billing_status, work_date")
        .eq("contract_id", contract.id)
        .gte("work_date", periodStart)
        .lte("work_date", periodEnd),
      supabase
        .from("direct_costs")
        .select("id, cost_category, description, billable_amount, approval_status, billing_status, vendor")
        .eq("contract_id", contract.id)
        .eq("approval_status", "approved")
        .in("billing_status", ["unbilled", "ready"])
        .in("cost_category", ["software", "equipment"]),
      supabase
        .from("projects")
        .select("id, name, fixed_fee, estimated_billing_amount, status, billing_status, amount_billed, uses_milestone_billing")
        .eq("contract_id", contract.id)
        .eq("uses_milestone_billing", false)
        .in("status", ["completed", "approved"])
        .in("billing_status", ["unbilled", "ready"]),
      supabase
        .from("project_milestones")
        .select("id, name, amount, billing_status, approval_status, completed, projects!inner(contract_id, name)")
        .eq("completed", true)
        .in("approval_status", ["approved", "not_required"])
        .in("billing_status", ["unbilled", "ready"])
        .eq("projects.contract_id", contract.id),
    ]);

    const usage = computeMonthlyUsage(
      timeEntries ?? [],
      Number(contract.included_hours_per_month ?? 0),
      Number(contract.additional_hourly_rate ?? 0),
      Number(contract.monthly_recurring_fee ?? 0)
    );

    type Draft = {
      description: string;
      quantity: number;
      rate: number;
      line_amount: number;
      source_type: string;
      source_id: string;
    };

    const drafts: Draft[] = [];

    if (!monthlyAlreadyBilled && usage.monthlyFee > 0) {
      drafts.push({
        description: `${contract.name} monthly support fee — ${periodLabel}`,
        quantity: 1,
        rate: usage.monthlyFee,
        line_amount: usage.monthlyFee,
        source_type: "recurring",
        source_id: contract.id,
      });
    }

    if (!monthlyAlreadyBilled && usage.includedHours > 0) {
      drafts.push({
        description: `Included support hours used — ${usage.includedHoursUsed.toFixed(1)} of ${usage.includedHours.toFixed(1)} hrs`,
        quantity: usage.includedHoursUsed,
        rate: 0,
        line_amount: 0,
        source_type: "hours_included",
        source_id: contract.id,
      });
    }

    if (!monthlyAlreadyBilled && usage.overageHours > 0 && usage.overageCharge > 0) {
      drafts.push({
        description: `Overage support hours — ${usage.overageHours.toFixed(1)} hrs above included allotment`,
        quantity: usage.overageHours,
        rate: usage.additionalHourlyRate,
        line_amount: usage.overageCharge,
        source_type: "overage",
        source_id: contract.id,
      });
    }

    for (const project of projects ?? []) {
      const amount = round2(Number(project.fixed_fee || project.estimated_billing_amount || 0));
      if (amount <= 0) continue;
      drafts.push({
        description: `Approved project: ${project.name}`,
        quantity: 1,
        rate: amount,
        line_amount: amount,
        source_type: "project",
        source_id: project.id,
      });
    }

    for (const milestone of milestones ?? []) {
      const amount = round2(Number(milestone.amount ?? 0));
      if (amount <= 0) continue;
      const project = Array.isArray(milestone.projects) ? milestone.projects[0] : milestone.projects;
      drafts.push({
        description: `Approved milestone: ${project?.name ?? "Project"} — ${milestone.name}`,
        quantity: 1,
        rate: amount,
        line_amount: amount,
        source_type: "milestone",
        source_id: milestone.id,
      });
    }

    for (const cost of directCosts ?? []) {
      const amount = round2(Number(cost.billable_amount ?? 0));
      if (amount <= 0) continue;
      const kind = cost.cost_category === "software" ? "Software" : "Equipment";
      drafts.push({
        description: `Approved ${kind.toLowerCase()} charge: ${cost.description}${cost.vendor ? ` (${cost.vendor})` : ""}`,
        quantity: 1,
        rate: amount,
        line_amount: amount,
        source_type: "direct_cost",
        source_id: cost.id,
      });
    }

    const chargeable = drafts.filter((d) => d.line_amount > 0);
    if (chargeable.length === 0) {
      skipped.push(
        monthlyAlreadyBilled
          ? `${contract.name} already has a monthly invoice for ${periodLabel} and has no new project or equipment/software charges.`
          : `${contract.name} has no monthly fee, overage, project, or equipment/software charges this period.`
      );
      continue;
    }

    const subtotal = round2(drafts.reduce((sum, d) => sum + d.line_amount, 0));
    if (subtotal <= 0) {
      skipped.push(`${contract.name} produced a zero-total invoice and was skipped.`);
      continue;
    }

    const invoiceDate = new Date().toISOString().slice(0, 10);
    const dueDate = addDays(invoiceDate, parsePaymentTermsDays(contract.payment_terms));

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        invoice_number: generateInvoiceNumber(),
        customer_id: contract.customer_id,
        contract_id: contract.id,
        invoice_date: invoiceDate,
        due_date: dueDate,
        status: "issued",
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        subtotal,
        tax_amount: 0,
        credits: 0,
        total_amount: subtotal,
        amount_paid: 0,
        remaining_balance: subtotal,
        notes: `Monthly contract invoice for ${periodLabel}. Included hours used: ${usage.includedHoursUsed.toFixed(1)}. Overage hours: ${usage.overageHours.toFixed(1)}.`,
        generated_by: profile.id,
        generated_at: new Date().toISOString(),
      })
      .select("id, invoice_number, total_amount")
      .single();

    if (invoiceError || !invoice) {
      errors.push(`${contract.name}: ${invoiceError?.message ?? "failed to create invoice"}`);
      continue;
    }

    const { data: lineItems, error: lineError } = await supabase
      .from("invoice_line_items")
      .insert(
        drafts.map((d) => ({
          invoice_id: invoice.id,
          description: d.description,
          quantity: d.quantity,
          rate: d.rate,
          line_amount: d.line_amount,
          source_type: d.source_type,
          source_id: d.source_id,
        }))
      )
      .select("id, source_type, source_id");

    if (lineError || !lineItems) {
      errors.push(`${contract.name}: invoice ${invoice.invoice_number} created but line items failed.`);
      continue;
    }

    const lineBySource = new Map(lineItems.map((li) => [`${li.source_type}:${li.source_id}`, li.id]));

    if (!monthlyAlreadyBilled) {
      const billableTimeIds = (timeEntries ?? [])
        .filter(
          (entry) =>
            ["included", "billable"].includes(entry.classification) &&
            (entry.classification === "included" || ["approved", "not_required"].includes(entry.approval_status)) &&
            entry.billing_status !== "billed"
        )
        .map((entry) => entry.id);

      if (billableTimeIds.length > 0) {
        await supabase.from("time_entries").update({ billing_status: "billed" }).in("id", billableTimeIds);
      }
    }

    for (const project of projects ?? []) {
      const amount = round2(Number(project.fixed_fee || project.estimated_billing_amount || 0));
      await supabase
        .from("projects")
        .update({
          billing_status: "billed",
          status: "billed",
          amount_billed: Number(project.amount_billed ?? 0) + amount,
        })
        .eq("id", project.id);
    }

    for (const milestone of milestones ?? []) {
      await supabase
        .from("project_milestones")
        .update({
          billing_status: "billed",
          invoice_line_item_id: lineBySource.get(`milestone:${milestone.id}`) ?? null,
        })
        .eq("id", milestone.id);
    }

    for (const cost of directCosts ?? []) {
      await supabase
        .from("direct_costs")
        .update({
          billing_status: "billed",
          invoice_line_item_id: lineBySource.get(`direct_cost:${cost.id}`) ?? null,
        })
        .eq("id", cost.id);
    }

    const recognition = contract.billing_timing === "in_advance" ? "deferred" : "earned";
    if (!monthlyAlreadyBilled && usage.monthlyFee > 0) {
      await supabase.from("revenue_records").insert({
        customer_id: contract.customer_id,
        contract_id: contract.id,
        period_month: periodStart,
        revenue_type: "recurring",
        recognition,
        amount: usage.monthlyFee,
        description: `${contract.name} monthly support invoiced for ${periodLabel}`,
        source_type: "invoice",
        source_id: invoice.id,
      });
    }
    if (!monthlyAlreadyBilled && usage.overageCharge > 0) {
      await supabase.from("revenue_records").insert({
        customer_id: contract.customer_id,
        contract_id: contract.id,
        period_month: periodStart,
        revenue_type: "additional_support",
        recognition: "earned",
        amount: usage.overageCharge,
        description: `${contract.name} overage hours invoiced for ${periodLabel}`,
        source_type: "invoice",
        source_id: invoice.id,
      });
    }

    for (const project of projects ?? []) {
      const amount = round2(Number(project.fixed_fee || project.estimated_billing_amount || 0));
      if (amount <= 0) continue;
      await supabase.from("revenue_records").insert({
        customer_id: contract.customer_id,
        contract_id: contract.id,
        period_month: periodStart,
        revenue_type: "project",
        recognition: "earned",
        amount,
        description: `Approved project ${project.name} invoiced for ${periodLabel}`,
        source_type: "invoice",
        source_id: invoice.id,
      });
    }

    for (const milestone of milestones ?? []) {
      const amount = round2(Number(milestone.amount ?? 0));
      if (amount <= 0) continue;
      const project = Array.isArray(milestone.projects) ? milestone.projects[0] : milestone.projects;
      await supabase.from("revenue_records").insert({
        customer_id: contract.customer_id,
        contract_id: contract.id,
        period_month: periodStart,
        revenue_type: "project",
        recognition: "earned",
        amount,
        description: `Approved milestone ${project?.name ?? "Project"} — ${milestone.name} invoiced for ${periodLabel}`,
        source_type: "invoice",
        source_id: invoice.id,
      });
    }

    for (const cost of directCosts ?? []) {
      const amount = round2(Number(cost.billable_amount ?? 0));
      if (amount <= 0) continue;
      await supabase.from("revenue_records").insert({
        customer_id: contract.customer_id,
        contract_id: contract.id,
        period_month: periodStart,
        revenue_type: "software_equipment",
        recognition: "earned",
        amount,
        description: `Approved ${cost.cost_category} charge invoiced for ${periodLabel}: ${cost.description}`,
        source_type: "invoice",
        source_id: invoice.id,
      });
    }

    created.push({
      invoiceNumber: invoice.invoice_number,
      contractName: contract.name,
      total: Number(invoice.total_amount),
    });
  }

  return NextResponse.json({ created, skipped, errors, periodLabel });
}
