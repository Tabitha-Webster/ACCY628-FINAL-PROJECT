import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

type RequestedItem = {
  type: "time_entry" | "direct_cost" | "project" | "milestone" | "recurring";
  id: string;
};

function parsePaymentTermsDays(paymentTerms: string | null | undefined): number {
  if (!paymentTerms) return 30;
  const match = paymentTerms.match(/(\d+)/);
  if (!match) return 30;
  const days = Number(match[1]);
  return Number.isFinite(days) && days > 0 ? days : 30;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function generateInvoiceNumber(): string {
  const today = new Date();
  const stamp = today.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `INV-${stamp}-${suffix}`;
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!["manager", "billing"].includes(profile.role)) {
    return NextResponse.json({ error: "Only billing and manager roles can generate invoices." }, { status: 403 });
  }

  let body: { customerId?: string; items?: RequestedItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const customerId = body.customerId;
  const items = body.items;

  if (!customerId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Select at least one item to bill." }, { status: 400 });
  }

  const timeEntryIds = items.filter((i) => i.type === "time_entry").map((i) => i.id);
  const directCostIds = items.filter((i) => i.type === "direct_cost").map((i) => i.id);
  const projectIds = items.filter((i) => i.type === "project").map((i) => i.id);
  const milestoneIds = items.filter((i) => i.type === "milestone").map((i) => i.id);
  const recurringIds = items.filter((i) => i.type === "recurring").map((i) => i.id);

  const supabase = await createClient();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, name")
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) {
    return NextResponse.json({ error: customerError.message }, { status: 500 });
  }
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const now = new Date();
  const billingPeriodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const billingPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [timeEntriesRes, directCostsRes, projectsRes, milestonesRes, contractsRes] = await Promise.all([
    timeEntryIds.length > 0
      ? supabase
          .from("time_entries")
          .select(
            "id, customer_id, contract_id, support_ticket_id, technician_id, work_date, hours_worked, billing_rate, description, classification, approval_status, billing_status, invoice_id, invoice_line_item_id, billed_at"
          )
          .in("id", timeEntryIds)
      : Promise.resolve({ data: [], error: null }),
    directCostIds.length > 0
      ? supabase
          .from("direct_costs")
          .select(
            "id, customer_id, contract_id, support_ticket_id, entered_by, cost_category, cost_date, billable_amount, description, approval_status, billing_status, invoice_id, invoice_line_item_id, billed_at"
          )
          .in("id", directCostIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length > 0
      ? supabase
          .from("projects")
          .select("id, customer_id, contract_id, name, fixed_fee, estimated_billing_amount, status, billing_status, amount_billed")
          .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    milestoneIds.length > 0
      ? supabase
          .from("project_milestones")
          .select("id, name, amount, completed, approval_status, billing_status, project_id, projects(id, customer_id, contract_id, name)")
          .in("id", milestoneIds)
      : Promise.resolve({ data: [], error: null }),
    recurringIds.length > 0
      ? supabase
          .from("contracts")
          .select("id, customer_id, name, status, monthly_recurring_fee, billing_timing, payment_terms")
          .in("id", recurringIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (timeEntriesRes.error) return NextResponse.json({ error: timeEntriesRes.error.message }, { status: 500 });
  if (directCostsRes.error) return NextResponse.json({ error: directCostsRes.error.message }, { status: 500 });
  if (projectsRes.error) return NextResponse.json({ error: projectsRes.error.message }, { status: 500 });
  if (milestonesRes.error) return NextResponse.json({ error: milestonesRes.error.message }, { status: 500 });
  if (contractsRes.error) return NextResponse.json({ error: contractsRes.error.message }, { status: 500 });

  const timeEntries = timeEntriesRes.data ?? [];
  const directCosts = directCostsRes.data ?? [];
  const projects = projectsRes.data ?? [];
  const milestones = milestonesRes.data ?? [];
  const recurringContracts = contractsRes.data ?? [];

  const conflicts: string[] = [];

  if (timeEntries.length !== timeEntryIds.length) conflicts.push("One or more time entries could not be found.");
  if (directCosts.length !== directCostIds.length) conflicts.push("One or more direct costs could not be found.");
  if (projects.length !== projectIds.length) conflicts.push("One or more projects could not be found.");
  if (milestones.length !== milestoneIds.length) conflicts.push("One or more milestones could not be found.");
  if (recurringContracts.length !== recurringIds.length) conflicts.push("One or more recurring fees could not be found.");

  for (const entry of timeEntries) {
    if (entry.customer_id !== customerId) conflicts.push(`Time entry ${entry.id} belongs to a different customer.`);
    if (entry.classification === "out_of_scope")
      conflicts.push(`Time entry on ${entry.work_date} is out of scope and cannot be billed without approval.`);
    if (entry.classification !== "billable") conflicts.push(`Time entry on ${entry.work_date} is not classified as billable.`);
    if (!["approved", "not_required"].includes(entry.approval_status))
      conflicts.push(`Time entry on ${entry.work_date} is not approved for billing.`);
    if (!["unbilled", "ready"].includes(entry.billing_status) || entry.invoice_id || entry.invoice_line_item_id || entry.billed_at)
      conflicts.push(`Time entry on ${entry.work_date} has already been billed.`);
    if (entry.support_ticket_id) {
      const { data: eligible, error: eligError } = await supabase.rpc("time_entry_ticket_billing_eligible", {
        p_entry_id: entry.id,
      });
      if (eligError) conflicts.push(`Could not verify ticket billing eligibility for ${entry.work_date}: ${eligError.message}`);
      else if (!eligible)
        conflicts.push(
          `Time entry on ${entry.work_date} is linked to a ticket but is not eligible to bill (incomplete ticket, missing notes, unapproved OOS, invalid contract date, or missing links).`
        );
    }
  }
  for (const cost of directCosts) {
    if (cost.customer_id !== customerId) conflicts.push(`Direct cost ${cost.id} belongs to a different customer.`);
    if (cost.approval_status !== "approved") conflicts.push(`Direct cost "${cost.description}" is not approved for billing.`);
    if (!["unbilled", "ready"].includes(cost.billing_status) || cost.invoice_id || cost.invoice_line_item_id || cost.billed_at)
      conflicts.push(`Direct cost "${cost.description}" has already been billed.`);
    if (cost.support_ticket_id) {
      const { data: eligible, error: eligError } = await supabase.rpc("direct_cost_ticket_billing_eligible", {
        p_cost_id: cost.id,
      });
      if (eligError) conflicts.push(`Could not verify ticket cost eligibility: ${eligError.message}`);
      else if (!eligible)
        conflicts.push(
          `Direct cost "${cost.description}" is linked to a ticket but is not eligible to bill.`
        );
    }
  }
  for (const project of projects) {
    if (project.customer_id !== customerId) conflicts.push(`Project ${project.id} belongs to a different customer.`);
    if (!["completed", "approved"].includes(project.status))
      conflicts.push(`Project "${project.name}" is not completed or approved for billing.`);
    if (!["unbilled", "ready"].includes(project.billing_status ?? "unbilled"))
      conflicts.push(`Project "${project.name}" has already been billed.`);
  }
  for (const milestone of milestones) {
    const project = Array.isArray(milestone.projects) ? milestone.projects[0] : milestone.projects;
    if (!project || project.customer_id !== customerId)
      conflicts.push(`Milestone "${milestone.name}" belongs to a different customer.`);
    if (!milestone.completed) conflicts.push(`Milestone "${milestone.name}" is not completed.`);
    if (!["approved", "not_required"].includes(milestone.approval_status))
      conflicts.push(`Milestone "${milestone.name}" is not approved for billing.`);
    if (!["unbilled", "ready"].includes(milestone.billing_status ?? "unbilled"))
      conflicts.push(`Milestone "${milestone.name}" has already been billed.`);
  }
  for (const contract of recurringContracts) {
    if (contract.customer_id !== customerId) conflicts.push(`Contract "${contract.name}" belongs to a different customer.`);
    if (contract.status !== "active") conflicts.push(`Contract "${contract.name}" is not active.`);
    if (Number(contract.monthly_recurring_fee ?? 0) <= 0)
      conflicts.push(`Contract "${contract.name}" has no monthly fee to bill.`);
  }

  if (recurringIds.length > 0) {
    const { data: existingRecurringLines } = await supabase
      .from("invoice_line_items")
      .select("source_id, invoice_id")
      .eq("source_type", "recurring")
      .in("source_id", recurringIds);
    const invoiceIds = Array.from(new Set((existingRecurringLines ?? []).map((row) => row.invoice_id)));
    if (invoiceIds.length > 0) {
      const { data: existingInvoices } = await supabase
        .from("invoices")
        .select("id, status, billing_period_start")
        .in("id", invoiceIds);
      const billedThisPeriod = new Set(
        (existingInvoices ?? [])
          .filter((inv) => inv.status !== "canceled" && inv.billing_period_start === billingPeriodStart)
          .map((inv) => inv.id)
      );
      for (const line of existingRecurringLines ?? []) {
        if (billedThisPeriod.has(line.invoice_id)) {
          conflicts.push("That monthly support fee was already billed for this period.");
        }
      }
    }
  }

  if (conflicts.length > 0) {
    return NextResponse.json({ error: "Some selected items cannot be billed.", conflicts }, { status: 409 });
  }

  type LineItemDraft = {
    description: string;
    quantity: number;
    rate: number;
    line_amount: number;
    source_type: string;
    source_id: string;
    contract_id: string | null;
  };

  const drafts: LineItemDraft[] = [];

  for (const entry of timeEntries) {
    const rate = Number(entry.billing_rate ?? 0);
    const hours = Number(entry.hours_worked ?? 0);
    drafts.push({
      description: `${entry.description} (${hours.toFixed(1)} hrs on ${entry.work_date})`,
      quantity: hours,
      rate,
      line_amount: hours * rate,
      source_type: "time_entry",
      source_id: entry.id,
      contract_id: entry.contract_id,
    });
  }
  for (const cost of directCosts) {
    const amount = Number(cost.billable_amount ?? 0);
    drafts.push({
      description: `${cost.description}`,
      quantity: 1,
      rate: amount,
      line_amount: amount,
      source_type: "direct_cost",
      source_id: cost.id,
      contract_id: cost.contract_id,
    });
  }
  for (const project of projects) {
    const amount = Number(project.fixed_fee || project.estimated_billing_amount || 0);
    drafts.push({
      description: `Project: ${project.name}`,
      quantity: 1,
      rate: amount,
      line_amount: amount,
      source_type: "project",
      source_id: project.id,
      contract_id: project.contract_id,
    });
  }
  for (const milestone of milestones) {
    const project = Array.isArray(milestone.projects) ? milestone.projects[0] : milestone.projects;
    const amount = Number(milestone.amount ?? 0);
    drafts.push({
      description: `Milestone: ${project?.name ?? "Project"} — ${milestone.name}`,
      quantity: 1,
      rate: amount,
      line_amount: amount,
      source_type: "milestone",
      source_id: milestone.id,
      contract_id: project?.contract_id ?? null,
    });
  }
  for (const contract of recurringContracts) {
    const amount = Number(contract.monthly_recurring_fee ?? 0);
    drafts.push({
      description: `${contract.name} monthly support fee (${billingPeriodStart} to ${billingPeriodEnd})`,
      quantity: 1,
      rate: amount,
      line_amount: amount,
      source_type: "recurring",
      source_id: contract.id,
      contract_id: contract.id,
    });
  }

  const subtotal = drafts.reduce((sum, d) => sum + d.line_amount, 0);
  if (subtotal <= 0) {
    return NextResponse.json({ error: "An invoice must have a positive total." }, { status: 400 });
  }
  const distinctContractIds = Array.from(new Set(drafts.map((d) => d.contract_id).filter((c): c is string => !!c)));
  const contractId = distinctContractIds.length === 1 ? distinctContractIds[0] : null;

  let paymentTerms: string | null = null;
  if (contractId) {
    const { data: contract } = await supabase.from("contracts").select("payment_terms").eq("id", contractId).maybeSingle();
    paymentTerms = contract?.payment_terms ?? null;
  }

  const invoiceDate = new Date().toISOString().slice(0, 10);
  const dueDate = addDays(invoiceDate, parsePaymentTermsDays(paymentTerms));

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      invoice_number: generateInvoiceNumber(),
      customer_id: customerId,
      contract_id: contractId,
      invoice_date: invoiceDate,
      due_date: dueDate,
      status: "issued",
      billing_period_start: billingPeriodStart,
      billing_period_end: billingPeriodEnd,
      subtotal,
      tax_amount: 0,
      credits: 0,
      total_amount: subtotal,
      amount_paid: 0,
      remaining_balance: subtotal,
      generated_by: profile.id,
      generated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: invoiceError?.message ?? "Failed to create invoice." }, { status: 500 });
  }

  const { data: lineItems, error: lineItemsError } = await supabase
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
    .select();

  if (lineItemsError || !lineItems) {
    return NextResponse.json(
      { error: lineItemsError?.message ?? "Invoice created, but line items failed to save." },
      { status: 500 }
    );
  }

  const lineItemBySource = new Map<string, string>(lineItems.map((li) => [`${li.source_type}:${li.source_id}`, li.id]));
  const updateErrors: string[] = [];

  for (const entry of timeEntries) {
    const lineItemId = lineItemBySource.get(`time_entry:${entry.id}`) ?? null;
    const { error } = await supabase.rpc("mark_time_entry_billed", {
      p_entry_id: entry.id,
      p_invoice_id: invoice.id,
      p_line_item_id: lineItemId,
    });
    if (error) updateErrors.push(error.message);
  }
  for (const cost of directCosts) {
    const lineItemId = lineItemBySource.get(`direct_cost:${cost.id}`) ?? null;
    const { error } = await supabase.rpc("mark_direct_cost_billed", {
      p_cost_id: cost.id,
      p_invoice_id: invoice.id,
      p_line_item_id: lineItemId,
    });
    if (error) updateErrors.push(error.message);
  }
  for (const project of projects) {
    const draft = drafts.find((d) => d.source_type === "project" && d.source_id === project.id);
    const { error } = await supabase
      .from("projects")
      .update({
        billing_status: "billed",
        status: "billed",
        amount_billed: Number(project.amount_billed ?? 0) + Number(draft?.line_amount ?? 0),
      })
      .eq("id", project.id)
      .neq("billing_status", "billed");
    if (error) updateErrors.push(error.message);
  }
  for (const milestone of milestones) {
    const lineItemId = lineItemBySource.get(`milestone:${milestone.id}`) ?? null;
    const { error } = await supabase
      .from("project_milestones")
      .update({ billing_status: "billed", invoice_line_item_id: lineItemId })
      .eq("id", milestone.id)
      .neq("billing_status", "billed");
    if (error) updateErrors.push(error.message);
  }
  for (const contract of recurringContracts) {
    const amount = Number(contract.monthly_recurring_fee ?? 0);
    const recognition = contract.billing_timing === "in_advance" ? "deferred" : "earned";
    const { error } = await supabase.from("revenue_records").insert({
      customer_id: customerId,
      contract_id: contract.id,
      period_month: billingPeriodStart,
      revenue_type: "recurring",
      recognition,
      amount,
      description: `${contract.name} monthly support invoiced for ${billingPeriodStart}`,
      source_type: "invoice",
      source_id: invoice.id,
    });
    if (error) updateErrors.push(error.message);
  }

  return NextResponse.json({
    invoice: { id: invoice.id, invoiceNumber: invoice.invoice_number, totalAmount: invoice.total_amount },
    warnings: updateErrors.length > 0 ? updateErrors : undefined,
  });
}
